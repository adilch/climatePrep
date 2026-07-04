import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "./schema";

/**
 * Local-first database (spec: M0 decision). PGlite is an embedded, in-process
 * Postgres — real jsonb/uuid semantics, no Docker. The Drizzle SQL is identical
 * to server Postgres, so deploying swaps this file's driver for Neon/Vercel
 * Postgres with zero schema or query change.
 *
 * The client is created lazily on first query, not at import time, so Next's
 * static-generation pass never instantiates PGlite (it only runs at request
 * time in dynamic routes).
 */

export const PGLITE_DATA_DIR =
  process.env.PGLITE_DATA_DIR ?? path.join(process.cwd(), ".storage", "pgdata");

type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as {
  __pglite__?: PGlite;
  __drizzle__?: DrizzleDB;
};

function getDb(): DrizzleDB {
  if (globalForDb.__drizzle__) return globalForDb.__drizzle__;
  fs.mkdirSync(PGLITE_DATA_DIR, { recursive: true });
  const client = globalForDb.__pglite__ ?? new PGlite(PGLITE_DATA_DIR);
  const instance = drizzle(client, { schema });
  if (process.env.NODE_ENV !== "production") {
    globalForDb.__pglite__ = client;
    globalForDb.__drizzle__ = instance;
  }
  return instance;
}

/** Drizzle client. Instantiates PGlite on first property access. */
export const db = new Proxy({} as DrizzleDB, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});

export { schema };
export type DB = DrizzleDB;
