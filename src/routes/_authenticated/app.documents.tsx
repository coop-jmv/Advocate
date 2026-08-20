import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { DocumentIntelligence } from "@/components/app/DocumentIntelligence";

export const Route = createFileRoute("/_authenticated/app/documents")({
  head: () => ({
    meta: [
      { title: "Documents — LexDiary" },
      {
        name: "description",
        content:
          "Scan or paste a document and get an AI summary, parties, key dates, tags and drafting risks — reviewed and saved to your chamber.",
      },
      { property: "og:title", content: "Documents — LexDiary" },
      {
        property: "og:description",
        content: "AI document review: summary, parties, key dates, tags and drafting risks.",
      },
    ],
  }),
  component: Documents,
});

function Documents() {
  return (
    <AppShell
      title="Documents"
      subtitle="Scan, paste or upload a document — AI reviews it, you approve or reject"
    >
      <DocumentIntelligence />
    </AppShell>
  );
}
