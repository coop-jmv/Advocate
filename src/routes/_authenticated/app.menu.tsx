import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { groupedDestinations } from "@/lib/navigation";

export const Route = createFileRoute("/_authenticated/app/menu")({
  head: () => ({
    meta: [
      { title: "Menu — Wakilio" },
      { name: "description", content: "Every part of your chamber, one tap away." },
    ],
  }),
  component: Menu,
});

// The mobile home screen. On a phone the sidebar collapses to a Menu button,
// so this is the landing page after signing in: every destination as a tile,
// tap to open. Destinations and their grouping come from @/lib/navigation, the
// same list the sidebar renders, so the two can never fall out of step.
function Menu() {
  const sections = groupedDestinations();

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
                  activeOptions={{ exact: "exact" in item ? item.exact : false }}
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
