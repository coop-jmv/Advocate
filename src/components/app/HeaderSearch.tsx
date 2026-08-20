import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Briefcase, Loader2, Search, User } from "lucide-react";
import { searchRecords } from "@/lib/search.functions";

type Result = { kind: "matter" | "client"; id: string; title: string; subtitle: string };

// Real search over matters and clients (by case number, matter title, party
// names, client name/phone/email) — this used to be a decorative <div>
// reading "Search CNR, matter or client" with nothing behind it.
export function HeaderSearch() {
  const navigate = useNavigate();
  const runSearch = useServerFn(searchRecords);
  const containerRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setSearched(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      void runSearch({ data: { query: trimmed } })
        .then((rows) => {
          if (cancelled) return;
          setResults(rows as Result[]);
          setSearched(true);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, runSearch]);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function goTo(result: Result) {
    setOpen(false);
    setQuery("");
    void navigate({
      to: result.kind === "matter" ? "/app/cases" : "/app/clients",
      search: { q: result.title },
    });
  }

  const matters = results.filter((r) => r.kind === "matter");
  const clients = results.filter((r) => r.kind === "client");

  return (
    <div ref={containerRef} className="relative hidden md:block">
      <div className="flex items-center gap-2 rounded border border-input px-3 py-2 text-sm focus-within:border-primary">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
          placeholder="Search matter, case number or client"
          className="w-56 bg-transparent placeholder:text-muted-foreground focus:outline-none"
        />
        {loading ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      {open && query.trim() ? (
        <div className="absolute top-full right-0 z-20 mt-1.5 w-80 rounded border border-border bg-card py-1.5 shadow-lift">
          {!loading && searched && results.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-muted-foreground">
              No matters or clients match "{query.trim()}".
            </p>
          ) : null}

          {matters.length > 0 ? (
            <div className="mb-1">
              <p className="px-3 py-1 text-eyebrow text-muted-foreground">Matters</p>
              {matters.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => goTo(r)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-secondary"
                >
                  <Briefcase className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{r.title}</span>
                    {r.subtitle ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {r.subtitle}
                      </span>
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          {clients.length > 0 ? (
            <div>
              <p className="px-3 py-1 text-eyebrow text-muted-foreground">Clients</p>
              {clients.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => goTo(r)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-secondary"
                >
                  <User className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{r.title}</span>
                    {r.subtitle ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {r.subtitle}
                      </span>
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
