// Field rules shared by every form in the app. The backend enforces its own
// copy (services/*, server functions, DB constraints); these exist so a
// person sees what's wrong next to the field instead of a silent no-op or a
// raw server message. Keep limits in step with the server side.

export type FieldErrors<K extends string = string> = Partial<Record<K, string>>;

export const LIMITS = {
  namePart: 50,
  title: 200,
  shortText: 120,
  email: 254,
  notes: 2000,
} as const;

// Letters in any script (Devanagari, Tamil, … as well as Latin), plus the
// separators real names use: space, dot (initials), apostrophe, hyphen.
const NAME_PART = /^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u;

export function namePartError(value: string, label: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return `${label} is required.`;
  if (trimmed.length > LIMITS.namePart)
    return `${label} can be at most ${LIMITS.namePart} characters.`;
  if (!NAME_PART.test(trimmed))
    return `${label} can only contain letters, spaces, dots, apostrophes and hyphens.`;
  return null;
}

export function joinName(first: string, last: string): string {
  return `${first.trim().replace(/\s+/g, " ")} ${last.trim().replace(/\s+/g, " ")}`;
}

// Stored names are one string; the last word is taken as the surname.
export function splitName(full: string | null | undefined): { first: string; last: string } {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { first: parts[0] ?? "", last: "" };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1]! };
}

// Practical address check, not full RFC 5322: the local part is dot-separated
// runs of the usual characters (no leading, trailing or doubled dots); the
// domain is hyphen-safe labels ending in a letters-only TLD (.com, .in,
// .co.in). Keep in sync with isValidEmail() in services/clients/src/index.ts.
const EMAIL_LOCAL = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const EMAIL_DOMAIN = /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

export function isValidEmail(value: string): boolean {
  if (value.length > LIMITS.email) return false;
  const at = value.lastIndexOf("@");
  if (at < 1) return false;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  return local.length <= 64 && EMAIL_LOCAL.test(local) && EMAIL_DOMAIN.test(domain);
}

export function emailError(value: string, { required = true } = {}): string | null {
  const trimmed = value.trim();
  if (!trimmed) return required ? "Email is required." : null;
  if (!isValidEmail(trimmed)) return "Enter a valid email address, e.g. name@example.com.";
  return null;
}

// Indian mobile numbers: 10 digits starting 6-9. Stored as +91XXXXXXXXXX
// (E.164), which is what profiles.phone's CHECK and WhatsApp both expect.
const MOBILE = /^[6-9]\d{9}$/;

/** Keeps only the 10 national digits of whatever was typed or pasted. */
export function mobileDigits(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length > 10 && digits.startsWith("0")) digits = digits.slice(1);
  return digits.slice(0, 10);
}

export function mobileError(digits: string, { required = true } = {}): string | null {
  if (!digits) return required ? "Mobile number is required." : null;
  if (digits.length !== 10) return "Mobile number must be exactly 10 digits.";
  if (!MOBILE.test(digits))
    return "Enter a valid Indian mobile number (starting with 6, 7, 8 or 9).";
  return null;
}

export function toE164Mobile(digits: string): string {
  return `+91${digits}`;
}

/** The 10 digits of a stored +91 number, for editing; anything else is shown as-is. */
export function mobileForInput(stored: string | null | undefined): string {
  return stored ? mobileDigits(stored) : "";
}

export function requiredText(
  value: string,
  label: string,
  { min = 2, max = LIMITS.shortText }: { min?: number; max?: number } = {},
): string | null {
  const trimmed = value.trim();
  if (!trimmed) return `${label} is required.`;
  if (trimmed.length < min) return `${label} must be at least ${min} characters.`;
  if (trimmed.length > max) return `${label} can be at most ${max} characters.`;
  return null;
}

export function optionalText(
  value: string,
  label: string,
  max: number = LIMITS.shortText,
): string | null {
  return value.trim().length > max ? `${label} can be at most ${max} characters.` : null;
}

export function numberError(
  raw: string,
  label: string,
  {
    min,
    max,
    required = true,
    minExclusive = false,
  }: { min: number; max: number; required?: boolean; minExclusive?: boolean },
): string | null {
  if (!raw.trim()) return required ? `${label} is required.` : null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return `${label} must be a number.`;
  if (minExclusive ? value <= min : value < min)
    return minExclusive
      ? `${label} must be more than ${min}.`
      : `${label} must be at least ${min}.`;
  if (value > max) return `${label} can be at most ${max.toLocaleString("en-IN")}.`;
  return null;
}

/** CNR (Case Number Record): optional, but if given exactly 16 letters/digits. */
export function cnrError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^[A-Za-z0-9]{16}$/.test(trimmed) ? null : "CNR must be exactly 16 letters and numbers.";
}

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** For dates that have already happened (filed on, worked on). ISO yyyy-mm-dd. */
export function pastDateError(
  value: string,
  label: string,
  { required = false } = {},
): string | null {
  if (!value) return required ? `${label} is required.` : null;
  return value > todayIso() ? `${label} can't be in the future.` : null;
}

/** Drops the null entries so `Object.keys(errors).length` means "has errors". */
export function collectErrors<K extends string>(checks: Record<K, string | null>): FieldErrors<K> {
  const errors: FieldErrors<K> = {};
  for (const key of Object.keys(checks) as K[]) {
    const message = checks[key];
    if (message) errors[key] = message;
  }
  return errors;
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}
