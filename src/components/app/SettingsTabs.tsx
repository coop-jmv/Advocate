import { Link } from "@tanstack/react-router";

// The four pages that used to be separate top-level nav entries, now
// consolidated under one "Settings" destination (see navigation.ts) and
// switched between as tabs instead. Each page still owns its own route,
// data-loading and AppShell title/subtitle — this is just the strip that
// lets you move between them without going back to the main menu.
const TABS = [
  { to: "/app/profile", label: "Profile & privacy" },
  { to: "/app/team", label: "Team" },
  { to: "/app/subscription", label: "Subscription" },
  { to: "/app/audit-log", label: "Audit log" },
] as const;

export function SettingsTabs() {
  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
      {TABS.map((tab) => (
        <Link
          key={tab.to}
          to={tab.to}
          className="shrink-0 border-b-2 border-transparent px-3 py-2.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground"
          activeProps={{ className: "border-accent text-foreground font-semibold" }}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
