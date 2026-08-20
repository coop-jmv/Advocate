-- Make the 15-day trial a genuine full-feature evaluation.
--
-- The trial already unlocked OCR and WhatsApp, but not team management, and it
-- carried a single seat — so the thing that actually distinguishes the Chamber
-- plan (invite teammates, assign roles, manage seats) could not be tried at
-- all before paying for it. A trial that cannot exercise the tier it is meant
-- to sell is not much of a trial.
--
-- Now every feature is on during the trial, with three seats so the invite and
-- role flow can be walked end to end. Quotas stay finite — the trial is
-- time-boxed to 15 days, so the limits exist to keep a trial from being used
-- as free production, not to hide functionality.

------------------------------------------------------------------ features
CREATE OR REPLACE FUNCTION public.plan_feature(p_plan TEXT, p_feature TEXT)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_feature
    WHEN 'ocr'      THEN p_plan IN ('trial', 'solo_pro', 'chamber')
    WHEN 'whatsapp' THEN p_plan IN ('trial', 'solo_pro', 'chamber')
    -- 'trial' included so the Chamber tier can actually be evaluated.
    WHEN 'team'     THEN p_plan IN ('trial', 'chamber')
    ELSE false
  END;
$$;

------------------------------------------------------------------ limits
-- Trial quotas raised from the old evaluation-hostile numbers (10 matters,
-- 10 clients, 100 MB) to something a real chamber can test against.
CREATE OR REPLACE FUNCTION public.plan_limit(p_plan TEXT, p_resource TEXT)
RETURNS INTEGER
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_resource
    WHEN 'matters' THEN
      CASE p_plan WHEN 'trial' THEN 25 WHEN 'solo_basic' THEN 50 WHEN 'solo_pro' THEN 200 ELSE NULL END
    WHEN 'clients' THEN
      CASE p_plan WHEN 'trial' THEN 25 WHEN 'solo_basic' THEN 50 WHEN 'solo_pro' THEN 200 ELSE NULL END
    WHEN 'ai_calls_per_day' THEN
      CASE p_plan WHEN 'trial' THEN 50 WHEN 'solo_basic' THEN 40 WHEN 'solo_pro' THEN 150 WHEN 'chamber' THEN 400 ELSE 20 END
    WHEN 'storage_mb' THEN
      CASE p_plan WHEN 'trial' THEN 500 WHEN 'solo_basic' THEN 1000 WHEN 'solo_pro' THEN 5000 WHEN 'chamber' THEN 25000 ELSE 100 END
    WHEN 'seats_included' THEN
      -- Three seats on trial: enough to invite a junior and a clerk and see
      -- roles, seat accounting and the invite flow behave.
      CASE p_plan WHEN 'trial' THEN 3 WHEN 'chamber' THEN 2 ELSE 1 END
    ELSE NULL
  END;
$$;
COMMENT ON FUNCTION public.plan_limit IS 'NULL return means unlimited for that plan/resource.';

-- Existing trials get the new seat allowance rather than being stuck at one.
UPDATE public.licenses SET seats = 3 WHERE plan = 'trial' AND seats < 3;

------------------------------------------------- WhatsApp on during trial
-- my_entitlements reports WhatsApp as the conjunction of the plan allowing it
-- and the per-tenant integration switch. That switch defaults to off, so a
-- trial would have shown "not enabled" for a feature it is supposed to
-- include. Turn it on for trials, and for new tenants by default.
UPDATE public.licenses
   SET integrations = jsonb_set(COALESCE(integrations, '{}'::jsonb), '{whatsapp_enabled}', 'true'::jsonb)
 WHERE plan = 'trial'
   AND COALESCE((integrations ->> 'whatsapp_enabled')::boolean, false) = false;

ALTER TABLE public.licenses
  ALTER COLUMN integrations SET DEFAULT '{"whatsapp_enabled": true}'::jsonb;

-- New chambers start on a trial, so provision them with the trial's seats and
-- integrations rather than the bare column defaults.
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_tenant_id UUID;
  tenant_name TEXT;
  tenant_slug TEXT;
  invite_id UUID;
  invite_tenant_id UUID;
  invite_role TEXT;
  invite_token TEXT := NEW.raw_user_meta_data ->> 'invite_token';
BEGIN
  IF invite_token IS NOT NULL THEN
    BEGIN
      SELECT id, tenant_id, role
        INTO invite_id, invite_tenant_id, invite_role
        FROM public.tenant_invites
        WHERE token = invite_token::uuid
          AND status = 'pending'
          AND expires_at > now()
          AND lower(email) = lower(NEW.email)
        LIMIT 1;
    EXCEPTION WHEN invalid_text_representation THEN
      invite_id := NULL;
      invite_tenant_id := NULL;
      invite_role := NULL;
    END;
  END IF;

  IF invite_id IS NOT NULL THEN
    UPDATE public.tenant_invites SET status = 'accepted', accepted_at = now() WHERE id = invite_id;

    INSERT INTO public.profiles (id, full_name, tenant_id, tenant_role)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'),
      invite_tenant_id,
      invite_role
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
  END IF;

  tenant_name := COALESCE(NEW.raw_user_meta_data ->> 'firm_name', NEW.raw_user_meta_data ->> 'full_name', 'New chamber');
  tenant_slug := lower(regexp_replace(tenant_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(NEW.id::text, 1, 8);

  INSERT INTO public.tenants (name, slug) VALUES (tenant_name, tenant_slug)
  RETURNING id INTO new_tenant_id;

  -- Full-feature trial: every capability on, seats for a small chamber.
  INSERT INTO public.licenses (tenant_id, plan, status, seats, integrations)
  VALUES (
    new_tenant_id, 'trial', 'trialing',
    public.plan_limit('trial', 'seats_included'),
    '{"whatsapp_enabled": true}'::jsonb
  );

  INSERT INTO public.profiles (id, full_name, firm_name, tenant_id, tenant_role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'),
    NEW.raw_user_meta_data ->> 'firm_name',
    new_tenant_id,
    'owner'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
