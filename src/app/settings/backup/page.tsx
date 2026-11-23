import { readdir, stat } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { requireBusiness } from "../../../lib/business";

const SNAPSHOT = /^beanstalk-\d{4}-\d{2}-\d{2}\.db$/;

/** Newest automatic snapshot written by scripts/backup.sh, if any. */
async function latestSnapshot() {
  const dir = process.env.BACKUP_DIR || join(homedir(), "beanstalk-backups");
  try {
    const names = (await readdir(dir)).filter((n) => SNAPSHOT.test(n)).sort();
    if (names.length === 0) return { dir, latest: null };
    const info = await stat(join(dir, names[names.length - 1]));
    return {
      dir,
      latest: {
        count: names.length,
        when: info.mtime,
        bytes: info.size,
        stale: Date.now() - info.mtime.getTime() > 48 * 3600000,
      },
    };
  } catch {
    return { dir, latest: null };
  }
}

export default async function BackupSettingsPage() {
  await requireBusiness(); // per-request, so the snapshot status is always current
  const { dir, latest } = await latestSnapshot();

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="card flex flex-col gap-4">
        <div>
          <h2 className="font-semibold">Download a backup</h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Saves a single <span className="font-mono">.db</span> file containing your entire
            database — every business, account, transaction, and reconciliation. It&apos;s a
            consistent snapshot taken live, so it&apos;s safe to download anytime.
          </p>
        </div>
        <div>
          <a href="/api/backup" download className="btn btn-primary">
            ⬇ Download backup
          </a>
        </div>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          To restore, stop the app and replace your database file (the path in{" "}
          <span className="font-mono">DATABASE_URL</span> in <span className="font-mono">.env</span>) with the
          downloaded file — keep a copy of the current one first.
        </p>
      </div>

      <div className="card flex flex-col gap-2">
        <h2 className="font-semibold">Automatic backups</h2>
        {latest ? (
          <>
            <p className={`text-sm ${latest.stale ? "text-amber-700 dark:text-amber-300" : ""}`}>
              Last snapshot:{" "}
              <span className="font-medium">
                {latest.when.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
              </span>{" "}
              ({(latest.bytes / 1048576).toFixed(1)} MB){latest.stale && " — more than two days old; check the schedule."}
            </p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {latest.count} daily snapshot{latest.count === 1 ? "" : "s"} kept in{" "}
              <span className="font-mono">{dir}</span>.
            </p>
          </>
        ) : (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            No automatic snapshots found in <span className="font-mono">{dir}</span>. Run{" "}
            <span className="font-mono">npm run backup</span>, or schedule it daily — see
            &ldquo;Automatic backups&rdquo; in the README.
          </p>
        )}
      </div>

      <div className="card border-amber-300 bg-amber-50 text-sm dark:border-amber-800 dark:bg-amber-950/40">
        <p className="font-medium text-amber-800 dark:text-amber-200">Keep backups off-machine</p>
        <p className="mt-1 text-amber-700 dark:text-amber-300">
          Keep a copy of your backups somewhere other than this computer — set{" "}
          <span className="font-mono">BACKUP_MIRROR_DIR</span> to a synced folder or external drive.
          Finished snapshots are safe to sync; the live database is not, so never keep that in a
          file-sync folder (Dropbox, iCloud, Resilio…).
        </p>
      </div>
    </div>
  );
}
