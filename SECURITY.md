# Security Policy

Beanstalk is double-entry accounting software — it handles financial data, so
security reports are taken seriously.

## Reporting a vulnerability

**Please do not open a public issue for security problems.** Instead, report
privately via [GitHub Security Advisories](https://github.com/chiefwils0n/beanstalk/security/advisories/new)
(Security → Report a vulnerability). Include steps to reproduce and the
affected version/commit. You'll get an acknowledgement and a fix timeline.

## Authentication

Beanstalk has an **optional single-password gate**, off by default:

- Set `AUTH_PASSWORD` in `.env` to require a password to access the app. The
  session is a stateless, HMAC-signed, httpOnly cookie (no database).
- Leave `AUTH_PASSWORD` unset to run open — appropriate only on `localhost` or
  a trusted private network.

There is **no multi-user system**; it's one shared password per instance.

**Still, do not expose an open instance directly to the public internet.** Even
with the password gate enabled, defense-in-depth is recommended:

- run on `localhost` only, or
- behind a private network / VPN (e.g. Tailscale), or
- behind a reverse proxy that enforces authentication (HTTP basic auth, SSO, etc.).

The session cookie omits the `Secure` flag so login works over plain HTTP
(localhost / VPN). If you serve Beanstalk over HTTPS, front it with a proxy or
adjust the cookie to set `Secure`.

## Data handling

- All data lives in a local SQLite database (`prisma/beanstalk.db`); there is
  no telemetry and nothing is sent off-device except optional Google Drive
  document storage, which you configure explicitly.
- Do **not** run the live database inside a file-sync folder (Dropbox, iCloud,
  Resilio, etc.) — concurrent sync can corrupt or roll back the database. Back
  up with a periodic `sqlite3 .backup` snapshot instead.
- Secrets (`GOOGLE_CLIENT_SECRET`, etc.) belong in `.env`, which is gitignored.
