"use client";

import { useEffect, useRef, useState } from "react";
import { Info, X } from "lucide-react";
import { INFO, type InfoKey } from "@/lib/info/registry";

/**
 * Info "i" button for card headers. Sits inline next to a CardTitle and opens
 * a popover explaining what the card shows, the method, how it is computed,
 * and the primary references (content in lib/info/registry.ts).
 */
export function InfoButton({ infoKey }: { infoKey: InfoKey }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const content = INFO[infoKey];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!content) return null;

  return (
    <span ref={ref} className="relative inline-flex align-middle">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`About: ${content.title}`}
        aria-expanded={open}
        className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-accent/10 hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Info className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={content.title}
          className="absolute left-0 top-full z-50 mt-1.5 w-[22rem] max-w-[85vw] cursor-default rounded-lg border border-border bg-card p-3.5 text-left font-normal tracking-normal text-foreground shadow-lg"
        >
          <div className="mb-1.5 flex items-start justify-between gap-2">
            <h4 className="text-sm font-semibold">{content.title}</h4>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="rounded p-0.5 text-muted-foreground hover:bg-muted"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {content.method && (
            <p className="mb-2 inline-block rounded bg-accent/10 px-1.5 py-0.5 text-[11px] font-medium text-accent">
              {content.method}
            </p>
          )}

          <p className="text-xs leading-relaxed text-foreground/85">
            {content.description}
          </p>

          {content.how && content.how.length > 0 && (
            <div className="mt-2.5">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                How it&apos;s computed
              </p>
              <ol className="list-decimal space-y-1 pl-4 text-xs leading-relaxed text-foreground/85">
                {content.how.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
          )}

          {content.notes && (
            <p className="mt-2.5 rounded-md border border-flag/40 bg-flag/5 p-2 text-[11px] leading-relaxed text-foreground/80">
              {content.notes}
            </p>
          )}

          {content.references && content.references.length > 0 && (
            <div className="mt-2.5 border-t border-border pt-2">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                References
              </p>
              <ul className="space-y-0.5 text-[11px] leading-relaxed text-muted-foreground">
                {content.references.map((r, i) => (
                  <li key={i}>
                    {r.href ? (
                      <a
                        href={r.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent underline decoration-dotted underline-offset-2 hover:decoration-solid"
                      >
                        {r.text}
                      </a>
                    ) : (
                      r.text
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </span>
  );
}
