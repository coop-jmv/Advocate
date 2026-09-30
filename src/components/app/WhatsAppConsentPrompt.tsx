import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MessageCircle, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getMyProfile, grantMyConsent, listMyConsents } from "@/lib/profile.functions";
import { getEntitlements } from "@/lib/team.functions";

// Asks once, on the dashboard, before any court-diary message goes to
// WhatsApp. Consent is DPDP-relevant (the number is shared with the WhatsApp
// provider), so it is only ever recorded from an explicit "Yes" here or on the
// Profile page — never assumed. Anyone who has already decided either way
// (any whatsapp_notifications consent row, granted or withdrawn) is never
// asked again, and "Not now" is remembered on the account.

type ConsentRow = { purpose: string; withdrawn_at: string | null };

function formatMobile(e164: string): string {
  const digits = e164.replace(/^\+91/, "");
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}

export function WhatsAppConsentPrompt() {
  const loadConsents = useServerFn(listMyConsents);
  const loadProfile = useServerFn(getMyProfile);
  const loadEntitlements = useServerFn(getEntitlements);
  const grant = useServerFn(grantMyConsent);

  const [visible, setVisible] = useState(false);
  const [phone, setPhone] = useState<string | null>(null);
  const [whatsappOnForChamber, setWhatsappOnForChamber] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (data.user?.user_metadata?.["whatsapp_prompt_dismissed_at"]) return;
        const [consents, profile, entitlements] = await Promise.all([
          loadConsents(),
          loadProfile(),
          loadEntitlements(),
        ]);
        const decided = (consents as ConsentRow[]).some((c) => c.purpose === "whatsapp_notifications");
        if (cancelled || decided) return;
        setPhone((profile as { phone: string | null }).phone);
        setWhatsappOnForChamber(Boolean((entitlements as { whatsapp_enabled?: boolean } | null)?.whatsapp_enabled));
        setVisible(true);
      } catch {
        // A prompt is never worth an error on the dashboard; just don't show it.
      }
    })();
    return () => {
      cancelled = true;
    };
    // The server-function wrappers are re-created every render; run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function allow() {
    setBusy(true);
    setError(null);
    try {
      await grant({ data: { purpose: "whatsapp_notifications" } });
      setDone(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't save your choice. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function notNow() {
    setVisible(false);
    await supabase.auth.updateUser({ data: { whatsapp_prompt_dismissed_at: new Date().toISOString() } });
  }

  if (!visible) return null;

  return (
    <section
      aria-labelledby="whatsapp-consent-heading"
      className="surface-panel relative mb-6 rounded border-l-4 border-docket-emerald p-5"
    >
      {!done ? (
        <button
          type="button"
          onClick={() => void notNow()}
          aria-label="Not now"
          className="absolute top-3 right-3 rounded p-1 text-muted-foreground hover:bg-secondary"
        >
          <X className="size-4" />
        </button>
      ) : null}
      <div className="flex gap-3">
        <MessageCircle className="mt-0.5 size-5 shrink-0 text-docket-emerald" />
        <div className="min-w-0 pr-6">
          {done ? (
            <>
              <h2 id="whatsapp-consent-heading" className="font-display text-base font-bold">
                WhatsApp reminders are on
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {whatsappOnForChamber
                  ? "You'll get tomorrow's hearings on WhatsApp at 6 pm each evening."
                  : "We'll start sending them as soon as WhatsApp is switched on for your chamber."}{" "}
                Change this any time on your{" "}
                <Link to="/app/profile" className="font-semibold text-primary hover:underline">
                  Profile
                </Link>
                .
              </p>
            </>
          ) : (
            <>
              <h2 id="whatsapp-consent-heading" className="font-display text-base font-bold">
                Get your court diary on WhatsApp?
              </h2>
              {phone ? (
                <>
                  <p className="mt-1 text-sm text-muted-foreground">
                    With your permission, we'll send tomorrow's hearings to{" "}
                    <strong className="text-foreground">{formatMobile(phone)}</strong> at 6 pm each
                    evening. Your number is shared with our WhatsApp provider only to deliver these
                    messages, and you can stop them any time on your Profile.
                    {whatsappOnForChamber
                      ? ""
                      : " WhatsApp isn't switched on for your chamber yet — messages start once it is."}
                  </p>
                  {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void allow()}
                      className="flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-ink disabled:opacity-60"
                    >
                      {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                      Yes, send on WhatsApp
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void notNow()}
                      className="rounded border border-input px-4 py-2 text-sm font-medium hover:bg-secondary"
                    >
                      Not now
                    </button>
                  </div>
                </>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  Add your 10-digit mobile number on your{" "}
                  <Link to="/app/profile" className="font-semibold text-primary hover:underline">
                    Profile
                  </Link>{" "}
                  and we can send tomorrow's hearings to WhatsApp each evening — only if you say yes.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
