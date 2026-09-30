-- Premium plan, paid through Razorpay Subscriptions.
--
-- Pricing: Rs 1999 per seat per month, plus 18% GST (Rs 2358.82 per seat
-- charged). One seat for a solo advocate, N seats for a team. Free is
-- unchanged. The older solo_basic / solo_pro / chamber plans stay valid for
-- any chamber already on them but are no longer offered.
--
-- What Premium includes over Free:
--   * no matter or client caps;
--   * team seats (as many as are paid for);
--   * fair-use AI limits of 100 calls a day and 1500 a month per user —
--     generous enough that normal use never meets them, but a ceiling on
--     what a runaway client or script can cost. Change the numbers in
--     plan_limit() below;
--   * the Free modules (matters, clients, diary, AI case analysis).
-- Documents, billing, AI drafting, WhatsApp and e-Courts stay per-module
-- add-ons, switched on through licenses.integrations exactly as for Free.
--
-- Nothing here takes payment. The razorpay-billing edge function creates the
-- subscription and verifies checkout; the razorpay-webhook edge function
-- applies renewals and cancellations. Both write licenses with the service
-- role — members still cannot write their own licence row.
--
-- Every function replaced here was compared against the live definition
-- (supabase db dump) on 2026-09-28 before editing; only the Premium arms and
-- the messages naming the retired Chamber price change.

------------------------------------------------------------------ plan set
ALTER TABLE public.licenses DROP CONSTRAINT IF EXISTS licenses_plan_check;
ALTER TABLE public.licenses ADD CONSTRAINT licenses_plan_check
  CHECK (plan IN ('free', 'trial', 'solo_basic', 'solo_pro', 'chamber', 'premium'));

------------------------------------------------------------ razorpay state
-- One Razorpay subscription per chamber at a time. The status mirrors
-- Razorpay's own subscription states, plus 'cancel_scheduled' for a
-- subscription the owner has asked to end at the close of the paid period.
ALTER TABLE public.licenses
  ADD COLUMN IF NOT EXISTS razorpay_subscription_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS razorpay_subscription_status TEXT;

