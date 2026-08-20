import {
  Bot,
  Briefcase,
  CalendarDays,
  CreditCard,
  FolderOpen,
  LayoutDashboard,
  type LucideIcon,
  Mic,
  PenLine,
  ReceiptIndianRupee,
  ShieldCheck,
  ShieldQuestion,
  Sparkles,
  Users,
  UsersRound,
} from "lucide-react";

// The one place the app's destinations are defined. Both surfaces read from
// here so they cannot drift: the sidebar (AppShell, md and up) renders this
// list flat in order, and the mobile launcher (/app/menu) renders it grouped.
// Adding a destination means adding one entry below and nothing else.

export const DESTINATION_GROUPS = ["Today", "Casework", "Drafting", "Chamber"] as const;
export type DestinationGroup = (typeof DESTINATION_GROUPS)[number];

// Shape contract for each entry. Applied with `satisfies` rather than as an
// annotation so `to` keeps its literal type — TanStack Router's <Link to> is
// typed against the generated route tree and rejects a widened string.
type DestinationShape = {
  to: string;
  label: string;
  icon: LucideIcon;
  group: DestinationGroup;
  /** One-line description; shown as the tile tooltip on the mobile launcher. */
  blurb: string;
  /**
   * Match this route exactly rather than as a prefix. Only the dashboard needs
   * it: "/app" is a prefix of every other destination, so without it the
   * dashboard would highlight as active on every screen.
   */
  exact?: boolean;
};

// Order here is the sidebar order.
export const APP_DESTINATIONS = [
  {
    to: "/app",
    label: "Dashboard",
    icon: LayoutDashboard,
    exact: true,
    group: "Today",
    blurb: "Hearings, WIP and outstanding at a glance",
  },
  {
    to: "/app/assistant",
    label: "AI assistant",
    icon: Bot,
    group: "Drafting",
    blurb: "Procedure, limitation and strategy",
  },
  {
    to: "/app/insights",
    label: "Diary insights",
    icon: Sparkles,
    group: "Today",
    blurb: "Risks and gaps across the week ahead",
  },
  {
    to: "/app/cases",
    label: "Cases",
    icon: Briefcase,
    group: "Casework",
    blurb: "Matters, parties and status",
  },
  {
    to: "/app/diary",
    label: "Court diary",
    icon: CalendarDays,
    group: "Today",
    blurb: "Cause lists, hearings and reminders",
  },
  {
    to: "/app/documents",
    label: "Documents",
    icon: FolderOpen,
    group: "Casework",
    blurb: "Scan, OCR and review",
  },
  {
    to: "/app/drafting",
    label: "Drafting studio",
    icon: PenLine,
    group: "Drafting",
    blurb: "Notices, petitions and opinions",
  },
  {
    to: "/app/dictation",
    label: "Voice dictation",
    icon: Mic,
    group: "Drafting",
    blurb: "Dictate and format on the move",
  },
  {
    to: "/app/clients",
    label: "Clients",
    icon: Users,
    group: "Casework",
    blurb: "Contacts and instructions",
  },
  {
    to: "/app/billing",
    label: "Billing",
    icon: ReceiptIndianRupee,
    group: "Chamber",
    blurb: "Time entries and GST invoices",
  },
  {
    to: "/app/team",
    label: "Team",
    icon: UsersRound,
    group: "Chamber",
    blurb: "Members, roles and seats",
  },
  {
    to: "/app/audit-log",
    label: "Audit log",
    icon: ShieldCheck,
    group: "Chamber",
    blurb: "Who did what, and when",
  },
  {
    to: "/app/subscription",
    label: "Subscription",
    icon: CreditCard,
    group: "Chamber",
    blurb: "Your plan, trial status and upgrades",
  },
  {
    to: "/app/profile",
    label: "Profile & privacy",
    icon: ShieldQuestion,
    group: "Chamber",
    blurb: "Your account, consent and data rights",
  },
] as const satisfies readonly DestinationShape[];

export type AppDestination = (typeof APP_DESTINATIONS)[number];

/**
 * The same destinations bucketed for the launcher, in DESTINATION_GROUPS
 * order. Groups with no destinations are dropped, so removing the last entry
 * of a group cannot leave an empty heading behind.
 */
export function groupedDestinations(): {
  group: DestinationGroup;
  items: readonly AppDestination[];
}[] {
  return DESTINATION_GROUPS.map((group) => ({
    group,
    items: APP_DESTINATIONS.filter((item) => item.group === group),
  })).filter((section) => section.items.length > 0);
}
