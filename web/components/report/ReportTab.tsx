"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Report builder (spec K1–K6): pick the PFA analysis, choose sections and
 * formats, generate. The provenance appendix, OGL attribution, and
 * professional-responsibility disclaimer are ALWAYS included (spec K6) —
 * they are not offered as options.
 */

const SECTION_OPTIONS = [
  { key: "methodology", label: "Methodology" },
  { key: "amsTable", label: "AMS tables" },
  { key: "fitsTable", label: "Fits + GOF" },
  { key: "quantiles", label: "Design quantiles" },
  { key: "figures", label: "Figures" },
  { key: "comparison", label: "ECCC comparison" },
] as const;

const FORMAT_OPTIONS = ["docx", "pdf", "xlsx"] as const;
type Format = (typeof FORMAT_OPTIONS)[number];

interface PfaRow {
  analysis: { id: string; name: string; createdAt: string };
  station: { stationName: string; climateId: string } | null;
}

interface DocRow {
  id: string;
  format: string;
  fileName: string;
  byteSize: number | null;
  generatedAt: string;
  appVersion: string;
  engineVersion: string | null;
}

export function ReportTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [pfaId, setPfaId] = useState("");
  const [formats, setFormats] = useState<Format[]>(["docx", "pdf", "xlsx"]);
  const [sections, setSections] = useState<Record<string, boolean>>(
    Object.fromEntries(SECTION_OPTIONS.map((s) => [s.key, true])),
  );

  const pfaQuery = useQuery<{ analyses: PfaRow[] }>({
    queryKey: ["pfa-analyses", projectId],
    queryFn: async () => (await fetch(`/api/projects/${projectId}/pfa`)).json(),
  });

  const docsQuery = useQuery<{ documents: DocRow[] }>({
    queryKey: ["reports", projectId],
    queryFn: async () =>
      (await fetch(`/api/projects/${projectId}/reports`)).json(),
  });

  const generate = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pfaAnalysisId: pfaId, formats, sections }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `failed (${res.status})`);
      return body;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reports", projectId] }),
  });

  const analyses = pfaQuery.data?.analyses ?? [];
  const documents = docsQuery.data?.documents ?? [];

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Generate report</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {analyses.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Run a PFA/IDF analysis first (Analyses tab) — reports are
              generated from a completed analysis.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <label className="block text-xs">
                  <span className="mb-1 block font-medium text-muted-foreground">
                    PFA analysis
                  </span>
                  <select
                    value={pfaId}
                    onChange={(e) => setPfaId(e.target.value)}
                    className="min-w-72 rounded-md border border-border bg-background px-2 py-2 text-sm"
                  >
                    <option value="">Select…</option>
                    {analyses.map((a) => (
                      <option key={a.analysis.id} value={a.analysis.id}>
                        {a.station?.stationName} · {a.analysis.name} ·{" "}
                        {new Date(a.analysis.createdAt).toISOString().slice(0, 16)}Z
                      </option>
                    ))}
                  </select>
                </label>

                <fieldset className="text-xs">
                  <legend className="mb-1 font-medium text-muted-foreground">
                    Formats
                  </legend>
                  <div className="flex gap-2">
                    {FORMAT_OPTIONS.map((f) => (
                      <label
                        key={f}
                        className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1.5"
                      >
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 accent-accent"
                          checked={formats.includes(f)}
                          onChange={(e) =>
                            setFormats(
                              e.target.checked
                                ? [...formats, f]
                                : formats.filter((x) => x !== f),
                            )
                          }
                        />
                        .{f}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <Button
                  onClick={() => generate.mutate()}
                  disabled={!pfaId || formats.length === 0 || generate.isPending}
                >
                  <FileText className="h-4 w-4" />
                  {generate.isPending ? "Generating…" : "Generate"}
                </Button>
                {generate.isError && (
                  <span className="text-xs text-error">
                    {(generate.error as Error).message}
                  </span>
                )}
              </div>

              <fieldset className="text-xs">
                <legend className="mb-1 font-medium text-muted-foreground">
                  Sections
                </legend>
                <div className="flex flex-wrap gap-2">
                  {SECTION_OPTIONS.map((s) => (
                    <label
                      key={s.key}
                      className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1"
                    >
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-accent"
                        checked={sections[s.key]}
                        onChange={(e) =>
                          setSections({ ...sections, [s.key]: e.target.checked })
                        }
                      />
                      {s.label}
                    </label>
                  ))}
                  <span
                    className="flex items-center gap-1.5 rounded-md border border-accent/30 bg-accent/5 px-2 py-1 text-muted-foreground"
                    title="Always included — required for a defensible deliverable (spec K6)"
                  >
                    Provenance appendix · OGL attribution · disclaimer
                    <Badge variant="accent">always</Badge>
                  </span>
                </div>
              </fieldset>

              <p className="text-[11px] text-muted-foreground">
                Model-forcing exports (HEC-HMS/RAS/SWMM hyetographs) arrive with
                design storms in Phase 2.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Generated documents</CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing generated yet.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-1.5 pr-2 font-medium">File</th>
                  <th className="px-2 py-1.5 font-medium">Format</th>
                  <th className="px-2 py-1.5 text-right font-medium">Size</th>
                  <th className="px-2 py-1.5 font-medium">Generated</th>
                  <th className="px-2 py-1.5 font-medium">Versions</th>
                  <th className="py-1.5 pl-2" />
                </tr>
              </thead>
              <tbody className="font-mono">
                {documents.map((d) => (
                  <tr key={d.id} className="border-b border-border/50">
                    <td className="py-1.5 pr-2">{d.fileName}</td>
                    <td className="px-2 py-1.5">
                      <Badge variant="accent">.{d.format}</Badge>
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {d.byteSize ? `${(d.byteSize / 1024).toFixed(0)} KB` : "—"}
                    </td>
                    <td className="px-2 py-1.5">
                      {new Date(d.generatedAt).toISOString().slice(0, 16)}Z
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground">
                      app {d.appVersion} · eng {d.engineVersion}
                    </td>
                    <td className="py-1.5 pl-2 text-right">
                      <a
                        href={`/api/projects/${projectId}/reports/${d.id}/download`}
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-muted"
                      >
                        <Download className="h-3.5 w-3.5" /> Download
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
