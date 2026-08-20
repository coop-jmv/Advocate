-- 20260821090000_cause_list_intelligence.sql's change_type CHECK omitted
-- 'removed' (a listing present in a prior ingestion but absent from the
-- latest one for the same source/date — the spec's full change-type list is
-- new/unchanged/date-changed/serial-changed/hall-changed/bench-changed/
-- stage-changed/removed). Fixing via a follow-up migration rather than
-- editing the already-applied one.
ALTER TABLE public.cause_list_changes DROP CONSTRAINT cause_list_changes_change_type_check;
ALTER TABLE public.cause_list_changes ADD CONSTRAINT cause_list_changes_change_type_check CHECK (
  change_type IN (
    'new_listing', 'date_changed', 'serial_changed', 'hall_changed',
    'bench_changed', 'stage_changed', 'unchanged', 'removed'
  )
);
