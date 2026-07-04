"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Project tabs (spec §2.3). Later-milestone tabs render disabled. */
const TABS: { label: string; segment: string | null; live: boolean }[] = [
  { label: "Overview", segment: null, live: true },
  { label: "Stations", segment: "stations", live: true },
  { label: "Data", segment: "data", live: true },
  { label: "QA/QC", segment: "qa", live: true },
  { label: "Analyses", segment: "analyses", live: true },
  { label: "Compare", segment: "compare", live: false },
  { label: "Report", segment: "report", live: false },
];

export function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;

  return (
    <nav className="flex gap-1 border-b border-border" aria-label="Project sections">
      {TABS.map(({ label, segment, live }) => {
        const href = segment ? `${base}/${segment}` : base;
        const active = pathname === href;
        if (!live) {
          return (
            <span
              key={label}
              className="cursor-not-allowed px-3 py-2 text-sm text-muted-foreground/50"
              title="Available in a later milestone"
            >
              {label}
            </span>
          );
        }
        return (
          <Link
            key={label}
            href={href}
            className={cn(
              "px-3 py-2 text-sm transition-colors",
              active
                ? "border-b-2 border-accent font-medium text-accent"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
