import { readFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { prisma } from "../../../lib/db";

/**
 * Stream a consistent SQLite snapshot of the whole database as a download.
 * Uses `VACUUM INTO` on the live connection, which produces a transactionally
 * consistent copy even while the server is running — unlike file-copying the
 * live .db, which can capture a torn write.
 */
export async function GET() {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const tmp = join(tmpdir(), `beanstalk-backup-${stamp}-${process.pid}.db`);
  try {
    await prisma.$executeRawUnsafe(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
    const bytes = new Uint8Array(await readFile(tmp));
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="beanstalk-backup-${stamp}.db"`,
        "Cache-Control": "no-store",
      },
    });
  } finally {
    await unlink(tmp).catch(() => {});
  }
}
