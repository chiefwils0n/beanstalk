#!/bin/sh
# Snapshot the live Beanstalk database. Safe to run while the app is running:
# sqlite3 ".backup" takes a consistent copy, which is then integrity-checked.
#
#   BACKUP_DIR         where snapshots go          (default: ~/beanstalk-backups)
#   BACKUP_MIRROR_DIR  optional second copy, e.g. a synced folder or external
#                      drive, so a snapshot exists off this machine
#   BACKUP_KEEP        how many daily snapshots to keep in each (default: 30)
#
# One snapshot per day (beanstalk-YYYY-MM-DD.db); a second run the same day
# replaces that day's file. Reads the database path from DATABASE_URL in .env.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SQLITE="${SQLITE3:-/usr/bin/sqlite3}"
[ -x "$SQLITE" ] || SQLITE="$(command -v sqlite3)"

URL="${DATABASE_URL:-}"
if [ -z "$URL" ] && [ -f "$ROOT/.env" ]; then
  URL="$(sed -n 's/^DATABASE_URL=//p' "$ROOT/.env" | tail -1 | sed 's/^"//; s/"$//')"
fi
case "$URL" in
  file:/*) DB="${URL#file:}" ;;
  file:*) DB="$ROOT/prisma/${URL#file:}" ;;
  *) echo "backup: DATABASE_URL is not a file: URL" >&2; exit 1 ;;
esac
[ -f "$DB" ] || { echo "backup: no database at $DB" >&2; exit 1; }

DIR="${BACKUP_DIR:-$HOME/beanstalk-backups}"
KEEP="${BACKUP_KEEP:-30}"
NAME="beanstalk-$(date +%Y-%m-%d).db"
mkdir -p "$DIR"
TMP="$DIR/.$NAME.tmp"
rm -f "$TMP"

"$SQLITE" "$DB" ".backup '$TMP'"
CHECK="$("$SQLITE" "$TMP" 'pragma integrity_check')"
if [ "$CHECK" != "ok" ]; then
  rm -f "$TMP"
  echo "backup: integrity check failed: $CHECK" >&2
  exit 1
fi
mv -f "$TMP" "$DIR/$NAME"

# Keep the newest $KEEP snapshots (names sort by date).
prune() {
  ls -1 "$1" | grep -E '^beanstalk-[0-9]{4}-[0-9]{2}-[0-9]{2}\.db$' | sort -r | tail -n +"$((KEEP + 1))" |
    while read -r old; do rm -f "$1/$old"; done
}
prune "$DIR"

if [ -n "${BACKUP_MIRROR_DIR:-}" ]; then
  mkdir -p "$BACKUP_MIRROR_DIR"
  cp -f "$DIR/$NAME" "$BACKUP_MIRROR_DIR/.$NAME.tmp"
  mv -f "$BACKUP_MIRROR_DIR/.$NAME.tmp" "$BACKUP_MIRROR_DIR/$NAME"
  prune "$BACKUP_MIRROR_DIR"
fi

echo "$(date '+%Y-%m-%d %H:%M:%S') backed up $DB -> $DIR/$NAME${BACKUP_MIRROR_DIR:+ (+ $BACKUP_MIRROR_DIR)}"
