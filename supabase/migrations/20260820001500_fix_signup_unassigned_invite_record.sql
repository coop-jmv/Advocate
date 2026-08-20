-- Fixes a signup-blocking regression introduced with the team invite flow
-- (20260819124319_team_invites.sql).
--
-- That version declared `invite RECORD` and only ever assigned it inside
-- `IF invite_token IS NOT NULL THEN ... END IF`, but then referenced
-- `invite.id` unconditionally below. On a normal signup there is no
-- invite_token, so the branch never ran, the record stayed unassigned, and
-- touching `invite.id` raised 55000 "record \"invite\" is not assigned yet".
-- Postgres aborted the INSERT on auth.users, which GoTrue surfaced as
-- HTTP 500 "Database error saving new user" — so *every* create-a-new-chamber
-- signup failed. Invite-based signups were unaffected (that path does assign
-- the record), which is why the invite flow tested clean.
--
-- Scalar variables are always initialised to NULL, so they can be read
-- whether or not the lookup ran. That removes the failure mode entirely
-- rather than papering over it with an `IF invite_token IS NOT NULL` guard
-- around every later reference.
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
      -- Malformed token in metadata: fall through to normal signup rather
      -- than failing the account creation outright.
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

  -- Normal signup path: create a brand-new tenant.
  tenant_name := COALESCE(NEW.raw_user_meta_data ->> 'firm_name', NEW.raw_user_meta_data ->> 'full_name', 'New chamber');
  tenant_slug := lower(regexp_replace(tenant_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(NEW.id::text, 1, 8);

  INSERT INTO public.tenants (name, slug) VALUES (tenant_name, tenant_slug)
  RETURNING id INTO new_tenant_id;

  INSERT INTO public.licenses (tenant_id, plan, status) VALUES (new_tenant_id, 'trial', 'trialing');

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
