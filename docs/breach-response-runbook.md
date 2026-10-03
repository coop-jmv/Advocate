# Personal data breach response runbook

Basis: DPDP Act, 2023, S.8(6), and the privacy notice's promise to notify the
Data Protection Board of India (DPBI) and affected data principals. Review
after every incident and at least yearly.

## 1. Roles
- **Incident lead:** the on-call engineer who first confirms the breach. Names and
  phone numbers go in the private ops notes, not this repo.
- **Grievance officer:** grievance@lexdiary.online. Owns external communication.

## 2. Detect
Treat any of these as a suspected breach until ruled out: a leaked or committed
secret (`bun run`-time secret scan, GitHub secret-scanning alert), unexplained
rows in `audit_log` (`action` of `role_changed`, `chamber_exported`,
`data_exported` the actor did not make), a Supabase or Cloudflare security
notice, a provider (OpenAI, Gupshup, Resend, Razorpay) incident notice, a lost
device with an active session, or a user report.

## 3. Contain (first hour)
1. Rotate the exposed credential: Supabase service-role/JWT secret,
   `FIELD_ENCRYPTION_KEY` (re-encrypt before retiring the old key),
   `AI_GATEWAY_API_KEY`, `RESEND_API_KEY`, Gupshup and Razorpay keys, the cron
   shared secret in Vault.
2. Revoke sessions: sign out affected users in Supabase Auth.
3. Stop the leak: unschedule cron jobs (`cron.unschedule(...)`), disable the
   affected edge function or Worker.
4. Preserve evidence: export `audit_log`, Worker logs and Supabase logs for the
   window. Do not delete anything.

## 4. Assess
Record: what data (account data, client/matter data, document text, phone
numbers), whose (which chambers, how many people), when it started and ended,
how it happened, and whether the data was encrypted (field-level encryption
means ciphertext alone is not a plaintext exposure unless the key leaked too).

## 5. Notify
- **DPBI:** without delay once confirmed, with the S.8(6) intimation, then a
  detailed report within 72 hours (or the period the DPBI rules specify).
  Include the nature, extent, timing, likely impact, and remedial steps.
- **Data principals:** each affected user and chamber owner, in plain language:
  what happened, what data, what they should do, what we did, and who to contact.
  Chamber owners are the fiduciary for client/matter data and need to hear first
  so they can notify their own clients.
- **Processors/regulators:** CERT-In within 6 hours for reportable cyber
  incidents (incident@cert-in.org.in).

## 6. Recover and learn
Restore from backup only if needed. Within 7 days write a post-incident review
(timeline, root cause, fixes, owner and date for each), add a regression test
under `supabase/tests/`, and update `docs/security-test-plan.md`.

## 7. Log
Keep every breach record, including near misses, for at least one year in the
private ops notes.