-- Webhook idempotency: Razorpay retries deliveries, and the same event must
-- never extend a billing period twice. Written only by the webhook function
-- (service role); no policy grants anything to authenticated users.
CREATE TABLE IF NOT EXISTS public.razorpay_events (
  event_id TEXT PRIMARY KEY,
  event TEXT NOT NULL,
  subscription_id TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.razorpay_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.razorpay_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.razorpay_events TO service_role;

------------------------------------------------------------ plan limits
CREATE OR REPLACE FUNCTION public.plan_limit(p_plan text, p_resource text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE p_resource
    WHEN 'matters' THEN
      CASE p_plan WHEN 'free' THEN 25 WHEN 'trial' THEN 10 WHEN 'solo_basic' THEN 50 WHEN 'solo_pro' THEN 200 ELSE NULL END
    WHEN 'clients' THEN
      CASE p_plan WHEN 'free' THEN 25 WHEN 'trial' THEN 10 WHEN 'solo_basic' THEN 50 WHEN 'solo_pro' THEN 200 ELSE NULL END
    WHEN 'ai_calls_per_day' THEN
      CASE p_plan WHEN 'free' THEN 5 WHEN 'trial' THEN 20 WHEN 'solo_basic' THEN 40 WHEN 'solo_pro' THEN 150 WHEN 'chamber' THEN 400 WHEN 'premium' THEN 100 ELSE 5 END
    -- Per user, per calendar month. NULL (no monthly ceiling) everywhere but
    -- Premium, whose daily cap alone would allow ~3000 a month.
    WHEN 'ai_calls_per_month' THEN
      CASE p_plan WHEN 'premium' THEN 1500 ELSE NULL END
    WHEN 'storage_mb' THEN
      CASE p_plan WHEN 'free' THEN 100 WHEN 'trial' THEN 100 WHEN 'solo_basic' THEN 1000 WHEN 'solo_pro' THEN 5000 WHEN 'chamber' THEN 25000 WHEN 'premium' THEN 5000 ELSE 100 END
    WHEN 'seats_included' THEN
      CASE p_plan WHEN 'chamber' THEN 2 ELSE 1 END
    WHEN 'whatsapp_messages_per_day' THEN
      CASE p_plan WHEN 'free' THEN 0 WHEN 'trial' THEN 10 WHEN 'solo_basic' THEN 20 WHEN 'solo_pro' THEN 50 WHEN 'chamber' THEN 150 WHEN 'premium' THEN 50 ELSE 0 END
    -- Free is 0: a vendor-billed call is not part of a free-forever plan.
    WHEN 'ecourts_lookups_per_day' THEN
      CASE p_plan WHEN 'free' THEN 0 WHEN 'trial' THEN 5 WHEN 'solo_basic' THEN 10 WHEN 'solo_pro' THEN 30 WHEN 'chamber' THEN 100 WHEN 'premium' THEN 30 ELSE 0 END
    ELSE NULL
  END;
$function$;
COMMENT ON FUNCTION public.plan_limit IS 'NULL return means unlimited for that plan/resource; 0 means the plan does not include it at all.';

------------------------------------------------------------ plan features
-- Premium is listed for ocr/whatsapp/ecourts so that switching the matching
-- add-on on in licenses.integrations actually takes effect; the plan alone
-- does not turn any of them on.
CREATE OR REPLACE FUNCTION public.plan_feature(p_plan text, p_feature text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE p_feature
    WHEN 'ocr'      THEN p_plan IN ('trial', 'solo_pro', 'chamber', 'premium')
    WHEN 'whatsapp' THEN p_plan IN ('trial', 'solo_pro', 'chamber', 'premium')
    WHEN 'team'     THEN p_plan IN ('trial', 'chamber', 'premium')
    -- Every e-Courts lookup is billed by the vendor, so it is never part of
    -- the Free plan. Keep in sync with plan_limit(..., 'ecourts_lookups_per_day').
    WHEN 'ecourts'  THEN p_plan IN ('trial', 'solo_basic', 'solo_pro', 'chamber', 'premium')
    ELSE false
  END;
$function$;

------------------------------------------------------------ prices
-- Rupees before GST. Premium is priced per seat: base covers the one
-- included seat and every further seat costs the same.
CREATE OR REPLACE FUNCTION public.plan_price_inr(p_plan TEXT, p_component TEXT DEFAULT 'base')
RETURNS INTEGER
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_component
    WHEN 'base' THEN
      CASE p_plan WHEN 'trial' THEN 0 WHEN 'solo_basic' THEN 2999 WHEN 'solo_pro' THEN 3999 WHEN 'chamber' THEN 7999 WHEN 'premium' THEN 1999 ELSE 0 END
    WHEN 'extra_seat' THEN
      CASE p_plan WHEN 'chamber' THEN 1999 WHEN 'premium' THEN 1999 ELSE NULL END
    ELSE NULL
  END;
$$;
COMMENT ON FUNCTION public.plan_price_inr IS 'Monthly rupee price before GST. component: base | extra_seat. NULL extra_seat means the plan cannot add seats.';

------------------------------------------------------------ module gate
-- Premium includes the Free modules. Keep in sync with includedByPlan() in
-- src/lib/require-module.ts, supabase/functions/_shared/modules.ts and
-- services/*/src/require-module.ts.
CREATE OR REPLACE FUNCTION public.module_enabled(p_tenant_id uuid, p_module text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- The inner COALESCE is load-bearing (key missing = not purchased); the
  -- outer one is the deliberate fail-open for a missing licence row. See
  -- 20260908090500_enforce_module_entitlement.sql.
  SELECT COALESCE(
    (SELECT public.effective_plan(l.plan, l.trial_ends_at) = 'trial'
         OR (public.effective_plan(l.plan, l.trial_ends_at) IN ('free', 'premium') AND public.free_plan_module(p_module))
         OR COALESCE((l.integrations ->> (p_module || '_enabled')) = 'true', false)
       FROM public.licenses l
      WHERE l.tenant_id = p_tenant_id),
    true);
$function$;

------------------------------------------------------------ AI usage
-- Adds the monthly ceiling. Counts this user's calls since the first of the
-- month from the same per-day table the daily cap uses, so nothing new has to
-- be written on each call.
CREATE OR REPLACE FUNCTION public.increment_ai_usage()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid UUID := auth.uid();
  t_id UUID;
  lic_plan TEXT;
  lic_status TEXT;
  new_count INTEGER;
  max_allowed INTEGER;
  month_allowed INTEGER;
  month_count INTEGER;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT tenant_id INTO t_id FROM public.profiles WHERE id = uid;
  SELECT public.effective_plan(plan, trial_ends_at), status INTO lic_plan, lic_status
    FROM public.licenses WHERE tenant_id = t_id;
  lic_plan := COALESCE(lic_plan, 'free');

  IF lic_status = 'cancelled' THEN
    RAISE EXCEPTION 'This chamber''s subscription is cancelled — AI features are unavailable.'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.ai_usage_daily (user_id, usage_date, call_count)
  VALUES (uid, current_date, 1)
  ON CONFLICT (user_id, usage_date)
  DO UPDATE SET call_count = public.ai_usage_daily.call_count + 1
  RETURNING call_count INTO new_count;

  max_allowed := public.plan_limit(lic_plan, 'ai_calls_per_day');
  IF max_allowed IS NOT NULL AND new_count > max_allowed THEN
    RAISE EXCEPTION 'Daily AI usage limit reached for the % plan (% calls/day) — please try again tomorrow or upgrade your plan.',
      lic_plan, max_allowed
      USING ERRCODE = '42501';
  END IF;

  month_allowed := public.plan_limit(lic_plan, 'ai_calls_per_month');
  IF month_allowed IS NOT NULL THEN
    SELECT COALESCE(sum(call_count), 0) INTO month_count
      FROM public.ai_usage_daily
     WHERE user_id = uid AND usage_date >= date_trunc('month', current_date)::date;
    IF month_count > month_allowed THEN
      RAISE EXCEPTION 'Monthly AI usage limit reached (% calls this month). It resets on the 1st — write to lexdiary.online@gmail.com if you need more.',
        month_allowed
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN new_count;
END; $function$;

------------------------------------------------------------ seats
-- Premium seats are bought through Razorpay (razorpay-billing), so this
-- self-service path would hand out seats nobody paid for. It keeps working
-- for the legacy Chamber plan, which is still invoiced by hand.
CREATE OR REPLACE FUNCTION public.set_seat_count(p_seats INTEGER)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t_id UUID := public.current_tenant_id();
  in_use INTEGER;
BEGIN
  IF NOT public.is_tenant_admin(t_id) THEN
    RAISE EXCEPTION 'Only a chamber owner or admin can change the seat count.' USING ERRCODE = '42501';
  END IF;

  IF (SELECT plan FROM public.licenses WHERE tenant_id = t_id) = 'premium' THEN
    RAISE EXCEPTION 'Premium seats are changed from the Subscription page, where they are billed.' USING ERRCODE = '42501';
  END IF;

  SELECT
    (SELECT count(*) FROM public.profiles WHERE tenant_id = t_id) +
    (SELECT count(*) FROM public.tenant_invites WHERE tenant_id = t_id AND status = 'pending')
  INTO in_use;

  IF p_seats < in_use THEN
    RAISE EXCEPTION 'You have % seats in use. Remove a member or revoke an invite before reducing to %.', in_use, p_seats
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.licenses SET seats = p_seats WHERE tenant_id = t_id;
END; $$;
REVOKE ALL ON FUNCTION public.set_seat_count(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_seat_count(INTEGER) TO authenticated;

-- Message-only changes below: the retired "Chamber plan from Rs 7999" offer
-- is replaced by Premium. Logic is unchanged.
CREATE OR REPLACE FUNCTION public.enforce_seat_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  lic_plan TEXT;
  seat_cap INTEGER;
  used INTEGER;
BEGIN
  SELECT public.effective_plan(plan, trial_ends_at), seats INTO lic_plan, seat_cap
    FROM public.licenses WHERE tenant_id = NEW.tenant_id;
  lic_plan := COALESCE(lic_plan, 'free');

  IF NOT public.plan_feature(lic_plan, 'team') THEN
    RAISE EXCEPTION 'Your % plan is for a single advocate. Upgrade to Premium (Rs 1999 per user per month + GST) to invite teammates.', lic_plan
      USING ERRCODE = '42501';
  END IF;

  SELECT
    (SELECT count(*) FROM public.profiles WHERE tenant_id = NEW.tenant_id) +
    (SELECT count(*) FROM public.tenant_invites WHERE tenant_id = NEW.tenant_id AND status = 'pending')
  INTO used;

  IF seat_cap IS NOT NULL AND used >= seat_cap THEN
    RAISE EXCEPTION 'This chamber has used all % seats. Add a seat from the Subscription page, or revoke a pending invite.', seat_cap
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.enforce_plan_seat_floor()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  included INTEGER := public.plan_limit(NEW.plan, 'seats_included');
  seats_changed BOOLEAN := TG_OP = 'INSERT'
    OR NEW.seats IS DISTINCT FROM OLD.seats
    OR NEW.plan IS DISTINCT FROM OLD.plan;
BEGIN
  IF NOT seats_changed THEN
    RETURN NEW;
  END IF;

  IF NEW.seats < included THEN
    NEW.seats := included;
  END IF;

  IF NOT public.plan_feature(NEW.plan, 'team') AND NEW.seats > included THEN
    RAISE EXCEPTION 'The % plan is a single-advocate plan. Upgrade to Premium to add teammates.', NEW.plan
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.assert_feature(p_feature text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  lic_plan TEXT;
  wa_flag BOOLEAN;
BEGIN
  SELECT public.effective_plan(l.plan, l.trial_ends_at),
         COALESCE((l.integrations ->> 'whatsapp_enabled')::boolean, false)
    INTO lic_plan, wa_flag
    FROM public.licenses l
    WHERE l.tenant_id = public.current_tenant_id();

  lic_plan := COALESCE(lic_plan, 'free');

  IF NOT public.plan_feature(lic_plan, p_feature) THEN
    IF p_feature = 'ocr' THEN
      RAISE EXCEPTION 'Document OCR needs the Premium plan. Upgrade from the Subscription page to scan documents.'
        USING ERRCODE = '42501';
    ELSIF p_feature = 'whatsapp' THEN
      RAISE EXCEPTION 'WhatsApp messaging needs the Premium plan.'
        USING ERRCODE = '42501';
    ELSIF p_feature = 'team' THEN
      RAISE EXCEPTION 'Team management needs the Premium plan.'
        USING ERRCODE = '42501';
    ELSE
      RAISE EXCEPTION 'Your plan does not include %.', p_feature USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_feature = 'whatsapp' AND NOT wa_flag THEN
    RAISE EXCEPTION 'WhatsApp is not switched on for this chamber yet.' USING ERRCODE = '42501';
  END IF;
END; $function$;

------------------------------------------------------------ entitlements
-- Same as 20260916090000's definition except: Premium counts as including
-- the Free modules, and the Razorpay subscription status is returned (new
-- last column) so the Subscription page can show a scheduled cancellation.
DROP FUNCTION IF EXISTS public.my_entitlements();
CREATE OR REPLACE FUNCTION public.my_entitlements()
 RETURNS TABLE(plan text, status text, seats integer, seats_included integer, seats_used integer, extra_seats integer, extra_seat_price_inr integer, base_price_inr integer, modules_total_inr integer, monthly_total_inr integer, ocr_enabled boolean, whatsapp_enabled boolean, team_enabled boolean, matters_limit integer, clients_limit integer, storage_limit_mb integer, trial_ends_at timestamp with time zone, trial_days_left integer, trial_expired boolean, trial_period_days integer, billing_cadence text, current_period_end timestamp with time zone, subscription_expired boolean, subscription_grace_days_left integer, ai_drafting_enabled boolean, ai_assistant_enabled boolean, matter_intelligence_enabled boolean, matters_enabled boolean, clients_enabled boolean, diary_enabled boolean, documents_enabled boolean, billing_enabled boolean, ecourts_enabled boolean, ecourts_lookups_per_day integer, razorpay_subscription_status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t_id UUID;
  l RECORD;
  p TEXT;
  included INTEGER;
  used INTEGER;
  extra INTEGER;
  seat_price INTEGER;
  base_price INTEGER;
  modules_total INTEGER;
  is_trial BOOLEAN;
  has_free_modules BOOLEAN;
  integrations JSONB;
BEGIN
  SELECT pr.tenant_id INTO t_id FROM public.profiles pr WHERE pr.id = auth.uid();
  IF t_id IS NULL THEN RETURN; END IF;

  SELECT * INTO l FROM public.licenses li WHERE li.tenant_id = t_id;
  IF NOT FOUND THEN RETURN; END IF;

  p := public.effective_plan(l.plan, l.trial_ends_at);
  is_trial := (p = 'trial');
  has_free_modules := (p IN ('free', 'premium'));
  integrations := COALESCE(l.integrations, '{}'::jsonb);
  included := public.plan_limit(p, 'seats_included');
  seat_price := COALESCE(l.legacy_extra_seat_price_inr, public.plan_price_inr(p, 'extra_seat'));
  base_price := COALESCE(l.legacy_base_price_inr, public.plan_price_inr(p, 'base'));

  modules_total :=
    (CASE WHEN COALESCE((integrations ->> 'ai_drafting_enabled')::boolean, false)
          THEN public.module_price_inr('ai_drafting') ELSE 0 END) +
    (CASE WHEN COALESCE((integrations ->> 'ai_assistant_enabled')::boolean, false)
          THEN public.module_price_inr('ai_assistant') ELSE 0 END) +
    (CASE WHEN COALESCE((integrations ->> 'matter_intelligence_enabled')::boolean, false)
          THEN public.module_price_inr('matter_intelligence') ELSE 0 END) +
    (CASE WHEN COALESCE((integrations ->> 'matters_enabled')::boolean, false)
          THEN public.module_price_inr('matters') ELSE 0 END) +
    (CASE WHEN COALESCE((integrations ->> 'clients_enabled')::boolean, false)
          THEN public.module_price_inr('clients') ELSE 0 END) +
    (CASE WHEN COALESCE((integrations ->> 'diary_enabled')::boolean, false)
          THEN public.module_price_inr('diary') ELSE 0 END) +
    (CASE WHEN COALESCE((integrations ->> 'documents_enabled')::boolean, false)
          THEN public.module_price_inr('documents') ELSE 0 END) +
    (CASE WHEN COALESCE((integrations ->> 'billing_enabled')::boolean, false)
          THEN public.module_price_inr('billing') ELSE 0 END);

  -- tenant_invites.status must be table-qualified: this function has an OUT
  -- parameter also named "status", and an unqualified reference is ambiguous.
  SELECT
    (SELECT count(*) FROM public.profiles pr WHERE pr.tenant_id = t_id) +
    (SELECT count(*) FROM public.tenant_invites ti WHERE ti.tenant_id = t_id AND ti.status = 'pending')
  INTO used;

  extra := GREATEST(COALESCE(l.seats, included) - included, 0);

  RETURN QUERY SELECT
    p,
    l.status,
    l.seats,
    included,
    used,
    extra,
    seat_price,
    base_price,
    modules_total,
    base_price + (extra * COALESCE(seat_price, 0)) + modules_total,
    public.plan_feature(p, 'ocr'),
    public.plan_feature(p, 'whatsapp') AND COALESCE((integrations ->> 'whatsapp_enabled')::boolean, false),
    public.plan_feature(p, 'team'),
    public.plan_limit(p, 'matters'),
    public.plan_limit(p, 'clients'),
    public.plan_limit(p, 'storage_mb'),
    CASE WHEN is_trial THEN l.trial_ends_at ELSE NULL END,
    CASE WHEN is_trial AND l.trial_ends_at IS NOT NULL
         THEN GREATEST(CEIL(EXTRACT(EPOCH FROM (l.trial_ends_at - now())) / 86400)::INTEGER, 0)
         ELSE NULL END,
    false,
    public.trial_period_days(),
    l.billing_cadence,
    l.current_period_end,
    public.subscription_expired(t_id),
    CASE WHEN p NOT IN ('trial', 'free') AND l.current_period_end IS NOT NULL
         THEN GREATEST(CEIL(EXTRACT(EPOCH FROM (
                (l.current_period_end + (public.subscription_grace_days() || ' days')::interval) - now()
              )) / 86400)::INTEGER, 0)
         ELSE NULL END,
    is_trial OR COALESCE((integrations ->> 'ai_drafting_enabled')::boolean, false),
    is_trial OR has_free_modules OR COALESCE((integrations ->> 'ai_assistant_enabled')::boolean, false),
    is_trial OR has_free_modules OR COALESCE((integrations ->> 'matter_intelligence_enabled')::boolean, false),
    is_trial OR has_free_modules OR COALESCE((integrations ->> 'matters_enabled')::boolean, false),
    is_trial OR has_free_modules OR COALESCE((integrations ->> 'clients_enabled')::boolean, false),
    is_trial OR has_free_modules OR COALESCE((integrations ->> 'diary_enabled')::boolean, false),
    is_trial OR COALESCE((integrations ->> 'documents_enabled')::boolean, false),
    is_trial OR COALESCE((integrations ->> 'billing_enabled')::boolean, false),
    -- Both gates must allow it: the plan, and the per-chamber switch.
    public.plan_feature(p, 'ecourts') AND COALESCE((integrations ->> 'ecourts_enabled')::boolean, false),
    public.plan_limit(p, 'ecourts_lookups_per_day'),
    l.razorpay_subscription_status;
END; $function$;

REVOKE ALL ON FUNCTION public.my_entitlements() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_entitlements() TO authenticated;
