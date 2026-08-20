import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bot,
  Briefcase,
  CalendarDays,
  FolderOpen,
  LayoutDashboard,
  Mic,
  PenLine,
  ReceiptIndianRupee,
  ShieldCheck,
  Sparkles,
  Users,
  UsersRound,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";

export const Route = createFileRoute("/_authenticated/app/menu")({
  head: () => ({
    meta: [
      { title: "Menu — Wakilio" },
      { name: "description", content: "Every part of your chamber, one tap away." },
    ],
  }),
  component: Menu,
});

// The mobile home screen. On a phone the sidebar collapses to a single Menu
// button, so this is the landing page after signing in: every destination as
// a tile, tap to open. On larger screens the sidebar already does this job,
// which is why this page is reachable but never forced there.
const sections = [
  {
    group: "Today",
    items: [
      {
        to: "/app",
        label: "Dashboard",
        icon: LayoutDashboard,
        blurb: "Hearings, WIP and outstanding at a glance",
      },
      {
        to: "/app/diary",
        label: "Court diary",
        icon: CalendarDays,
        blurb: "Cause lists, hearings and reminders",
      },
      {
        to: "/app/insights",
        label: "Diary insights",
        icon: Sparkles,
        blurb: "Risks and gaps across the week ahead",
      },
    ],
  },
  {
    group: "Casework",
    items: [
      { to: "/app/cases", label: "Cases", icon: Briefcase, blurb: "Matters, parties and status" },
      { to: "/app/clients", label: "Clients", icon: Users, blurb: "Contacts and instructions" },
      {
        to: "/app/documents",
        label: "Documents",
        icon: FolderOpen,
        blurb: "Scan, OCR and review",
      },
    ],
  },
  {
    group: "Drafting",
    items: [
      {
        to: "/app/drafting",
        label: "Drafting studio",
        icon: PenLine,
        blurb: "Notices, petitions and opinions",
      },
      {
        to: "/app/dictation",
        label: "Voice dictation",
        icon: Mic,
        blurb: "Dictate and format on the move",
      },
      {
        to: "/app/assistant",
        label: "AI assistant",
        icon: Bot,
        blurb: "Procedure, limitation and strategy",
      },
    ],
  },
  {
    group: "Chamber",
    items: [
      {
        to: "/app/billing",
        label: "Billing",
        icon: ReceiptIndianRupee,
        blurb: "Time entries and GST invoices",
      },
      { to: "/app/team", label: "Team", icon: UsersRound, blurb: "Members, roles and seats" },
      {
        to: "/app/audit-log",
        label: "Audit log",
        icon: ShieldCheck,
        blurb: "Who did what, and when",
      },
    ],
  },
] as const;

function Menu() {
  return (
    <AppShell title="Menu" subtitle="Every part of your chamber, one tap away">
      <div className="space-y-7">
        {sections.map((section) => (
          <section key={section.group}>
            <h2 className="text-eyebrow text-accent">{section.group}</h2>
            <div className="mt-3 grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
              {section.items.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  activeOptions={{ exact: item.to === "/app" }}
                  title={item.blurb}
                  className="group surface-panel flex min-h-28 flex-col items-center justify-center gap-2.5 rounded-xl p-3 text-center transition-colors hover:border-primary/40 hover:bg-secondary"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <item.icon className="size-5" />
                  </span>
                  <span className="text-xs leading-tight font-semibold">{item.label}</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </AppShell>
  );
}
