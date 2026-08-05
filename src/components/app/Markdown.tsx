import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

export function Markdown({ content, className }: { content: string; className?: string }) {
  return (
    <div
      className={cn(
        "text-sm leading-relaxed",
        "[&>*+*]:mt-3",
        "[&_h2]:font-display [&_h2]:mt-5 [&_h2]:text-base [&_h2]:font-bold [&_h2]:first:mt-0",
        "[&_h3]:font-display [&_h3]:mt-4 [&_h3]:text-sm [&_h3]:font-bold [&_h3]:first:mt-0",
        "[&_strong]:font-semibold",
        "[&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5",
        "[&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5",
        "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
        "[&_code]:rounded [&_code]:bg-secondary [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
        "[&_table]:w-full [&_table]:border-collapse [&_table]:text-xs",
        "[&_th]:border [&_th]:border-border [&_th]:bg-secondary/50 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left",
        "[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
