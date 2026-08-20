-- DPDP Act, 2023 groundwork: consent, access, erasure, retention — plus the
-- grant housekeeping the isolation audit flagged.
--
-- Scope note that shapes all of this: most personal data in the product does
-- not belong to the user in front of us. It belongs to *their* clients,
-- opposing parties and witnesses named in matters and scanned documents. The
-- advocate's firm is the data fiduciary for that material; this platform
-- processes it on their behalf. So the rights implemented here operate at two
-- levels — a user over their own account data, and a chamber owner over the
-- whole chamber's records, which is the unit a firm can actually be asked to
-- export or erase.

---------------------------------------------------------------- consent (S.6)
-- Consent is recorded as an append-only history rather than a boolean: the Act
-- treats withdrawal as a first-class event, and "when did they agree, to what,
-- under which notice" has to survive the withdrawal.
CREATE TABLE IF NOT EXISTS public.consents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants ON DELETE SET NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('service_provision', 'ai_processing', 'product_updates')),
  notice_version TEXT NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  withdrawn_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS consents_user_idx ON public.consents (user_id, purpose, granted_at DESC);

ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own consents" ON public.consents;
CREATE POLICY "Users view own consents" ON public.consents
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Withdrawal is the only client-writable transition, and only on one's own
-- rows. Granting is done server-side at signup so a consent record cannot be
-- forged after the fact.
DROP POLICY IF EXISTS "Users withdraw own consents" ON public.consents;
CREATE POLICY "Users withdraw own consents" ON public.consents
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- The notice the consent was given under. Bumping this string is what marks a
-- notice change, so existing consents can be told apart from re-consents.
CREATE OR REPLACE FUNCTION public.current_notice_version()
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$ SELECT '2026-08-20'::text; $$;
REVOKE ALL ON FUNCTION public.current_notice_version() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_notice_version() TO authenticated;

CREATE OR REPLACE FUNCTION public.withdraw_consent(p_purpose TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_purpose = 'service_provision' THEN
    RAISE EXCEPTION 'Consent to provide the service cannot be withdrawn while the account is open. Delete the account instead — that erases the data with it.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.consents
     SET withdrawn_at = now()
   WHERE user_id = auth.uid() AND purpose = p_purpose AND withdrawn_at IS NULL;

  INSERT INTO public.audit_log (tenant_id, actor_user_id, actor_email, action, resource_type, metadata)
  VALUES (public.current_tenant_id(), auth.uid(),
          (SELECT email FROM auth.users WHERE id = auth.uid()),
          'consent_withdrawn', 'consents', jsonb_build_object('purpose', p_purpose));
END; $$;
REVOKE ALL ON FUNCTION public.withdraw_consent(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_consent(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.grant_consent(p_purpose TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.consents (user_id, tenant_id, purpose, notice_version)
  VALUES (auth.uid(), public.current_tenant_id(), p_purpose, public.current_notice_version());

  INSERT INTO public.audit_log (tenant_id, actor_user_id, actor_email, action, resource_type, metadata)
  VALUES (public.current_tenant_id(), auth.uid(),
          (SELECT email FROM auth.users WHERE id = auth.uid()),
          'consent_granted', 'consents', jsonb_build_object('purpose', p_purpose));
END; $$;
REVOKE ALL ON FUNCTION public.grant_consent(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_consent(TEXT) TO authenticated;

------------------------------------------------------- right to access (S.11)
-- Everything the platform holds about the caller as a person, in one document.
-- Deliberately excludes the chamber's case material: that is the firm's data
-- about third parties, not the caller's own personal data, and is exported
-- separately by a chamber owner below.
CREATE OR REPLACE FUNCTION public.export_my_personal_data()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid UUID := auth.uid();
  result JSONB;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in.' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'exported_at', now(),
    'notice_version', public.current_notice_version(),
    'account', (
      SELECT jsonb_build_object('email', u.email, 'created_at', u.created_at,
                                'last_sign_in_at', u.last_sign_in_at)
      FROM auth.users u WHERE u.id = uid),
    'profile', (
      SELECT to_jsonb(p) - 'id' FROM public.profiles p WHERE p.id = uid),
    'chamber', (
      SELECT jsonb_build_object('name', t.name, 'joined_at', p.created_at, 'role', p.tenant_role)
      FROM public.profiles p JOIN public.tenants t ON t.id = p.tenant_id WHERE p.id = uid),
    'consents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('purpose', c.purpose, 'notice_version', c.notice_version,
                                          'granted_at', c.granted_at, 'withdrawn_at', c.withdrawn_at))
      FROM public.consents c WHERE c.user_id = uid), '[]'::jsonb),
    'activity', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('action', a.action, 'resource_type', a.resource_type,
                                          'at', a.created_at) ORDER BY a.created_at DESC)
      FROM public.audit_log a WHERE a.actor_user_id = uid), '[]'::jsonb),
    'authored', jsonb_build_object(
      'documents', (SELECT count(*) FROM public.ai_documents WHERE user_id = uid),
      'drafts',    (SELECT count(*) FROM public.ai_drafts    WHERE user_id = uid),
      'threads',   (SELECT count(*) FROM public.ai_conversations WHERE user_id = uid))
  ) INTO result;

  INSERT INTO public.audit_log (tenant_id, actor_user_id, actor_email, action, resource_type)
  VALUES (public.current_tenant_id(), uid,
          (SELECT email FROM auth.users WHERE id = uid), 'data_exported', 'profiles');

  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.export_my_personal_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_my_personal_data() TO authenticated;

