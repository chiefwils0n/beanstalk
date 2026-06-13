export default function BackupSettingsPage() {
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
          To restore, stop the app and replace <span className="font-mono">prisma/beanstalk.db</span>{" "}
          with the downloaded file (keep a copy of the current one first).
        </p>
      </div>

      <div className="card border-amber-300 bg-amber-50 text-sm dark:border-amber-800 dark:bg-amber-950/40">
        <p className="font-medium text-amber-800 dark:text-amber-200">Keep backups off-machine</p>
        <p className="mt-1 text-amber-700 dark:text-amber-300">
          Store backups somewhere other than this computer, and never keep the live database in a
          file-sync folder (Dropbox, iCloud, Resilio…) — concurrent sync can corrupt it. For
          automated backups, schedule a periodic{" "}
          <span className="font-mono">sqlite3 prisma/beanstalk.db &quot;.backup …&quot;</span>.
        </p>
      </div>
    </div>
  );
}
