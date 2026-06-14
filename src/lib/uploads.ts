import "server-only";
import { mkdir, writeFile, readFile, unlink } from "fs/promises";
import { join, dirname, extname } from "path";

/** Where locally-stored document files live (gitignored). Override with UPLOADS_DIR. */
export function uploadsDir(): string {
  return process.env.UPLOADS_DIR || join(process.cwd(), "uploads");
}

/**
 * Persist a document to local disk under `<businessId>/<docId><ext>` and return
 * that storage key. Keys are server-generated (no user input), so they're safe
 * to join back to the uploads dir.
 */
export async function saveLocalFile(
  businessId: string,
  docId: string,
  fileName: string,
  buffer: Buffer
): Promise<string> {
  const ext = extname(fileName);
  const safeExt = /^\.[A-Za-z0-9]{1,12}$/.test(ext) ? ext.toLowerCase() : "";
  const key = `${businessId}/${docId}${safeExt}`;
  const full = join(uploadsDir(), key);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, buffer);
  return key;
}

export async function readLocalFile(key: string): Promise<Buffer> {
  return readFile(join(uploadsDir(), key));
}

export async function deleteLocalFile(key: string): Promise<void> {
  await unlink(join(uploadsDir(), key)).catch(() => {});
}
