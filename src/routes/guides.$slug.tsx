import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { canonical, guideJsonLd } from "@/lib/seo";
import { findGuide, GUIDES, type GuideBlock } from "@/lib/guides";
import { SiteHeader, SiteFooter } from "@/components/site/SiteChrome";

export const Route = createFileRoute("/guides/$slug")({
  loader: ({ params }) => {
    const guide = findGuide(params.slug);
    if (!guide) throw notFound();
    return guide;
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    const path = `/guides/${loaderData.slug}`;
    return {
      meta: [
        { title: `${loaderData.title} | LexDiary` },
        { name: "description", content: loaderData.description },
        { property: "og:title", content: loaderData.title },
        { property: "og:description", content: loaderData.description },
        { property: "og:type", content: "article" },
        { property: "article:published_time", content: loaderData.published },
        { property: "article:modified_time", content: loaderData.updated },
        canonical(path).meta,
      ],
      links: [canonical(path).link],
      scripts: [{ type: "application/ld+json", children: guideJsonLd(loaderData) }],
    };
  },
  component: GuidePage,
});

function Block({ block }: { block: GuideBlock }) {
  switch (block.type) {
    case "h2":
      return <h2 className="mt-10 font-display text-xl font-bold">{block.text}</h2>;
    case "p":
      return <p className="mt-4 leading-relaxed text-muted-foreground">{block.text}</p>;
    case "ul":
      return (
        <ul className="mt-4 list-disc space-y-2 pl-5 text-muted-foreground">
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-muted-foreground">
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      );
    case "note":
      return (
        <p className="mt-6 rounded border border-border bg-secondary/50 px-4 py-3 text-sm">
          {block.text}
        </p>
      );
  }
}

function GuidePage() {
  const guide = Route.useLoaderData();
  const others = GUIDES.filter((g) => g.slug !== guide.slug);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-16">
        <Link
          to="/guides"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> All guides
        </Link>
        <article className="mt-6">
          <h1 className="text-3xl leading-tight font-bold sm:text-4xl">{guide.title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Updated <time dateTime={guide.updated}>{guide.updated}</time> · {guide.readingMinutes}{" "}
            min read
          </p>
          <div className="mt-6">
            {guide.blocks.map((block, index) => (
              <Block key={index} block={block} />
            ))}
          </div>
        </article>

        <section className="mt-14 rounded border border-border bg-secondary/40 p-6">
          <h2 className="font-display text-lg font-bold">Run your practice from one workspace</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Matters, your court diary, drafting and billing, built for Indian courts.
          </p>
          <Link
            to="/auth"
            search={{ mode: "signup" }}
            className="mt-4 inline-block rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-ink"
          >
            Start free — no card needed
          </Link>
        </section>

        <section className="mt-12">
          <h2 className="font-display text-lg font-bold">More guides</h2>
          <ul className="mt-3 space-y-2">
            {others.map((g) => (
              <li key={g.slug}>
                <Link
                  to="/guides/$slug"
                  params={{ slug: g.slug }}
                  className="text-sm text-accent hover:underline"
                >
                  {g.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