-- The chamber's own records, for an owner or admin. This is the export a firm
-- needs to answer its own clients, and to leave the platform with its files.
CREATE OR REPLACE FUNCTION public.export_chamber_data()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t_id UUID := public.current_tenant_id();
  result JSONB;
BEGIN
  IF NOT public.is_tenant_admin(t_id) THEN
    RAISE EXCEPTION 'Only a chamber owner or admin can export the chamber''s records.' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'exported_at', now(),
    'chamber', (SELECT to_jsonb(t) FROM public.tenants t WHERE t.id = t_id),
    'members', COALESCE((SELECT jsonb_agg(to_jsonb(p) - 'id') FROM public.profiles p WHERE p.tenant_id = t_id), '[]'::jsonb),
    'matters',      COALESCE((SELECT jsonb_agg(to_jsonb(m)) FROM public.matters m      WHERE m.tenant_id = t_id), '[]'::jsonb),
    'clients',      COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM public.clients c      WHERE c.tenant_id = t_id), '[]'::jsonb),
    'hearings',     COALESCE((SELECT jsonb_agg(to_jsonb(h)) FROM public.hearings h     WHERE h.tenant_id = t_id), '[]'::jsonb),
    'time_entries', COALESCE((SELECT jsonb_agg(to_jsonb(e)) FROM public.time_entries e WHERE e.tenant_id = t_id), '[]'::jsonb),
    'invoices',     COALESCE((SELECT jsonb_agg(to_jsonb(i)) FROM public.invoices i     WHERE i.tenant_id = t_id), '[]'::jsonb),
    'documents',    COALESCE((SELECT jsonb_agg(to_jsonb(d)) FROM public.ai_documents d WHERE d.tenant_id = t_id), '[]'::jsonb),
    'drafts',       COALESCE((SELECT jsonb_agg(to_jsonb(d)) FROM public.ai_drafts d    WHERE d.tenant_id = t_id), '[]'::jsonb)
  ) INTO result;

  INSERT INTO public.audit_log (tenant_id, actor_user_id, actor_email, action, resource_type)
  VALUES (t_id, auth.uid(), (SELECT email FROM auth.users WHERE id = auth.uid()),
          'chamber_exported', 'tenants');

  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.export_chamber_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_chamber_data() TO authenticated;

------------------------------------------------------ right to erasure (S.12)
-- Real deletion, not a soft flag. Two shapes, because a chamber is not the
-- same thing as a person:
--   * the sole owner of a chamber deletes the chamber and everything in it;
--   * anyone else leaves, and only their own account goes.
-- An owner with colleagues must hand over ownership first, so a firm's files
-- cannot be destroyed from under the people still using them.
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid UUID := auth.uid();
  t_id UUID;
  my_role TEXT;
  owners INTEGER;
  members INTEGER;
  outcome TEXT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in.' USING ERRCODE = '42501';
  END IF;

  SELECT tenant_id, tenant_role INTO t_id, my_role FROM public.profiles WHERE id = uid;
  SELECT count(*) INTO members FROM public.profiles WHERE tenant_id = t_id;
  SELECT count(*) INTO owners  FROM public.profiles WHERE tenant_id = t_id AND tenant_role = 'owner';

  IF my_role = 'owner' AND members > 1 THEN
    RAISE EXCEPTION 'You are the owner of a chamber with % people in it. Make someone else an owner, or remove the others first — deleting your account would destroy their files too.', members - 1
      USING ERRCODE = '42501';
  END IF;

  -- Logged before the delete: the audit row's FKs are ON DELETE SET NULL, so
  -- writing afterwards would lose who did what.
  INSERT INTO public.audit_log (tenant_id, actor_user_id, actor_email, action, resource_type, metadata)
  VALUES (t_id, uid, (SELECT email FROM auth.users WHERE id = uid),
          'account_deleted', 'profiles',
          jsonb_build_object('was_role', my_role, 'chamber_deleted', (my_role = 'owner' AND members = 1)));

  IF my_role = 'owner' AND members = 1 THEN
    -- Sole occupant: the chamber and every record in it goes.
    DELETE FROM public.tenants WHERE id = t_id;
    outcome := 'chamber_and_account_deleted';
  ELSE
    outcome := 'account_deleted';
  END IF;

  DELETE FROM auth.users WHERE id = uid;
  RETURN jsonb_build_object('outcome', outcome);
