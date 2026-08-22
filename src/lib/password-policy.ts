// Single source of truth for the app's password length requirement, used
// wherever a password is set (signup, reset). The HTML `minlength` attribute
// on the input is a UX hint only — it's trivially bypassed by calling
// supabase.auth.signUp()/updateUser() directly, so this explicit check is
// the real client-side gate. Supabase Auth's own project-level minimum
// (6 chars, the platform default) is the final, server-side authority
// regardless of this — this only raises the bar the app itself enforces
// before ever calling the API.
export const MIN_PASSWORD_LENGTH = 8;

export function passwordLengthError(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}
