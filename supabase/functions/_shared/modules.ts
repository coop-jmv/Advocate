// 'ocr' and 'dictation' were retired into 'documents' and 'ai_drafting'
// respectively (20260826110000_feature_area_modules.sql) — both wrote into
// a table the merged-into module already owns (ai_documents, ai_drafts),
// and dictation had no entitlement check at all before the merge.
export type ModuleKey =
  | "ai_drafting"
  | "ai_assistant"
  | "matter_intelligence"
  | "matters"
  | "clients"
  | "diary"
  | "documents"
  | "billing";

const MODULE_LABELS: Record<ModuleKey, string> = {
  ai_drafting: "AI drafting (including dictation)",
  ai_assistant: "the AI case assistant",
  matter_intelligence: "AI matter intelligence",
  matters: "case/matter tracking",
  clients: "client management",
  diary: "the court diary",
  documents: "document intake (including OCR)",
  billing: "time tracking and billing",
};

// Modules the Free plan includes at no charge. Keep in sync with
// free_plan_module() in supabase/migrations/20260915090000_free_forever_plan.sql.
const FREE_PLAN_MODULES: ReadonlySet<ModuleKey> = new Set<ModuleKey>([
  "matters",
  "clients",
  "diary",
  "matter_intelligence",
  "ai_assistant",
]);

// Mirrors effective_plan() + module_enabled() in the database: an active trial
// unlocks everything, an ended trial is treated as Free, and Free includes
// FREE_PLAN_MODULES. Anything else needs its "{module}_enabled" flag.
function includedByPlan(
  license: { plan: string; trial_ends_at: string | null },
  moduleKey: ModuleKey,
): boolean {
  if (license.plan === "trial") {
    const trialActive = !license.trial_ends_at || new Date(license.trial_ends_at) > new Date();
    return trialActive || FREE_PLAN_MODULES.has(moduleKey);
  }
  return license.plan === "free" && FREE_PLAN_MODULES.has(moduleKey);
}

/**
 * Per-tenant paid-module gate. An active trial gets every module unlocked to
 * evaluate, and the Free plan (including an ended trial) gets
 * FREE_PLAN_MODULES — see includedByPlan() and
 * 20260915090000_free_forever_plan.sql. Otherwise a
 * module is available only once licenses.integrations has
 * "{module}_enabled": true set for it — opt-in, unlike the older governance
 * kill-switches (ai_morning_brief_enabled, ai_matter_intelligence_enabled,
 * ai_case_intelligence_enabled), which default to true and only ever turn a
 * feature OFF. Both kinds of flag live in the same JSONB column and can
 * coexist on the same feature: a kill-switch can still force a purchased
 * module off, but a kill-switch defaulting true never turns an unpurchased
 * module on. Toggled per tenant from /admin/settings/integrations.
 */
export async function requireModule(
  supabase: import("jsr:@supabase/supabase-js@2").SupabaseClient,
  userId: string,
  moduleKey: ModuleKey,
): Promise<void> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.tenant_id) throw new Error("No chamber found for this account.");

  const { data: license } = await supabase
    .from("licenses")
    .select("plan, trial_ends_at, integrations")
    .eq("tenant_id", profile.tenant_id)
    .maybeSingle();
  if (!license) throw new Error("No license found for this chamber.");
  if (includedByPlan(license, moduleKey)) return;

  const integrations = (license.integrations ?? {}) as Record<string, boolean | undefined>;
  if (integrations[`${moduleKey}_enabled`] === true) return;

  throw new Error(
    `${MODULE_LABELS[moduleKey]} isn't included on this chamber's plan yet — contact chambers@lexdiary.online to add it.`,
  );
}
