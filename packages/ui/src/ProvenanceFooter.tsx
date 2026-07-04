import type { CSSProperties } from "react";

/**
 * Small provenance footer rendered under every figure and in exports
 * (spec §4, §5.2). Shows engine/app versions, seed, and the pull timestamp so
 * a reviewer can trace any number back to its source.
 */
export interface ProvenanceFooterProps {
  engineVersion: string;
  appVersion: string;
  seed?: number | null;
  generatedAt?: string;
  sourceCaption?: string;
  style?: CSSProperties;
}

export function ProvenanceFooter({
  engineVersion,
  appVersion,
  seed,
  generatedAt,
  sourceCaption,
  style,
}: ProvenanceFooterProps) {
  const parts = [
    sourceCaption,
    `engine ${engineVersion}`,
    `app ${appVersion}`,
    seed != null ? `seed ${seed}` : undefined,
    generatedAt ? new Date(generatedAt).toISOString() : undefined,
  ].filter(Boolean);

  return (
    <p
      data-testid="provenance-footer"
      style={{
        fontFamily:
          "var(--font-mono, ui-monospace, 'JetBrains Mono', monospace)",
        fontSize: "0.6875rem",
        color: "var(--muted-foreground, #64748b)",
        margin: 0,
        ...style,
      }}
    >
      {parts.join("  ·  ")}
    </p>
  );
}
