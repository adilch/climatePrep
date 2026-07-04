import fs from "node:fs/promises";
import path from "node:path";

/**
 * Local Blob stub (spec §3.3). Mirrors the `@vercel/blob` surface (put/head/del)
 * but writes to `.storage/blob/`. Swap for `@vercel/blob` on deploy — call sites
 * don't change. Used for cached raw series (parquet/csv) and generated exports.
 */
const BLOB_ROOT =
  process.env.BLOB_LOCAL_DIR ??
  path.join(process.cwd(), ".storage", "blob");

export interface BlobResult {
  key: string;
  pathname: string;
  size: number;
}

export async function put(
  key: string,
  data: Buffer | Uint8Array | string,
): Promise<BlobResult> {
  const dest = path.join(BLOB_ROOT, key);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  const buf = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
  await fs.writeFile(dest, buf);
  return { key, pathname: dest, size: buf.byteLength };
}

export async function get(key: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(path.join(BLOB_ROOT, key));
  } catch {
    return null;
  }
}

export async function del(key: string): Promise<void> {
  await fs.rm(path.join(BLOB_ROOT, key), { force: true });
}
