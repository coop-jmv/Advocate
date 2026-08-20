import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseBulkCauseList } from "@/lib/cause-list-parse";
import {
  matchCauseListRecord,
  type MatchStatus,
  type RecordToMatch,
} from "@/lib/cause-list-matching";
import {
  detectChanges,
  findRemovedReferences,
  type ComparableRecord,
} from "@/lib/cause-list-changes";
import type { Database } from "@/integrations/supabase/types";

// Tenant-scoped cause-list CRUD, ingestion and matching. Same trust model as
// matters.functions.ts/diary.functions.ts: tenant_id is never accepted from
// the client, RLS derives and enforces it. No AI is involved anywhere in
// this file — matching, change detection and reconciliation are pure,
// explainable logic (see cause-list-matching.ts / cause-list-changes.ts).

type CauseListRecordRow = Database["public"]["Tables"]["cause_list_records"]["Row"];
type CauseListMatchRow = Database["public"]["Tables"]["cause_list_matches"]["Row"];

function toComparable(row: {
  list_date: string;
  serial_number: string | null;
  court_hall: string | null;
  bench: string | null;
  stage: string | null;
}): ComparableRecord {
  return {
    listDate: row.list_date,
    serialNumber: row.serial_number,
    courtHall: row.court_hall,
    bench: row.bench,
    stage: row.stage,
  };
}

function normalizeCnrKey(raw: string): string {
  return raw.toUpperCase().replace(/\s+/g, "");
}

export const listCauseListSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("cause_list_sources")
      .select(
        "id, court, bench, list_type, source_type, enabled, last_sync_at, last_attempt_at, sync_status, error_message, created_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createCauseListSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        court: z.string().min(2),
        bench: z.string().optional(),
        listType: z.enum(["daily", "supplementary", "special"]).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: saved, error } = await context.supabase
      .from("cause_list_sources")
      .insert({
        court: data.court,
        bench: data.bench ?? null,
        list_type: data.listType ?? "daily",
        source_type: "manual_import",
        created_by: context.userId,
      })
      .select(
        "id, court, bench, list_type, source_type, enabled, last_sync_at, last_attempt_at, sync_status, error_message, created_at",
      )
      .single();
    if (error) throw new Error(error.message);
    return saved;
  });

export const setCauseListSourceEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("cause_list_sources")
      .update({ enabled: data.enabled })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Finds (or creates) the hearing this cause-list listing reconciles to,
// touching only source-derived fields. matter_title/purpose/status are set
// on create only — an advocate's own edits to those on an existing hearing
// are never overwritten by a later re-ingestion of the same listing.
async function reconcileHearing(
  supabase: SupabaseClient<Database>,
  userId: string,
  record: CauseListRecordRow,
  matterId: string,
  matterTitle: string,
) {
  const { data: priorVersionIds } = await supabase
    .from("cause_list_records")
    .select("id")
    .eq("source_id", record.source_id)
    .eq("source_reference", record.source_reference);
  const versionIds = (priorVersionIds ?? []).map((r) => r.id);

  const { data: existingHearing } = await supabase
    .from("hearings")
    .select("id")
    .in("cause_list_record_id", versionIds.length > 0 ? versionIds : [record.id])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingHearing) {
    await supabase
      .from("hearings")
      .update({
        matter_id: matterId,
        hearing_date: record.list_date,
        court: record.court,
        court_hall: record.court_hall,
        bench: record.bench,
        cnr: record.cnr,
        cause_list_record_id: record.id,
      })
      .eq("id", existingHearing.id);
    return;
  }

  await supabase.from("hearings").insert({
    matter_id: matterId,
    matter_title: matterTitle,
    court: record.court,
    hearing_date: record.list_date,
    hearing_time: null,
    purpose: record.stage,
    status: "confirmed",
    court_hall: record.court_hall,
    bench: record.bench,
    cnr: record.cnr,
    cause_list_record_id: record.id,
    created_by: userId,
  });
}

