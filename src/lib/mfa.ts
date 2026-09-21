import { supabase } from "@/integrations/supabase/client";

// Two-factor (TOTP / authenticator app) helpers.
//
// The real enforcement is in the database (20260921090000_mfa_enforcement.sql):
// once a user has a verified factor, every API request from a session that has
// not entered the code (assurance level aal1) is refused. These helpers only
// drive the screens — asking for the code at the right moment, enrolment, and
// sending an aal1 session to the code prompt instead of letting it hit a wall
// of "Two-factor verification required" errors.

/** True when this session still has to enter an authenticator code. */
export async function needsMfaChallenge(): Promise<boolean> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return false;
  return data.nextLevel === "aal2" && data.currentLevel !== "aal2";
}

/** The user's verified authenticator-app factor, if 2FA is switched on. */
export async function verifiedTotpFactor(): Promise<{ id: string; createdAt: string } | null> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error || !data) return null;
  const factor = data.totp.find((f) => f.status === "verified");
  return factor ? { id: factor.id, createdAt: factor.created_at } : null;
}

/** Normalise what people type: "123 456" / "123-456" → "123456". */
export function cleanCode(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 6);
}

/** Verify a 6-digit code against the user's factor, upgrading the session to aal2. */
export async function verifyTotpCode(factorId: string, code: string): Promise<void> {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) {
    throw new Error(
      /invalid|expired/i.test(error.message)
        ? "That code didn't work. Check the time on your phone is set automatically, and enter the current code."
        : error.message,
    );
  }
}

/**
 * Remove unfinished enrolments (scanned but never confirmed). Supabase refuses
 * a new enrolment with the same friendly name while one is pending, and a
 * stale one is otherwise invisible to the user.
 */
export async function clearUnverifiedFactors(): Promise<void> {
  const { data } = await supabase.auth.mfa.listFactors();
  for (const factor of data?.all ?? []) {
    if (factor.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }
}
