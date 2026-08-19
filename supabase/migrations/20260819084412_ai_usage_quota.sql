-- Basic per-user daily quota for paid AI/OCR calls. Every edge function that
-- calls the AI gateway was previously callable an unlimited number of times
-- by any confirmed signup, with no server-side cost control.

CREATE TABLE public.ai_usage_daily (
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  usage_date DATE NOT NULL DEFAULT current_date,
  call_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_date)
);

GRANT SELECT ON public.ai_usage_daily TO authenticated;
GRANT ALL ON public.ai_usage_daily TO service_role;
ALTER TABLE public.ai_usage_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own AI usage" ON public.ai_usage_daily
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- SECURITY DEFINER so the only write path is this function, and it always
-- uses the caller's own auth.uid() — never a client-supplied user id — so
-- there is no way to inflate/read/reset another user's counter.
CREATE OR REPLACE FUNCTION public.increment_ai_usage()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_count INTEGER;
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.ai_usage_daily (user_id, usage_date, call_count)
  VALUES (uid, current_date, 1)
  ON CONFLICT (user_id, usage_date)
  DO UPDATE SET call_count = public.ai_usage_daily.call_count + 1
  RETURNING call_count INTO new_count;

  RETURN new_count;
END; $$;

REVOKE ALL ON FUNCTION public.increment_ai_usage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_ai_usage() TO authenticated;
