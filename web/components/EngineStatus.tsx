"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";

interface PingResult {
  ok: boolean;
  service: string;
  engineVersion: string;
  python: string;
}

/**
 * Live compute-engine status. Proves the Python engine is reachable through the
 * swappable §3.5 contract and surfaces its version (part of provenance).
 */
export function EngineStatus() {
  const { data, isLoading, isError } = useQuery<PingResult>({
    queryKey: ["engine-ping"],
    queryFn: async () => {
      const res = await fetch("/api/engine/ping");
      if (!res.ok) throw new Error(`ping failed: ${res.status}`);
      return res.json();
    },
    refetchInterval: 30_000,
    retry: 1,
  });

  if (isLoading) {
    return (
      <Badge variant="default" className="font-mono">
        engine …
      </Badge>
    );
  }
  if (isError || !data?.ok) {
    return (
      <Badge variant="error" className="font-mono" title="Engine unreachable">
        engine offline
      </Badge>
    );
  }
  return (
    <Badge
      variant="ok"
      className="font-mono"
      title={`Python ${data.python}`}
    >
      engine {data.engineVersion}
    </Badge>
  );
}
