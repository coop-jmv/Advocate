-- Capture a mobile number at signup.
--
-- Stored on profiles rather than auth.users.phone: the latter is Supabase's
-- phone-auth identity column, and writing to it implies SMS OTP sign-in,
-- which needs an SMS provider this project has not configured. This is
-- contact information, not a credential, so it belongs with the rest of the
-- advocate's profile.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;

COMMENT ON COLUMN public.profiles.phone IS
  'Advocate''s mobile number in E.164 (e.g. +919820041122). Contact detail only — not an auth identity.';

-- Deliberately permissive: a CHECK that only accepts Indian mobiles would
-- reject an advocate practising with an overseas number, and over-strict
-- phone validation is a classic source of silent signup failures. The shape
-- is enforced in the app layer, where a bad value can be explained to the
-- person typing it.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_phone_shape;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_phone_shape
  CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{7,14}$');

-- profiles has column-level UPDATE grants (see the migration that locked the
-- privilege-bearing columns): authenticated may only update the columns
-- listed there. Without adding phone, the profile screen would appear to save
-- and silently change nothing.
GRANT UPDATE (phone) ON public.profiles TO authenticated;

-- Record the number on both signup paths. The invite branch matters as much
-- as the new-chamber one: a teammate joining by invite is still an advocate
-- whose number the chamber needs.
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
  assigned_tenant UUID;
  signup_phone TEXT := NULLIF(trim(NEW.raw_user_meta_data ->> 'phone'), '');
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
      invite_id := NULL; invite_tenant_id := NULL; invite_role := NULL;
    END;
  END IF;

  IF invite_id IS NOT NULL THEN
    UPDATE public.tenant_invites SET status = 'accepted', accepted_at = now() WHERE id = invite_id;
    INSERT INTO public.profiles (id, full_name, phone, tenant_id, tenant_role)
    VALUES (NEW.id,
            COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'),
            signup_phone, invite_tenant_id, invite_role)
    ON CONFLICT (id) DO NOTHING;
    assigned_tenant := invite_tenant_id;
  ELSE
    tenant_name := COALESCE(NEW.raw_user_meta_data ->> 'firm_name', NEW.raw_user_meta_data ->> 'full_name', 'New chamber');
    tenant_slug := lower(regexp_replace(tenant_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(NEW.id::text, 1, 8);

    INSERT INTO public.tenants (name, slug) VALUES (tenant_name, tenant_slug)
    RETURNING id INTO new_tenant_id;

    INSERT INTO public.licenses (tenant_id, plan, status, seats, integrations)
    VALUES (new_tenant_id, 'trial', 'trialing',
            public.plan_limit('trial', 'seats_included'),
            '{"whatsapp_enabled": true}'::jsonb);

    INSERT INTO public.profiles (id, full_name, firm_name, phone, tenant_id, tenant_role)
    VALUES (NEW.id,
            COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'),
            NEW.raw_user_meta_data ->> 'firm_name', signup_phone, new_tenant_id, 'owner')
    ON CONFLICT (id) DO NOTHING;
    assigned_tenant := new_tenant_id;
  END IF;

  INSERT INTO public.consents (user_id, tenant_id, purpose, notice_version)
  VALUES (NEW.id, assigned_tenant, 'service_provision', public.current_notice_version()),
         (NEW.id, assigned_tenant, 'ai_processing',     public.current_notice_version());

  RETURN NEW;
END; $$;