export const ingestCauseList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        sourceId: z.string().uuid(),
        listDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        pastedText: z.string().min(1),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const now = new Date().toISOString();

    const { data: source, error: sourceError } = await supabase
      .from("cause_list_sources")
      .select("*")
      .eq("id", data.sourceId)
      .single();
    if (sourceError) throw new Error(sourceError.message);
    if (!source.enabled) {
      throw new Error("This cause-list source is disabled — enable it before importing a list.");
    }

    const { rows, errors: parseErrors } = parseBulkCauseList(data.pastedText, data.listDate);

    // De-duplicate by source_reference within this one paste — a later
    // occurrence wins, earlier ones are reported rather than silently
    // dropped, since two rows resolving to the same reference usually means
    // the paste contained the same case twice (e.g. listed once, mentioned
    // again in a note).
    const dedupedByRef = new Map<string, (typeof rows)[number]>();
    const duplicateLines: number[] = [];
    for (const row of rows) {
      if (dedupedByRef.has(row.sourceReference)) duplicateLines.push(row.line);
      dedupedByRef.set(row.sourceReference, row);
    }
    const dedupedRows = [...dedupedByRef.values()];
    const currentReferences = new Set(dedupedRows.map((r) => r.sourceReference));

    if (dedupedRows.length === 0) {
      await supabase
        .from("cause_list_sources")
        .update({
          last_attempt_at: now,
          sync_status: "failed",
          error_message: "No usable rows found in the pasted text.",
        })
        .eq("id", source.id);
      return {
        sourceId: source.id,
        listDate: data.listDate,
        totalRows: 0,
        newCount: 0,
        changedCount: 0,
        unchangedCount: 0,
        removedCount: 0,
        matchedCount: 0,
        needsReviewCount: 0,
        unmatchedCount: 0,
        parseErrors,
      };
    }

    const [{ data: matters, error: mattersError }, { data: profile }] = await Promise.all([
      supabase.from("matters").select("id, title, case_number, court, opposing_party").limit(500),
      supabase.from("profiles").select("full_name").eq("id", context.userId).maybeSingle(),
    ]);
    if (mattersError) throw new Error(mattersError.message);
    const candidates = (matters ?? []).map((m) => ({
      id: m.id,
      title: m.title,
      caseNumber: m.case_number,
      court: m.court,
      opposingParty: m.opposing_party,
    }));
    const advocateName = profile?.full_name ?? null;

    const { data: headRecords, error: headError } = await supabase
      .from("cause_list_records")
      .select("*")
      .eq("source_id", source.id)
      .in("source_reference", [...currentReferences])
      .is("superseded_by", null);
    if (headError) throw new Error(headError.message);
    const headByRef = new Map((headRecords ?? []).map((r) => [r.source_reference, r]));

    const headIds = (headRecords ?? []).map((r) => r.id);
    const { data: headMatches } = headIds.length
      ? await supabase.from("cause_list_matches").select("*").in("record_id", headIds)
      : { data: [] as CauseListMatchRow[] };
    const matchByRecordId = new Map((headMatches ?? []).map((m) => [m.record_id, m]));

    // Every already-matched CNR this tenant has ever confirmed (auto tier-1/2
    // or manual), most recent first — this is tier 1 for a CNR the engine
    // has never seen tied to *this* source_reference before (e.g. the case
    // moved to a different bench's list).
    const { data: matchedCnrRows } = await supabase
      .from("cause_list_matches")
      .select("matter_id, created_at, cause_list_records!inner(cnr)")
      .eq("status", "matched")
      .not("cause_list_records.cnr", "is", null)
      .order("created_at", { ascending: false });
    const priorCnrMap = new Map<string, string>();
    for (const row of matchedCnrRows ?? []) {
      const cnr = (row as unknown as { cause_list_records: { cnr: string | null } })
        .cause_list_records.cnr;
      if (!cnr) continue;
      const key = normalizeCnrKey(cnr);
      if (!priorCnrMap.has(key)) priorCnrMap.set(key, row.matter_id!);
    }

    let newCount = 0;
    let changedCount = 0;
    let unchangedCount = 0;
    let matchedCount = 0;
    let needsReviewCount = 0;
    let unmatchedCount = 0;

    for (const row of dedupedRows) {
      const previous = headByRef.get(row.sourceReference) ?? null;
      const previousMatch = previous ? (matchByRecordId.get(previous.id) ?? null) : null;

      const current: ComparableRecord = {
        listDate: data.listDate,
        serialNumber: row.serialNumber,
        courtHall: row.courtHall,
        bench: source.bench,
        stage: row.stage,
      };
      const changes = detectChanges(previous ? toComparable(previous) : null, current);
      if (!previous) newCount++;
      else if (changes.some((c) => c.changeType !== "unchanged")) changedCount++;
      else unchangedCount++;

      const { data: newRecord, error: insertError } = await supabase
        .from("cause_list_records")
        .insert({
          source_id: source.id,
          list_date: data.listDate,
          court: source.court,
          bench: source.bench,
          list_type: source.list_type,
          serial_number: row.serialNumber,
          case_number: row.caseNumber,
          cnr: row.cnr,
          petitioner: row.petitioner,
          respondent: row.respondent,
          advocate_names: row.advocateNames,
          stage: row.stage,
          court_hall: row.courtHall,
          source_reference: row.sourceReference,
          raw_payload: row,
          created_by: context.userId,
        })
        .select("*")
        .single();
      if (insertError) throw new Error(insertError.message);

      if (previous) {
        await supabase
          .from("cause_list_records")
          .update({ superseded_by: newRecord.id })
          .eq("id", previous.id);
      }

      if (changes.length > 0) {
        await supabase.from("cause_list_changes").insert(
          changes.map((c) => ({
            record_id: newRecord.id,
            previous_record_id: previous?.id ?? null,
            change_type: c.changeType,
            field_name: c.fieldName,
            old_value: c.oldValue,
            new_value: c.newValue,
          })),
        );
      }

      let matchResult: {
        matterId: string | null;
        method: string;
        confidence: number;
        status: MatchStatus;
      };
      if (previousMatch?.status === "matched" && previousMatch.matter_id) {
        matchResult = {
          matterId: previousMatch.matter_id,
          method: previousMatch.match_method,
          confidence: previousMatch.confidence,
          status: "matched",
        };
      } else {
        const recordToMatch: RecordToMatch = {
          caseNumber: row.caseNumber,
          cnr: row.cnr,
          court: source.court,
          petitioner: row.petitioner,
          respondent: row.respondent,
          advocateNames: row.advocateNames,
        };
        const priorCnrMatterId = row.cnr
          ? (priorCnrMap.get(normalizeCnrKey(row.cnr)) ?? null)
          : null;
        matchResult = matchCauseListRecord(
          recordToMatch,
          candidates,
          priorCnrMatterId,
          advocateName,
        );
      }

      if (matchResult.status === "matched") matchedCount++;
      else if (matchResult.status === "needs_review") needsReviewCount++;
      else unmatchedCount++;

      const carryReview = previousMatch?.status === "matched";
      await supabase.from("cause_list_matches").insert({
        record_id: newRecord.id,
        matter_id: matchResult.matterId,
        match_method: matchResult.method,
        confidence: matchResult.confidence,
        status: matchResult.status,
        reviewed_by: carryReview ? previousMatch!.reviewed_by : null,
        reviewed_at: carryReview ? previousMatch!.reviewed_at : null,
      });

      if (matchResult.status === "matched" && matchResult.matterId) {
        const matter = candidates.find((m) => m.id === matchResult.matterId);
        if (matter) {
          await reconcileHearing(supabase, context.userId, newRecord, matter.id, matter.title);
        }
      }
    }

    const removedRefs = findRemovedReferences([...headByRef.keys()], currentReferences);
    for (const ref of removedRefs) {
      const record = headByRef.get(ref)!;
      await supabase.from("cause_list_changes").insert({
        record_id: record.id,
        previous_record_id: null,
        change_type: "removed",
        field_name: null,
        old_value: null,
        new_value: null,
      });
    }

    const errorSummary =
      duplicateLines.length > 0 || parseErrors.length > 0
        ? `${parseErrors.length} row(s) skipped, ${duplicateLines.length} duplicate reference(s) collapsed to their last occurrence.`
        : null;

    await supabase
      .from("cause_list_sources")
      .update({
        last_sync_at: now,
        last_attempt_at: now,
        sync_status: parseErrors.length > 0 ? "partial" : "success",
        error_message: errorSummary,
      })
      .eq("id", source.id);

    return {
      sourceId: source.id,
      listDate: data.listDate,
      totalRows: dedupedRows.length,
      newCount,
      changedCount,
      unchangedCount,
      removedCount: removedRefs.length,
      matchedCount,
      needsReviewCount,
      unmatchedCount,
      parseErrors,
    };
  });

