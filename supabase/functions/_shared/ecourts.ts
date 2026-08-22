// Vendor-agnostic e-Courts data client. There is no official Indian
// government API for third-party commercial use — NJDG/e-Courts third-party
// access is only via an "institutional litigant" data-sharing request, not a
// public developer API. What exists commercially is a small set of
// third-party providers who scrape/re-scrape services.ecourts.gov.in on the
// customer's behalf and resell it as an API. This file is deliberately
// swappable between them (ECOURTS_PROVIDER env var) so Phase 1 can be run
// against both as a real bake-off before committing to one for Phase 2/3.
//
// Coverage/pricing/reliability were NOT verified beyond public marketing
// pages and search results at the time this was written — treat the actual
// endpoint shapes below as best-effort until confirmed against a real
// account with each provider.

export type CaseSnapshot = {
  cnr: string;
  caseNumber: string | null;
  court: string | null;
  bench: string | null;
  parties: { petitioner: string | null; respondent: string | null };
  status: string | null;
  nextHearingDate: string | null;
  orders: { date: string; title: string; pdfUrl: string | null }[];
};

function normalizeCnr(cnr: string): string {
  return cnr.trim().toUpperCase();
}

async function lookupViaEcourtsIndia(cnr: string): Promise<CaseSnapshot> {
  const apiKey = Deno.env.get("ECOURTSINDIA_API_KEY");
  if (!apiKey) throw new Error("e-Courts lookup is not configured (missing eCourtsIndia API key).");

  // NOTE: exact endpoint path/shape not independently confirmed — their own
  // /api/docs page blocks automated fetching. This targets their documented
  // CNR-lookup capability; adjust once a real account confirms the contract.
  const response = await fetch(`https://ecourtsindia.com/api/v1/case-status/${encodeURIComponent(normalizeCnr(cnr))}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload && typeof payload === "object" ? JSON.stringify(payload) : response.statusText;
    throw new Error(`eCourtsIndia lookup failed (${response.status}): ${detail}`);
  }
  return {
    cnr: normalizeCnr(cnr),
    caseNumber: payload?.case_number ?? null,
    court: payload?.court_name ?? null,
    bench: payload?.bench ?? null,
    parties: {
      petitioner: payload?.petitioner ?? null,
      respondent: payload?.respondent ?? null,
    },
    status: payload?.case_status ?? null,
    nextHearingDate: payload?.next_hearing_date ?? null,
    orders: Array.isArray(payload?.orders)
      ? payload.orders.map((o: { date?: string; title?: string; pdf_url?: string }) => ({
          date: o.date ?? "",
          title: o.title ?? "Order",
          pdfUrl: o.pdf_url ?? null,
        }))
      : [],
  };
}

async function lookupViaVakeel360(cnr: string): Promise<CaseSnapshot> {
  const apiKey = Deno.env.get("VAKEEL360_API_KEY");
  if (!apiKey) throw new Error("e-Courts lookup is not configured (missing Vakeel360 API key).");

  const response = await fetch("https://vakeel360.com/api/v1/protected/case-search", {
    method: "POST",
    headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ cnr: normalizeCnr(cnr) }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload && typeof payload === "object" ? JSON.stringify(payload) : response.statusText;
    throw new Error(`Vakeel360 lookup failed (${response.status}): ${detail}`);
  }
  return {
    cnr: normalizeCnr(cnr),
    caseNumber: payload?.caseNumber ?? null,
    court: payload?.court ?? null,
    bench: payload?.bench ?? null,
    parties: {
      petitioner: payload?.petitioner ?? null,
      respondent: payload?.respondent ?? null,
    },
    status: payload?.status ?? null,
    nextHearingDate: payload?.nextHearingDate ?? null,
    orders: Array.isArray(payload?.orders)
      ? payload.orders.map((o: { date?: string; title?: string; pdfUrl?: string }) => ({
          date: o.date ?? "",
          title: o.title ?? "Order",
          pdfUrl: o.pdfUrl ?? null,
        }))
      : [],
  };
}

/**
 * Looks up a case by CNR through whichever provider ECOURTS_PROVIDER names.
 * This dispatch is the entire "swap vendors" mechanism — the rest of the app
 * only ever calls this one function and never knows which provider answered.
 */
export async function lookupByCnr(cnr: string): Promise<CaseSnapshot> {
  const provider = Deno.env.get("ECOURTS_PROVIDER") ?? "ecourtsindia";
  switch (provider) {
    case "ecourtsindia":
      return lookupViaEcourtsIndia(cnr);
    case "vakeel360":
      return lookupViaVakeel360(cnr);
    default:
      throw new Error(`Unknown ECOURTS_PROVIDER "${provider}".`);
  }
}

export function currentProviderName(): string {
  return Deno.env.get("ECOURTS_PROVIDER") ?? "ecourtsindia";
}
