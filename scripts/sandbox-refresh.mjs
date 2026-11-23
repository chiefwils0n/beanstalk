// Re-clone the dev sandbox from the real books. Reads the production database
// path from DATABASE_URL (run via `node --env-file=.env`), so it works wherever
// the live database is kept. Relative paths resolve from prisma/, as Prisma does.
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

const url = process.env.DATABASE_URL ?? "";
if (!url.startsWith("file:")) {
  console.error("DATABASE_URL must be a file: URL (check .env)");
  process.exit(1);
}
const raw = url.slice("file:".length);
const source = isAbsolute(raw) ? raw : resolve("prisma", raw);
const target = resolve("prisma", "sandbox.db");
if (source === target) {
  console.error("DATABASE_URL already points at the sandbox — nothing to copy");
  process.exit(1);
}
if (!existsSync(source)) {
  console.error(`No database at ${source}`);
  process.exit(1);
}
// .backup takes a consistent snapshot even while the app is running.
rmSync(target, { force: true });
execFileSync("sqlite3", [source, `.backup '${target.replace(/'/g, "''")}'`], { stdio: "inherit" });
console.log(`sandbox.db refreshed from ${source}`);
