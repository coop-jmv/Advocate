import { createFileRoute, Link } from "@tanstack/react-router";
import { canonical } from "@/lib/seo";
import { GUIDES } from "@/lib/guides";
import { SiteHeader, SiteFooter } from "@/components/site/SiteChrome";

export const Route = createFileRoute("/guides/")({
  head: () => ({
    meta: [
      { title: "Guides for Indian Advocates — Cause Lists, CNR, GST | LexDiary" },
      {
        name: "description",
        content:
          "Practical guides for Indian advocates: tracking cause lists, using CNR numbers, GST on legal fees and choosing practice management software.",
      },
      { property: "og:title", content: "Guides for Indian Advocates | LexDiary" },
      canonical("/guides").meta,
    ],
    links: [canonical("/guides").link],
  }),
  component: GuidesIndex,
});

function GuidesIndex() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-16">
        <p className="text-eyebrow text-accent">Guides</p>
        <h1 className="mt-4 text-4xl font-bold">Guides for Indian advocates</h1>
        <p className="mt-3 text-muted-foreground">
          Practical notes on the day-to-day work of a litigation practice in India.
        </p>
        <ul className="mt-10 space-y-6">
          {GUIDES.map((guide) => (
            <li key={guide.slug} className="rounded border border-border p-5">
              <Link
                to="/guides/$slug"
                params={{ slug: guide.slug }}
                className="font-display text-lg font-bold text-accent hover:underline"
              >
                {guide.title}
              </Link>
              <p className="mt-2 text-sm text-muted-foreground">{guide.description}</p>
              <p className="mt-2 text-xs text-muted-foreground">{guide.readingMinutes} min read</p>
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter />
    </div>
  );
}
