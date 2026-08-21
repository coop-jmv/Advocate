import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { ShieldCheck, Building2, ListChecks, Puzzle, ScrollText } from "lucide-react";

export const Route = createFileRoute("/_admin/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <div className="min-h-screen bg-secondary/30">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-y-2 px-6 py-4">
          <Link to="/admin" className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded bg-ink text-background">
              <ShieldCheck className="size-4" />
            </span>
            <span className="font-display text-base font-bold">Platform admin</span>
          </Link>
          <nav className="flex flex-wrap items-center gap-4 text-sm font-medium text-muted-foreground">
            <Link
              to="/admin"
              className="flex items-center gap-1.5 hover:text-foreground"
              activeProps={{ className: "text-foreground" }}
            >
              <Building2 className="size-4" />
              Tenants
            </Link>
            <Link
              to="/admin/settings/integrations"
              className="flex items-center gap-1.5 hover:text-foreground"
              activeProps={{ className: "text-foreground" }}
            >
              <Puzzle className="size-4" />
              Settings · Integrations
            </Link>
            <Link
              to="/admin/cause-list-sources"
              className="flex items-center gap-1.5 hover:text-foreground"
              activeProps={{ className: "text-foreground" }}
            >
              <ListChecks className="size-4" />
              Cause list sources
            </Link>
            <Link
              to="/admin/audit-log"
              className="flex items-center gap-1.5 hover:text-foreground"
              activeProps={{ className: "text-foreground" }}
            >
              <ScrollText className="size-4" />
              Audit log
            </Link>
            <Link to="/app" className="hover:text-foreground">
              Back to app
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
