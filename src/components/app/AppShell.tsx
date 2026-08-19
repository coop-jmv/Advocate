import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Briefcase,
  CalendarDays,
  FolderOpen,
  Users,
  ReceiptIndianRupee,
  Scale,
  Search,
  Mic,
  Bell,
  Bot,
  Sparkles,
  PenLine,
  WifiOff,
  LogOut,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logAuthEvent } from "@/lib/edge-functions";

const navItems = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/app/assistant", label: "AI assistant", icon: Bot },
  { to: "/app/insights", label: "Diary insights", icon: Sparkles },
  { to: "/app/cases", label: "Cases", icon: Briefcase },
  { to: "/app/diary", label: "Court diary", icon: CalendarDays },
  { to: "/app/documents", label: "Documents", icon: FolderOpen },
  { to: "/app/drafting", label: "Drafting studio", icon: PenLine },
  { to: "/app/dictation", label: "Voice dictation", icon: Mic },
  { to: "/app/clients", label: "Clients", icon: Users },
  { to: "/app/billing", label: "Billing", icon: ReceiptIndianRupee },
  { to: "/app/team", label: "Team", icon: UsersRound },
  { to: "/app/audit-log", label: "Audit log", icon: ShieldCheck },
] as const;

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
            Advocate Companion
          </span>
        </Link>

        <nav className="flex gap-1 overflow-x-auto p-3 md:w-full md:flex-col md:items-center md:overflow-visible lg:items-stretch">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: "exact" in item ? item.exact : false }}
              title={item.label}
              className="flex shrink-0 items-center gap-2.5 rounded px-3 py-2 text-sm text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:w-11 md:justify-center md:px-0 lg:w-full lg:justify-start lg:px-3"
              activeProps={{
                className: "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
              }}
            >
              <item.icon className="size-4 shrink-0" />
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
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sidebar-accent font-display text-sm font-bold text-sidebar-accent-foreground"
              title="Adv. Priya Nair — Nair & Associates"
            >
              PN
            </span>
            <div className="hidden text-xs lg:block">
              <p className="font-semibold text-sidebar-accent-foreground">Adv. Priya Nair</p>
              <p className="text-sidebar-foreground/65">Nair &amp; Associates</p>
            </div>
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
              <p className="mt-0.5 truncate text-sm text-muted-foreground">{subtitle}</p>
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
