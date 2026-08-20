import { Link } from "@tanstack/react-router";
import { Scale } from "lucide-react";

const nav = [
  { to: "/features", label: "Features" },
  { to: "/pricing", label: "Pricing" },
  { to: "/contact", label: "Contact" },
] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded bg-primary text-primary-foreground">
            <Scale className="size-4" />
          </span>
          <span className="font-display text-base font-bold tracking-tight">Wakilio</span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: "text-foreground font-medium" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <Link
          to="/app"
          className="rounded border border-primary bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-ink"
        >
          Open the workspace
        </Link>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-secondary/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>Wakilio — practice management for Indian advocates.</p>
        <p className="flex items-center gap-4">
          <span>Data hosted in Mumbai, India</span>
          <Link to="/privacy" className="underline-offset-4 hover:underline">
            Privacy notice
          </Link>
        </p>
      </div>
    </footer>
  );
}
