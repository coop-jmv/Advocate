import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { groupedDestinations, GROUP_TONE } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const tileToneClasses = {
  sapphire:
    "bg-docket-sapphire/12 text-docket-sapphire group-hover:bg-docket-sapphire group-hover:text-docket-sapphire-foreground",
  amber:
    "bg-docket-amber/12 text-docket-amber group-hover:bg-docket-amber group-hover:text-docket-amber-foreground",
  teal: "bg-docket-teal/12 text-docket-teal group-hover:bg-docket-teal group-hover:text-docket-teal-foreground",
  rose: "bg-docket-rose/12 text-docket-rose group-hover:bg-docket-rose group-hover:text-docket-rose-foreground",
} as const;

export const Route = createFileRoute("/_authenticated/app/menu")({
  head: () => ({
    meta: [
      { title: "Menu — LexDiary" },
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
        {sections.map((section) => {
          const toneClasses = tileToneClasses[GROUP_TONE[section.group]];
          return (
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
                    <span
                      className={cn(
                        "flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors",
                        toneClasses,
                      )}
                    >
                      <item.icon className="size-5" />
                    </span>
                    <span className="text-xs leading-tight font-semibold">{item.label}</span>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </AppShell>
  );
}
