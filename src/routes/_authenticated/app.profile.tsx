import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Download, Loader2, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { Tag, type Tone } from "@/components/app/primitives";
import { confirmDestructive } from "@/lib/confirm";
import { supabase } from "@/integrations/supabase/client";
import { logAuthEvent } from "@/lib/edge-functions";
import {
  deleteMyAccount,
  exportChamberData,
  exportMyPersonalData,
  getMyProfile,
  grantMyConsent,
  listMyConsents,
  updateMyProfile,
  withdrawMyConsent,
} from "@/lib/profile.functions";

export const Route = createFileRoute("/_authenticated/app/profile")({
  head: () => ({
    meta: [
      { title: "Profile & privacy — LexDiary" },
      { name: "description", content: "Your account, consent and data rights under the DPDP Act." },
    ],
  }),
  component: Profile,
});

type ProfileData = {
  email: string | null;
  full_name: string | null;
  firm_name: string | null;
  enrolment_no: string | null;
  tenant_role: string;
  created_at: string;
};
type Consent = {
  purpose: string;
  notice_version: string;
  granted_at: string;
  withdrawn_at: string | null;
};

const purposeLabel: Record<string, string> = {
  service_provision: "Providing the service",
  ai_processing: "AI-assisted drafting, OCR and dictation",
  product_updates: "Product updates and announcements",
};

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function Profile() {
  const navigate = useNavigate();
  const loadProfile = useServerFn(getMyProfile);
  const saveProfile = useServerFn(updateMyProfile);
  const loadConsents = useServerFn(listMyConsents);
  const withdraw = useServerFn(withdrawMyConsent);
  const grant = useServerFn(grantMyConsent);
  const exportMine = useServerFn(exportMyPersonalData);
  const exportChamber = useServerFn(exportChamberData);
  const removeAccount = useServerFn(deleteMyAccount);

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [consents, setConsents] = useState<Consent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [firmName, setFirmName] = useState("");
  const [enrolmentNo, setEnrolmentNo] = useState("");

  const [exportingMine, setExportingMine] = useState(false);
  const [exportingChamber, setExportingChamber] = useState(false);
  const [consentBusy, setConsentBusy] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isAdmin = profile?.tenant_role === "owner" || profile?.tenant_role === "admin";

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const [p, c] = await Promise.all([loadProfile(), loadConsents()]);
      const pd = p as ProfileData;
      setProfile(pd);
      setFullName(pd.full_name ?? "");
      setFirmName(pd.firm_name ?? "");
      setEnrolmentNo(pd.enrolment_no ?? "");
      setConsents(c as Consent[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load your profile.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await saveProfile({ data: { fullName, firmName, enrolmentNo } });
      await reload();
      setNotice("Profile updated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to save your profile.");
    } finally {
      setSaving(false);
    }
  }

  async function handleConsentToggle(
    purpose: "ai_processing" | "product_updates",
    grantIt: boolean,
  ) {
    setConsentBusy(purpose);
    setError(null);
    setNotice(null);
    try {
      if (grantIt) await grant({ data: { purpose } });
      else await withdraw({ data: { purpose } });
      await reload();
      setNotice(grantIt ? "Consent recorded." : "Consent withdrawn.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to update consent.");
    } finally {
      setConsentBusy(null);
    }
  }

  async function handleExportMine() {
    setExportingMine(true);
    setError(null);
    try {
      const data = await exportMine();
      downloadJson(`lexdiary-my-data-${new Date().toISOString().slice(0, 10)}.json`, data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to export your data.");
    } finally {
      setExportingMine(false);
    }
  }

  async function handleExportChamber() {
    setExportingChamber(true);
    setError(null);
    try {
      const data = await exportChamber();
      downloadJson(`lexdiary-chamber-export-${new Date().toISOString().slice(0, 10)}.json`, data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to export the chamber's records.");
    } finally {
      setExportingChamber(false);
    }
  }

  async function handleDeleteAccount() {
    if (
      !confirmDestructive(
        "Delete your account? This permanently erases your login and, if you are the only person in your chamber, every matter, client, document and draft in it. This cannot be undone.",
      )
    )
      return;
    setDeleting(true);
    setError(null);
    try {
      await removeAccount();
      await supabase.auth.signOut();
      void navigate({ to: "/" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to delete your account.");
      setDeleting(false);
    }
  }

  async function handleSignOut() {
    await logAuthEvent({ event: "logout" });
    await supabase.auth.signOut();
    void navigate({ to: "/auth" });
  }

  const aiConsent = consents.find((c) => c.purpose === "ai_processing" && !c.withdrawn_at);
  const serviceConsent = consents.find((c) => c.purpose === "service_provision");

  return (
    <AppShell title="Profile & privacy" subtitle="Your account, consent and data rights">
      {error ? (
        <p className="mb-4 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mb-4 rounded border border-accent/30 bg-accent/10 px-3 py-2 text-sm">
          {notice}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px] [&>*]:min-w-0">
          <div className="space-y-6">
            <section className="surface-panel rounded p-5">
              <h2 className="font-display text-lg font-bold">Your details</h2>
              <form onSubmit={handleSave} className="mt-4 space-y-4">
                <label className="block text-sm">
                  <span className="text-eyebrow">Advocate name</span>
                  <input
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    required
                    className="mt-1.5 w-full rounded border border-input bg-background px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-eyebrow">Chamber / firm</span>
                  <input
                    value={firmName}
                    onChange={(event) => setFirmName(event.target.value)}
                    className="mt-1.5 w-full rounded border border-input bg-background px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-eyebrow">Bar Council enrolment number</span>
                  <input
                    value={enrolmentNo}
                    onChange={(event) => setEnrolmentNo(event.target.value)}
                    placeholder="MH/1234/2015"
                    className="mt-1.5 w-full rounded border border-input bg-background px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-eyebrow">Email</span>
                  <input
                    value={profile?.email ?? ""}
                    disabled
                    className="mt-1.5 w-full rounded border border-input bg-secondary/40 px-3 py-2 text-sm text-muted-foreground"
                  />
                </label>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-ink disabled:opacity-60"
                >
                  {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                  Save changes
                </button>
              </form>
            </section>

            <section className="surface-panel rounded p-5">
              <h2 className="flex items-center gap-2 font-display text-lg font-bold">
                <ShieldCheck className="size-4" />
                Consent
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Recorded against{" "}
                <a href="/privacy" target="_blank" rel="noreferrer" className="underline">
                  privacy notice
                </a>{" "}
                version {serviceConsent?.notice_version ?? "—"}.
              </p>

              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between rounded border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">{purposeLabel["service_provision"]}</p>
                    <p className="text-xs text-muted-foreground">
                      Required to use LexDiary — withdraw by deleting your account.
                    </p>
                  </div>
                  <Tag tone="success">Granted</Tag>
                </div>

                <div className="flex items-center justify-between rounded border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">{purposeLabel["ai_processing"]}</p>
                    <p className="text-xs text-muted-foreground">
                      OCR, drafting and dictation send text to the AI provider.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={consentBusy === "ai_processing"}
                    onClick={() => void handleConsentToggle("ai_processing", !aiConsent)}
                    className="shrink-0"
                  >
                    <Tag tone={aiConsent ? "success" : "neutral"}>
                      {consentBusy === "ai_processing" ? "…" : aiConsent ? "Granted" : "Withdrawn"}
                    </Tag>
                  </button>
                </div>
              </div>
            </section>

            <section className="surface-panel rounded border-destructive/30 p-5">
              <h2 className="flex items-center gap-2 font-display text-lg font-bold text-destructive">
                <AlertTriangle className="size-4" />
                Delete account
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Erases your login. If you are the sole member of your chamber, every matter, client,
                document and draft is erased with it. If others share your chamber, you must hand
                over ownership first.
              </p>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void handleDeleteAccount()}
                className="mt-4 flex items-center gap-2 rounded border border-destructive/40 px-4 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-60"
              >
                {deleting ? <Loader2 className="size-4 animate-spin" /> : null}
                Delete my account
              </button>
            </section>
          </div>

          <aside className="space-y-4">
            <section className="surface-panel rounded p-5">
              <h2 className="font-display text-sm font-bold">Export your data</h2>
              <p className="mt-2 text-xs text-muted-foreground">
                Everything LexDiary holds about you as a person — profile, consent history and
                account activity.
              </p>
              <button
                type="button"
                disabled={exportingMine}
                onClick={() => void handleExportMine()}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded border border-input px-3 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-60"
              >
                {exportingMine ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                Export my data
              </button>

              {isAdmin ? (
                <>
                  <div className="my-3 h-px bg-border" />
                  <p className="text-xs text-muted-foreground">
                    As {profile?.tenant_role}, you can also export every record your chamber holds —
                    matters, clients, hearings, invoices, documents and drafts.
                  </p>
                  <button
                    type="button"
                    disabled={exportingChamber}
                    onClick={() => void handleExportChamber()}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded border border-input px-3 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-60"
                  >
                    {exportingChamber ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Download className="size-4" />
                    )}
                    Export chamber records
                  </button>
                </>
              ) : null}
            </section>

            <section className="surface-panel rounded p-5">
              <h2 className="font-display text-sm font-bold">Account</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Role</dt>
                  <dd className="font-medium capitalize">{profile?.tenant_role}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Member since</dt>
                  <dd className="font-medium">
                    {profile?.created_at
                      ? new Date(profile.created_at).toLocaleDateString("en-IN")
                      : "—"}
                  </dd>
                </div>
              </dl>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="mt-4 w-full rounded border border-input px-3 py-2 text-sm font-medium hover:bg-secondary"
              >
                Sign out
              </button>
            </section>

            <section className="surface-panel rounded p-5">
              <h2 className="font-display text-sm font-bold">Questions about your data?</h2>
              <p className="mt-2 text-xs text-muted-foreground">
                Read the{" "}
                <a href="/privacy" target="_blank" rel="noreferrer" className="underline">
                  privacy notice
                </a>{" "}
                or contact the grievance officer named there.
              </p>
            </section>
          </aside>
        </div>
      )}
    </AppShell>
  );
}