// Every currently-live listing (the "head" of each source_reference chain)
// across a date range, joined with its match and — if matched — its
// reconciled hearing. Powers both the Cause List Intelligence table and the
// "My Matters in Today's Cause List" focused view (the client filters this
// same list down to status === "matched").
export const listCauseListEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: records, error: recordsError } = await supabase
      .from("cause_list_records")
      .select(
        "id, source_id, list_date, court, bench, serial_number, case_number, cnr, petitioner, respondent, advocate_names, stage, court_hall, source_reference, created_at, cause_list_sources(court, bench)",
      )
      .eq("list_date", data.date)
      .is("superseded_by", null)
      .order("serial_number", { ascending: true, nullsFirst: false });
    if (recordsError) throw new Error(recordsError.message);

    const recordIds = (records ?? []).map((r) => r.id);
    const [{ data: matches }, { data: changesToday }, { data: hearings }] = await Promise.all([
      recordIds.length
        ? supabase.from("cause_list_matches").select("*").in("record_id", recordIds)
        : Promise.resolve({ data: [] as CauseListMatchRow[] }),
      recordIds.length
        ? supabase
            .from("cause_list_changes")
            .select("record_id, change_type")
            .in("record_id", recordIds)
            .neq("change_type", "unchanged")
        : Promise.resolve({ data: [] as { record_id: string; change_type: string }[] }),
      recordIds.length
        ? supabase
            .from("hearings")
            .select("id, cause_list_record_id, hearing_date, hearing_time, matter_id, matter_title")
            .in("cause_list_record_id", recordIds)
        : Promise.resolve({ data: [] as Database["public"]["Tables"]["hearings"]["Row"][] }),
    ]);

    const matchByRecordId = new Map((matches ?? []).map((m) => [m.record_id, m]));
    const changedRecordIds = new Set((changesToday ?? []).map((c) => c.record_id));
    const hearingByRecordId = new Map(
      (hearings ?? [])
        .filter((h) => h.cause_list_record_id)
        .map((h) => [h.cause_list_record_id!, h]),
    );

    const matterIds = [
      ...new Set((matches ?? []).map((m) => m.matter_id).filter((id): id is string => !!id)),
    ];
    const { data: matters } = matterIds.length
      ? await supabase.from("matters").select("id, title").in("id", matterIds)
      : { data: [] as { id: string; title: string }[] };
    const matterTitleById = new Map((matters ?? []).map((m) => [m.id, m.title]));

    const dayHearings = (hearings ?? []).filter((h) => h.hearing_date === data.date);
    const clashKeys = new Set<string>();
    const seenTimes = new Map<string, number>();
    for (const h of dayHearings) {
      if (!h.hearing_time) continue;
      const key = `${h.hearing_date}|${h.hearing_time}`;
      seenTimes.set(key, (seenTimes.get(key) ?? 0) + 1);
    }
    for (const [key, count] of seenTimes) if (count > 1) clashKeys.add(key);

    const entries = (records ?? []).map((r) => {
      const match = matchByRecordId.get(r.id) ?? null;
      const hearing = hearingByRecordId.get(r.id) ?? null;
      const hasConflict = !!(
        hearing?.hearing_time && clashKeys.has(`${hearing.hearing_date}|${hearing.hearing_time}`)
      );
      return {
        recordId: r.id,
        sourceId: r.source_id,
        court: r.court,
        bench: r.bench,
        serialNumber: r.serial_number,
        caseNumber: r.case_number,
        cnr: r.cnr,
        petitioner: r.petitioner,
        respondent: r.respondent,
        advocateNames: r.advocate_names,
        stage: r.stage,
        courtHall: r.court_hall,
        hasChangedToday: changedRecordIds.has(r.id),
        match: match
          ? {
              id: match.id,
              matterId: match.matter_id,
              matterTitle: match.matter_id ? (matterTitleById.get(match.matter_id) ?? null) : null,
              method: match.match_method,
              confidence: match.confidence,
              status: match.status,
            }
          : null,
        hearingId: hearing?.id ?? null,
        hasConflict,
      };
    });

    const summary = {
      total: entries.length,
      newOrChanged: entries.filter((e) => e.hasChangedToday).length,
      matched: entries.filter((e) => e.match?.status === "matched").length,
      needsReview: entries.filter((e) => e.match?.status === "needs_review").length,
      conflicts: entries.filter((e) => e.hasConflict).length,
    };

    return { date: data.date, entries, summary };
  });