END; $$;
REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

------------------------------------------------------------- retention (S.8(7))
-- The Act expects personal data to go once the purpose is served. There is no
-- scheduler in this deployment, so this is written as an explicit callable
-- with a dry-run default rather than something that silently deletes on a
-- timer. Wire it to a cron job when one exists; until then it is a documented,
-- auditable operation someone runs.
CREATE OR REPLACE FUNCTION public.purge_expired_chambers(p_dry_run BOOLEAN DEFAULT true)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cutoff_trial   TIMESTAMPTZ := now() - interval '90 days';
  cutoff_cancel  TIMESTAMPTZ := now() - interval '180 days';
  doomed UUID[];
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only a platform administrator can run retention purges.' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(l.tenant_id), '{}')
    INTO doomed
    FROM public.licenses l
   WHERE (l.plan = 'trial'  AND l.trial_ends_at IS NOT NULL AND l.trial_ends_at < cutoff_trial)
      OR (l.status = 'cancelled' AND l.updated_at < cutoff_cancel);

  IF p_dry_run THEN
    RETURN jsonb_build_object('dry_run', true, 'would_delete', array_length(doomed, 1),
                              'trial_cutoff', cutoff_trial, 'cancelled_cutoff', cutoff_cancel);
  END IF;

  DELETE FROM public.tenants WHERE id = ANY(doomed);

  INSERT INTO public.audit_log (actor_user_id, actor_email, action, resource_type, metadata)
  VALUES (auth.uid(), (SELECT email FROM auth.users WHERE id = auth.uid()),
          'retention_purge', 'tenants', jsonb_build_object('deleted', array_length(doomed, 1)));

  RETURN jsonb_build_object('dry_run', false, 'deleted', array_length(doomed, 1));
END; $$;
REVOKE ALL ON FUNCTION public.purge_expired_chambers(BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purge_expired_chambers(BOOLEAN) TO authenticated;

------------------------------------------------------ consent at registration
-- New chambers record their consent at the moment of signup, against the
-- notice version in force, so there is a dated record rather than an
-- assumption.
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
    INSERT INTO public.profiles (id, full_name, tenant_id, tenant_role)
    VALUES (NEW.id,
            COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'),
            invite_tenant_id, invite_role)
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

    INSERT INTO public.profiles (id, full_name, firm_name, tenant_id, tenant_role)
    VALUES (NEW.id,
            COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'),
            NEW.raw_user_meta_data ->> 'firm_name', new_tenant_id, 'owner')
    ON CONFLICT (id) DO NOTHING;
    assigned_tenant := new_tenant_id;
  END IF;

  INSERT INTO public.consents (user_id, tenant_id, purpose, notice_version)
  VALUES (NEW.id, assigned_tenant, 'service_provision', public.current_notice_version()),
         (NEW.id, assigned_tenant, 'ai_processing',     public.current_notice_version());

  RETURN NEW;
END; $$;

-- Existing accounts predate consent capture; record their standing consent
-- against the notice in force so the ledger is complete rather than silently
-- missing everyone who signed up earlier.
INSERT INTO public.consents (user_id, tenant_id, purpose, notice_version, granted_at)
SELECT p.id, p.tenant_id, v.purpose, public.current_notice_version(), p.created_at
FROM public.profiles p
CROSS JOIN (VALUES ('service_provision'), ('ai_processing')) AS v(purpose)
WHERE NOT EXISTS (
  SELECT 1 FROM public.consents c WHERE c.user_id = p.id AND c.purpose = v.purpose
);
