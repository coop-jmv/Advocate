-- log_license_admin_action()/log_tenant_admin_action() already capture who
-- changed what and when (actor_user_id, actor_email, created_at) via the
-- existing audit_log table — but only the NEW value, so seeing what a plan
-- or status actually changed *from* means scanning back to the previous row
-- for that resource. Adding the OLD values to metadata makes each row a
-- self-contained diff.

CREATE OR REPLACE FUNCTION public.log_tenant_admin_action() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_log (tenant_id, actor_user_id, actor_email, action, resource_type, resource_id, metadata)
  VALUES (
    COALESCE(NEW.id, OLD.id), auth.uid(),
    (SELECT email FROM auth.users WHERE id = auth.uid()),
    lower(TG_OP), 'tenants', COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP = 'UPDATE' THEN
      jsonb_build_object('name', NEW.name, 'status', NEW.status, 'old_status', OLD.status)
    ELSE
      jsonb_build_object('name', COALESCE(NEW.name, OLD.name), 'status', COALESCE(NEW.status, OLD.status))
    END
  );
  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE OR REPLACE FUNCTION public.log_license_admin_action() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_log (tenant_id, actor_user_id, actor_email, action, resource_type, resource_id, metadata)
  VALUES (
    COALESCE(NEW.tenant_id, OLD.tenant_id), auth.uid(),
    (SELECT email FROM auth.users WHERE id = auth.uid()),
    lower(TG_OP), 'licenses', COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP = 'UPDATE' THEN
      jsonb_build_object(
        'plan', NEW.plan, 'old_plan', OLD.plan,
        'status', NEW.status, 'old_status', OLD.status,
        'billing_cadence', NEW.billing_cadence,
        'current_period_end', NEW.current_period_end
      )
    ELSE
      jsonb_build_object('plan', COALESCE(NEW.plan, OLD.plan), 'status', COALESCE(NEW.status, OLD.status))
    END
  );
  RETURN COALESCE(NEW, OLD);
END; $$;