export const matchMatterManually = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ matchId: z.string().uuid(), matterId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: match, error: matchError } = await supabase
      .from("cause_list_matches")
      .select("*")
      .eq("id", data.matchId)
      .single();
    if (matchError) throw new Error(matchError.message);

    const { data: matter, error: matterError } = await supabase
      .from("matters")
      .select("id, title")
      .eq("id", data.matterId)
      .single();
    if (matterError) throw new Error(matterError.message);

    const { error: updateError } = await supabase
      .from("cause_list_matches")
      .update({
        matter_id: data.matterId,
        match_method: "manual",
        confidence: 1,
        status: "matched",
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", match.id);
    if (updateError) throw new Error(updateError.message);

    const { data: record, error: recordError } = await supabase
      .from("cause_list_records")
      .select("*")
      .eq("id", match.record_id)
      .single();
    if (recordError) throw new Error(recordError.message);

    await reconcileHearing(supabase, context.userId, record, matter.id, matter.title);
    return { ok: true };
  });

export const rejectCauseListMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ matchId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("cause_list_matches")
      .update({
        matter_id: null,
        status: "rejected",
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.matchId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listCauseListChangeHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ sourceId: z.string().uuid(), sourceReference: z.string().min(1) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: versions, error: versionsError } = await supabase
      .from("cause_list_records")
      .select("id, list_date, created_at")
      .eq("source_id", data.sourceId)
      .eq("source_reference", data.sourceReference)
      .order("created_at", { ascending: true });
    if (versionsError) throw new Error(versionsError.message);

    const versionIds = (versions ?? []).map((v) => v.id);
    if (versionIds.length === 0) return [];

    const { data: changes, error: changesError } = await supabase
      .from("cause_list_changes")
      .select("id, record_id, change_type, field_name, old_value, new_value, detected_at")
      .in("record_id", versionIds)
      .order("detected_at", { ascending: true });
    if (changesError) throw new Error(changesError.message);
    return changes ?? [];
  });
