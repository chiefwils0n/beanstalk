# Security Policy

Beanstalk is double-entry accounting software — it handles financial data, so
security reports are taken seriously.

## Reporting a vulnerability

**Please do not open a public issue for security problems.** Instead, report
privately via [GitHub Security Advisories](https://github.com/chiefwils0n/beanstalk/security/advisories/new)
(Security → Report a vulnerability). Include steps to reproduce and the
affected version/commit. You'll get an acknowledgement and a fix timeline.

## Important deployment note: no built-in authentication

Beanstalk currently has **no user authentication or login**. Anyone who can
reach the running server has full read/write access to the books. This is by
design for single-user, private deployments.

**Do not expose a Beanstalk instance directly to the public internet.** Run it:

- on `localhost` only, or
- behind a private network / VPN (e.g. Tailscale), or
- behind a reverse proxy that enforces authentication (HTTP basic auth, SSO, etc.).

## Data handling

- All data lives in a local SQLite database (`prisma/beanstalk.db`); there is
  no telemetry and nothing is sent off-device except optional Google Drive
  document storage, which you configure explicitly.
- Do **not** run the live database inside a file-sync folder (Dropbox, iCloud,
  Resilio, etc.) — concurrent sync can corrupt or roll back the database. Back
  up with a periodic `sqlite3 .backup` snapshot instead.
- Secrets (`GOOGLE_CLIENT_SECRET`, etc.) belong in `.env`, which is gitignored.
