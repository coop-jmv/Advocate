# Two-factor login (MFA) enforcement tests

End-to-end checks for `20260921090000_mfa_enforcement.sql`, run against the **local** Supabase
stack only (the script refuses any non-localhost API URL). It creates throwaway users, turns
two-factor login on through the real Auth API, generates real authenticator codes, and deletes
everything it created.

```sh
supabase db reset
supabase status -o json | python supabase/tests/mfa/mfa_e2e.py
```

What it proves (20 checks):

- A user **without** 2FA is unaffected: password-only sessions can read and write.
- Once 2FA is on, a **password-only session** (the stolen-password case) is refused everywhere:
  table reads and writes, `export_chamber_data`, `delete_my_account` — with nothing leaked or
  changed.
- The RLS backstop blocks it even when the PostgREST pre-request hook is bypassed.
- Entering the authenticator code upgrades the session and restores access; a wrong code is
  rejected.
- A **platform admin** has no admin powers until 2FA is verified, gets them back once it is, and
  loses them again on a password-only session.
- Signup still creates a chamber.
