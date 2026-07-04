import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // TS-source workspace packages (spec §3.9) are transpiled by Next — no build step.
  transpilePackages: ["@climateprep/core-ts", "@climateprep/ui"],
  // PGlite ships WASM/data assets it locates via URLs at runtime; bundling it
  // breaks that resolution. Keep it external so Next loads it from node_modules
  // (works under plain Node, as the migrate/seed scripts prove).
  serverExternalPackages: ["@electric-sql/pglite"],
  // We live inside an npm workspace; pin the tracing root to the repo root so
  // Next doesn't mis-infer it from nested lockfiles.
  outputFileTracingRoot: path.join(__dirname, ".."),
};

export default nextConfig;
