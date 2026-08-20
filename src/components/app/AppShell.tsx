import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LayoutGrid, Scale, Search, Bell, WifiOff, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logAuthEvent } from "@/lib/edge-functions";
import { APP_DESTINATIONS } from "@/lib/navigation";

export function AppShell({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<{ full_name: string | null; firm_name: string | null }>({
    full_name: null,
    firm_name: null,
  });

  // The sidebar used to show a hardcoded sample advocate; show whoever is
  // actually signed in.
  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("profiles")
      .select("full_name, firm_name")
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setProfile(data);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const displayName = profile.full_name ?? "Your chamber";
  const displayFirm = profile.firm_name ?? "";
  const initials =
    (profile.full_name ?? "")
      .replace(/^(Adv\.|Mr\.|Ms\.|Mrs\.)\s*/i, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "—";

  async function handleSignOut() {
    await logAuthEvent({ event: "logout" });
    await supabase.auth.signOut();
    void navigate({ to: "/auth" });
  }

  return (
    <div className="min-h-screen bg-background md:flex">
      <aside className="bg-sidebar text-sidebar-foreground md:flex md:w-16 md:shrink-0 md:flex-col md:items-center lg:w-60 lg:items-stretch">
        <Link
          to="/"
          className="flex h-16 items-center gap-2.5 border-b border-sidebar-border px-5 md:w-full md:justify-center md:px-0 lg:justify-start lg:px-5"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded bg-sidebar-primary text-sidebar-primary-foreground">
            <Scale className="size-4" />
          </span>
          <span className="font-display text-sm font-bold text-sidebar-accent-foreground md:hidden lg:inline">
            Wakilio
          </span>
        </Link>

        <nav className="hidden md:flex md:w-full md:flex-col md:gap-1 md:p-3 md:items-center lg:items-stretch">
          {APP_DESTINATIONS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: "exact" in item ? item.exact : false }}
              title={item.label}
              className="flex min-h-[3.25rem] shrink-0 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-center text-[11px] leading-tight text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground md:min-h-0 md:w-11 md:flex-row md:justify-center md:gap-2.5 md:rounded md:px-0 md:py-2 md:text-sm lg:w-full lg:justify-start lg:px-3"
              activeProps={{
                className:
                  "bg-sidebar-accent text-sidebar-accent-foreground font-semibold shadow-sm ring-1 ring-sidebar-primary/40 md:ring-0",
              }}
            >
              <item.icon className="size-5 shrink-0 md:size-4" />
              <span className="md:hidden lg:inline">{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="mt-auto hidden border-t border-sidebar-border p-3 md:flex md:w-full md:flex-col md:items-center lg:p-5">
          <div className="hidden items-center gap-2 text-xs text-sidebar-foreground/70 lg:flex">
            <WifiOff className="size-3.5" />
            Offline diary synced 12 min ago
          </div>
          <div className="flex items-center gap-3 lg:mt-4">
            <Link
              to="/app/profile"
              title={displayFirm ? `${displayName} — ${displayFirm}` : displayName}
              className="flex min-w-0 flex-1 items-center gap-3 rounded transition-colors hover:bg-sidebar-accent/60 md:justify-center lg:justify-start lg:p-1"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sidebar-accent font-display text-sm font-bold text-sidebar-accent-foreground">
                {initials}
              </span>
              <div className="hidden min-w-0 text-xs lg:block">
                <p className="truncate font-semibold text-sidebar-accent-foreground">
                  {displayName}
                </p>
                <p className="truncate text-sidebar-foreground/65">{displayFirm}</p>
              </div>
            </Link>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              title="Sign out"
              aria-label="Sign out"
              className="ml-auto rounded p-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground lg:ml-2"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex flex-wrap items-center gap-4 border-b border-border bg-card px-4 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold sm:text-xl">{title}</h1>
            {subtitle ? (
              <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground sm:truncate">
                {subtitle}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded border border-input px-3 py-2 text-sm text-muted-foreground md:flex">
              <Search className="size-4" />
              <span>Search CNR, matter or client</span>
            </div>
            <button
              type="button"
              className="relative rounded border border-input p-2 transition-colors hover:bg-secondary"
              aria-label="Notifications"
            >
              <Bell className="size-4" />
              <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-destructive" />
            </button>
            <Link
              to="/app/menu"
              title="Menu"
              aria-label="Menu"
              className="rounded border border-input p-2 transition-colors hover:bg-secondary md:hidden"
              activeProps={{ className: "bg-secondary" }}
            >
              <LayoutGrid className="size-4" />
            </Link>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              title="Sign out"
              aria-label="Sign out"
              className="rounded border border-input p-2 transition-colors hover:bg-secondary md:hidden"
            >
              <LogOut className="size-4" />
            </button>
            {action}
          </div>
        </header>

        <main className="p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

export function AppLayout() {
  return <Outlet />;
}
