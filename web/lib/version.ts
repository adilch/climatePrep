/**
 * App version is part of provenance (spec §9): it is stamped into every result
 * and export. In production Vercel injects APP_VERSION from the git SHA/tag.
 */
export const APP_VERSION =
  process.env.APP_VERSION ??
  process.env.NEXT_PUBLIC_APP_VERSION ??
  "0.0.0-dev";
