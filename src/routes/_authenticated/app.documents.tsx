import { createFileRoute } from "@tanstack/react-router";
import { FileText, Camera, ScanText } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { DocumentIntelligence } from "@/components/app/DocumentIntelligence";
import { DataTable, Tag, type Tone } from "@/components/app/primitives";
import { documents } from "@/lib/mock-data";

export const Route = createFileRoute("/_authenticated/app/documents")({
  head: () => ({
    meta: [
      { title: "Documents — Wakilio" },
      {
        name: "description",
        content:
          "Matter-linked document vault with camera scanning, English and Hindi OCR, full-text search and redaction before sharing.",
      },
      { property: "og:title", content: "Documents — Wakilio" },
      {
        property: "og:description",
        content: "Document vault with Indic OCR, full-text search and redaction before sharing.",
      },
    ],
  }),
  component: Documents,
});

const ocrTone: Record<string, Tone> = {
  Indexed: "success",
  Processing: "warning",
  Redacted: "accent",
};

function Documents() {
  return (
    <AppShell
      title="Documents"
      subtitle="Matter-linked vault · OCR indexed in English and Hindi"
      action={
        <button
          type="button"
          className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-ink"
        >
          Upload
        </button>
      }
    >
      <DocumentIntelligence />

      <div className="mb-6 grid gap-4 sm:grid-cols-3 [&>*]:min-w-0">
        {[
          {
            icon: Camera,
            title: "Scan with camera",
            body: "Auto-crop, deskew and multi-page capture from the phone.",
          },
          {
            icon: ScanText,
            title: "OCR queue",
            body: "1 document processing · average 40 seconds per page.",
          },
          { icon: FileText, title: "Storage used", body: "11.4 GB of 50 GB on the Chamber plan." },
        ].map((card) => (
          <div key={card.title} className="surface-panel rounded p-5">
            <card.icon className="size-5 text-accent" />
            <h2 className="mt-4 font-display text-base font-bold">{card.title}</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">{card.body}</p>
          </div>
        ))}
      </div>

      <DataTable headers={["Document", "Matter", "Type", "Language", "OCR", "Size", "Updated"]}>
        {documents.map((doc) => (
          <tr key={doc.id} className="hover:bg-secondary/40">
            <td className="px-4 py-3 font-medium">{doc.name}</td>
            <td className="px-4 py-3 font-mono text-xs">{doc.matter}</td>
            <td className="px-4 py-3 text-muted-foreground">{doc.kind}</td>
            <td className="px-4 py-3">{doc.language}</td>
            <td className="px-4 py-3">
              <Tag tone={ocrTone[doc.ocr]}>{doc.ocr}</Tag>
            </td>
            <td className="px-4 py-3 whitespace-nowrap">{doc.size}</td>
            <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{doc.updated}</td>
          </tr>
        ))}
      </DataTable>
    </AppShell>
  );
}
