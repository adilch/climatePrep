"use client";

import { useState } from "react";
import { PfaTab } from "@/components/pfa/PfaTab";
import { PmpPanel } from "@/components/pmp/PmpPanel";
import { StormPanel } from "@/components/pmp/StormPanel";
import { WindFreeboardPanel } from "@/components/wind/WindFreeboardPanel";
import { cn } from "@/lib/utils";

/** Analyses module sub-tabs (spec §2.3): each independently runnable. */

const MODULES = [
  { key: "pfa", label: "PFA / IDF" },
  { key: "pmp", label: "PMP" },
  { key: "storms", label: "Design storms" },
  { key: "wind", label: "Wind & freeboard" },
] as const;
type ModuleKey = (typeof MODULES)[number]["key"];

export function AnalysesTabs({ projectId }: { projectId: string }) {
  const [module, setModule] = useState<ModuleKey>("pfa");

  return (
    <div className="space-y-4">
      <nav className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1" aria-label="Analysis modules">
        {MODULES.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setModule(m.key)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              module === m.key
                ? "bg-background font-medium text-accent shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m.label}
          </button>
        ))}
      </nav>

      {module === "pfa" && <PfaTab projectId={projectId} />}
      {module === "pmp" && <PmpPanel projectId={projectId} />}
      {module === "storms" && <StormPanel projectId={projectId} />}
      {module === "wind" && <WindFreeboardPanel projectId={projectId} />}
    </div>
  );
}
