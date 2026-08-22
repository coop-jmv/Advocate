import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logAuthEvent } from "@/lib/edge-functions";

// Privileged case data sits behind an unattended, still-signed-in browser
// tab otherwise — 30 minutes of no activity anywhere in the authenticated
// app (mouse, keyboard, touch or scroll) signs the chamber out, with a
// 2-minute warning first so it never surprises someone mid-task.
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
const WARNING_BEFORE_MS = 2 * 60 * 1000;
const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "wheel"] as const;
// Activity events fire far more often than the timers need resetting — a
// scroll gesture alone can dispatch dozens of "wheel" events a second.
const RESET_THROTTLE_MS = 5000;

export function useInactivityLogout() {
  const navigate = useNavigate();

  useEffect(() => {
    let warnTimer: number | undefined;
    let logoutTimer: number | undefined;
    let toastId: string | number | undefined;
    let lastReset = 0;

    function clearTimers() {
      if (warnTimer !== undefined) window.clearTimeout(warnTimer);
      if (logoutTimer !== undefined) window.clearTimeout(logoutTimer);
      if (toastId !== undefined) toast.dismiss(toastId);
    }

    async function doSignOut() {
      clearTimers();
      await logAuthEvent({ event: "logout" });
      await supabase.auth.signOut();
      void navigate({ to: "/auth" });
      toast.message("Signed out after 30 minutes of inactivity.");
    }

    function scheduleTimers() {
      clearTimers();
      warnTimer = window.setTimeout(() => {
        toastId = toast.warning("You'll be signed out soon due to inactivity.", {
          duration: WARNING_BEFORE_MS,
          action: { label: "Stay signed in", onClick: () => resetActivity() },
        });
      }, INACTIVITY_TIMEOUT_MS - WARNING_BEFORE_MS);

      logoutTimer = window.setTimeout(() => {
        void doSignOut();
      }, INACTIVITY_TIMEOUT_MS);
    }

    function resetActivity() {
      const now = Date.now();
      if (now - lastReset < RESET_THROTTLE_MS) return;
      lastReset = now;
      scheduleTimers();
    }

    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, resetActivity, { passive: true });
    }
    scheduleTimers();

    return () => {
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, resetActivity);
      }
      clearTimers();
    };
  }, [navigate]);
}
