-- Team invite/join flow. A tenant owner/admin invites a teammate by email;
-- the invitee gets a shareable link (there is no transactional email
-- infrastructure in this app — see the SRS's "Known Gaps" — so the invite
-- link itself is the delivery mechanism, copied/shared by the inviter
-- rather than emailed automatically); accepting it joins the *existing*
-- tenant instead of the normal signup path's "create a brand-new tenant."

CREATE TABLE public.tenant_invites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  invited_by UUID NOT NULL REFERENCES auth.users ON DELETE SET NULL,
  token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at TIMESTAMPTZ
);
CREATE INDEX tenant_invites_tenant_idx ON public.tenant_invites (tenant_id);

GRANT SELECT, INSERT, UPDATE ON public.tenant_invites TO authenticated;
GRANT ALL ON public.tenant_invites TO service_role;
ALTER TABLE public.tenant_invites ENABLE ROW LEVEL SECURITY;

-- Invitees never touch this table directly (they're anon, or a
-- brand-new/not-yet-a-member user) — they only ever interact with an
-- invite through get_invite_info() (below) and, at signup, through
-- handle_new_user()'s SECURITY DEFINER acceptance logic. So there is
-- deliberately no policy granting a non-member any access to this table.
CREATE POLICY "Tenant admins view own invites" ON public.tenant_invites
  FOR SELECT TO authenticated USING (public.is_tenant_admin(tenant_id));
CREATE POLICY "Tenant admins create invites" ON public.tenant_invites
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.is_tenant_admin(tenant_id) AND invited_by = auth.uid());
CREATE POLICY "Tenant admins revoke invites" ON public.tenant_invites
  FOR UPDATE TO authenticated
  USING (public.is_tenant_admin(tenant_id)) WITH CHECK (tenant_id = public.current_tenant_id());

CREATE TRIGGER tenant_invites_writable_check BEFORE INSERT OR UPDATE OR DELETE ON public.tenant_invites
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_writable();
CREATE TRIGGER tenant_invites_audit_log AFTER INSERT OR UPDATE OR DELETE ON public.tenant_invites
  FOR EACH ROW EXECUTE FUNCTION public.log_tenant_mutation();

-- Seat cap: a tenant may not have more (active members + pending invites)
-- than licenses.seats. NULL seats would mean "unlimited," but seats is
-- NOT NULL with CHECK (seats > 0) in this schema, so there is always a
-- concrete cap to enforce.
CREATE OR REPLACE FUNCTION public.enforce_seat_limit() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  seat_cap INTEGER;
  used INTEGER;
BEGIN
  SELECT seats INTO seat_cap FROM public.licenses WHERE tenant_id = NEW.tenant_id;
  SELECT
    (SELECT count(*) FROM public.profiles WHERE tenant_id = NEW.tenant_id) +
    (SELECT count(*) FROM public.tenant_invites WHERE tenant_id = NEW.tenant_id AND status = 'pending')
  INTO used;
  IF seat_cap IS NOT NULL AND used >= seat_cap THEN
    RAISE EXCEPTION 'This chamber has reached its seat limit (%). Upgrade the plan or revoke a pending invite to add more.', seat_cap
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.enforce_seat_limit() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER tenant_invites_seat_check BEFORE INSERT ON public.tenant_invites
  FOR EACH ROW EXECUTE FUNCTION public.enforce_seat_limit();

-- Minimal, anon-callable lookup so the /invite/:token landing page can
-- show "You've been invited to join <firm>" before the visitor has an
-- account or session — exposes only what's needed for that, not the
-- underlying row.
CREATE OR REPLACE FUNCTION public.get_invite_info(p_token UUID)
RETURNS TABLE(tenant_name TEXT, email TEXT, role TEXT, valid BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.name, i.email, i.role,
    (i.status = 'pending' AND i.expires_at > now())
  FROM public.tenant_invites i
  JOIN public.tenants t ON t.id = i.tenant_id
  WHERE i.token = p_token;
$$;
REVOKE ALL ON FUNCTION public.get_invite_info(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invite_info(UUID) TO anon, authenticated;

-- Tenant members need to see their colleagues to render a team roster.
-- The existing "Users manage own profile" FOR ALL policy is untouched
-- (still the only policy governing INSERT/UPDATE/DELETE on profiles) —
-- this adds a second, SELECT-only policy alongside it; Postgres RLS
-- policies for the same command are OR'd, so this only widens what can be
-- *read*, never what can be written.
CREATE POLICY "Tenant members view tenant colleagues" ON public.profiles
  FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id());

-- Extend signup to accept an invite instead of always creating a new
-- tenant. NEW.raw_user_meta_data->>'invite_token' is set by the client at
-- signUp() time when the visitor arrived via an invite link. The token
-- must match a still-pending, not-expired invite for *this exact email*
-- (case-insensitive) — a token alone is not enough to claim a seat
-- intended for someone else's address.
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_tenant_id UUID;
  tenant_name TEXT;
  tenant_slug TEXT;
  invite RECORD;
  invite_token TEXT := NEW.raw_user_meta_data ->> 'invite_token';
BEGIN
  IF invite_token IS NOT NULL THEN
    BEGIN
      SELECT * INTO invite FROM public.tenant_invites
        WHERE token = invite_token::uuid
          AND status = 'pending'
          AND expires_at > now()
          AND lower(email) = lower(NEW.email)
        LIMIT 1;
    EXCEPTION WHEN invalid_text_representation THEN
      invite := NULL;
    END;
  END IF;

  IF invite.id IS NOT NULL THEN
    UPDATE public.tenant_invites SET status = 'accepted', accepted_at = now() WHERE id = invite.id;

    INSERT INTO public.profiles (id, full_name, tenant_id, tenant_role)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'),
      invite.tenant_id,
      invite.role
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
  END IF;

  -- Normal signup path: create a brand-new tenant, as before.
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
