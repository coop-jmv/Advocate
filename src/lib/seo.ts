// Search/SEO helpers for the public marketing pages.
//
// https://lexdiary.online is the one canonical origin (it is also what the
// Capacitor app loads — see capacitor.config.ts). The same Worker also answers
// on *.workers.dev, which serves byte-identical pages; canonical links point
// search engines at the custom domain, and server-handler.ts additionally
// sends `X-Robots-Tag: noindex` from any other host.
//
// Keep public/sitemap.xml in step with the pages that call canonical().
export const SITE_URL = "https://lexdiary.online";
export const SITE_NAME = "LexDiary";
export const OG_IMAGE_URL = `${SITE_URL}/og-image.png`;

/** Canonical link + og:url for a public page. `path` must start with "/". */
export function canonical(path: string) {
  const url = `${SITE_URL}${path}`;
  return {
    link: { rel: "canonical", href: url },
    meta: { property: "og:url", content: url },
  };
}

/**
 * Structured data for the home page. Kept to facts the site itself states:
 * no ratings, reviews or prices, which Google treats as spam when they aren't
 * visible on the page.
 */
export const homeJsonLd = JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/icon-512.png`,
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: SITE_URL,
      publisher: { "@id": `${SITE_URL}/#organization` },
      inLanguage: "en-IN",
    },
    {
      "@type": "SoftwareApplication",
      name: SITE_NAME,
      url: SITE_URL,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web, Android",
      description:
        "Practice management software for Indian advocates and law firms: case and matter tracking, a court diary with cause-list matching, an AI case assistant and drafting studio, Indic OCR and GST billing.",
      publisher: { "@id": `${SITE_URL}/#organization` },
      areaServed: { "@type": "Country", name: "India" },
    },
  ],
});

/** Article + breadcrumb structured data for a guide page. */
export function guideJsonLd(guide: {
  slug: string;
  title: string;
  description: string;
  published: string;
  updated: string;
}) {
  const url = `${SITE_URL}/guides/${guide.slug}`;
  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: guide.title,
        description: guide.description,
        datePublished: guide.published,
        dateModified: guide.updated,
        mainEntityOfPage: url,
        image: OG_IMAGE_URL,
        inLanguage: "en-IN",
        author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
          { "@type": "ListItem", position: 2, name: "Guides", item: `${SITE_URL}/guides` },
          { "@type": "ListItem", position: 3, name: guide.title, item: url },
        ],
      },
    ],
  });
}
