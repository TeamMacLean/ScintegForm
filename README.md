# ScintegForm

Anonymous scientific misconduct reporting for The Sainsbury Laboratory, within the NBI network. Node **24.11.0**, Express, MongoDB, a small browser form, private file storage, and a durable email queue.

## Run locally

```sh
nvm use
npm ci --ignore-scripts
cp .env.example .env
npm start
```

Start a local MongoDB first (validated with MongoDB 7.0.29). Open `http://localhost:3000`, matching `PUBLIC_ORIGIN` exactly. The app binds to loopback by default. There is no frontend bundle to compile; `npm run build` checks Node version, JavaScript syntax, and the static entry points.

The example configuration **captures email locally**, in private `var/capture/mail/*.eml` files. It does not send SMTP traffic. Do not enter real reports in development or automated tests.

## Email safety

For VPN-connected testing, use `npm run test:mail:vpn -- --check-only` to check DNS and SMTP without sending, then `npm run test:mail:vpn` to send one synthetic message only to George. See [OPERATIONS.md](OPERATIONS.md) for configuration and diagnostic stages.

| `MAIL_MODE` | Destination |
| --- | --- |
| `capture` (default) | Private `.eml` files only, addressed to `deeks@nbi.ac.uk` |
| `test` | SMTP delivery only to **deeks@nbi.ac.uk** |
| `production` | Explicit `REPORT_RECIPIENTS`; help requests go to `WEBMASTER_EMAIL` |

Recipient selection happens at the final mail boundary. Test/capture modes overwrite the SMTP envelope as well as headers, accept no alternative test recipient, and never CC/BCC production recipients. Production report emails have no implicit webmaster BCC. Subjects outside production begin `[TEST]`.

The legacy `WEBMASTER_TESTING`, `WEBMASTER`, `EMAIL_RECIPIENTS`, LDAP, JWT and `API_URL` configuration is no longer used. Missing `MAIL_MODE` always means capture, even when legacy production settings are present. Production requires a HTTPS `PUBLIC_ORIGIN`, explicit `MONGODB_URI`, an absolute `DATA_DIR` outside the application directory, full recipient addresses, and ClamAV scanning. SMTP STARTTLS is required by default; do not disable it without confirming the NBI relay's requirements.

To send one **synthetic** report with a harmless text attachment to George:

```sh
SMTP_HOST=mail.nbi.ac.uk SMTP_PORT=25 npm run test:delivery
```

This script forces test mode even if `.env` selects production. It never reads reports from MongoDB. Relay acceptance is not proof of inbox delivery; check the inbox. The historical relay hostname must resolve on the machine running the test, usually through NBI networking/DNS.

### Development email preview (no network)

```sh
npm run dev:mail
```

Open `var/dev-mail/mail/preview.html`. It shows synthetic report and help messages produced by the **real mail composer**, including From/To/Cc/Bcc, subject, Message-ID, HTML and plain-text bodies, attachment names/types/sizes/checksums, and downloadable original `.eml` messages. No SMTP connection is made, even if the environment contains production settings. HTML rendering is sandboxed with remote resources and scripts blocked; it is a useful preview, not a simulation of every email client's rendering quirks.

To inspect messages captured by the running development app:

```sh
npm run dev:mail -- --captures ./var/capture/mail
```

Rerun to refresh the static preview after new submissions. All previews/captures stay in ignored private directories; never put this preview into `public/` or use real reports as development fixtures. Automated tests parse the MIME and assert exact report/help fields, body content, escaping, Unicode handling, attachment bytes and absence of unintended recipients. The existing local SMTP sink tests additionally check the actual delivery envelope.

## Upload policy

- Default: **10 files**, **10 MB each**, **15 MB combined** (decimal bytes).
- Allowed: PDF, PNG/JPEG, UTF-8 text/CSV, DOCX, XLSX and PPTX.
- Disallowed: executables, general archives, legacy Office formats, macro-enabled files, encrypted Office containers, and Office containers containing macros/embedded objects/ActiveX. Office expansion is limited to 50 MB and 1,000 entries. Nothing is extracted by the app.
- Validate on the server, including content signatures rather than trusting browser MIME types. Type detection is not malware detection or a guarantee that a document is safe to open.
- Scan each submission directory once with `clamscan`, bounded to 60 seconds. Malware, encryption/scan-limit alerts, missing scanner, missing signatures and scanner failures prevent acceptance of files. Production cannot disable scanning. Use `freshclam` to keep signatures current. See the [ClamAV scanning documentation](https://docs.clamav.net/manual/Usage/Scanning.html).
- Stream uploads to private random filenames; enforce byte/count limits while receiving; limit concurrent uploads and check disk headroom. Files are not downloadable through a public route.
- Store originals unchanged. Do not automatically strip document metadata: it may be evidence. The form explains the possibility of identifying metadata and infrastructure logs.

The 15 MB raw limit produces roughly 21 MB of MIME email after encoding and headers. **Confirm the relay's message limit before production**, and lower `MAX_TOTAL_BYTES` if necessary. Keep nginx's body limit slightly above the application limit for multipart fields/headers. Defaults favour manageable attachments over a new recipient login/download service.

Install ClamAV and current signatures on the VM, then run this deployment check:

```sh
npm run test:scanner
```

It verifies both a clean file and the standard harmless EICAR antivirus test signature against the configured signature database. `CLAMSCAN_COMMAND` must refer to `clamscan`, not `clamdscan`, which has different option semantics.

### Real ClamAV in development

On macOS, install with `brew install clamav` (Linux: install the distribution's `clamav` package). No daemon or background service is required. Then:

```sh
npm run dev:scanner:setup
CLAMAV_DATABASE_DIR=./var/clamav/db npm run test:scanner
```

Setup downloads and verifies the official databases into ignored `var/clamav/db`, with updater configuration in `var/clamav/freshclam.conf`. It leaves system configuration untouched. Rerun setup to update the definitions. For scanning through the running development form, set `UPLOAD_SCAN_MODE=clamav` and `CLAMAV_DATABASE_DIR=./var/clamav/db` in `.env`, keeping `MAIL_MODE=capture`. A missing database or failed scan blocks the upload; there is no fallback that silently accepts files.

There is also a deterministic offline integration suite:

```sh
npm run test:scanner:dev
```

It runs the **real installed ClamAV binary**, HTTP upload handler, temporary MongoDB and mail composer. It checks clean uploads and delivered bytes, EICAR in multi-file submissions, EICAR inside an Office container, cleanup, and missing-database failures. Its temporary database contains only a known EICAR hash: **this fixture is not general malware protection**. It is created inside the test's temporary directory and deleted afterwards; it is never installed into the application's configured database or selected as a runtime fallback. This command fails clearly if ClamAV is absent. CI installs ClamAV and runs this suite without downloading the full definitions.

The regular suite retains deterministic subprocess stubs for clean/infected/error exit codes. Those stubs only live in tests. Both the offline real-engine suite and the full-definition clean/EICAR check should pass before deployment; only the latter checks the configured live signature installation.

## Acceptance, retries and storage

`POST /api/form/new` accepts multipart `description` plus optional `files`. `POST /api/help` accepts JSON `subject` and `message`. Both require a UUID v4 `Idempotency-Key` header. The browser creates this key without storing report content in cookies or web storage. Request origins are checked; no accounts or tracking are required.

1. Validate fields and uploads; inspect and scan attachments.
2. Move approved files from `DATA_DIR/quarantine/<random-id>` to `DATA_DIR/reports/<reference>` on the same filesystem.
3. Persist the report and pending notification in MongoDB's `submissions_v2` collection.
4. Return HTTP **202**, `{ "status": "received", "formId": "..." }`. This means safely received and queued, **not** email delivery confirmed.
5. The in-process worker atomically claims a notification, sends it, and records its state. Failed attempts use exponential backoff (30 seconds initially, capped at one hour) for 60 attempts by default, about two days, so a relay outage does not strand reports. Each failure records only an error code such as `ECONNECTION` or `EENVELOPE_550`. A five-minute lease recovers work after a crash.

Repeating the same key and content returns the same reference. Reusing a key for different content returns 409. The browser disables submission during processing and retains entered data on failure. Reloading the browser loses an unsent draft and its key, so retry from the same open page after uncertain failures.

Mail delivery is **at least once**: a crash after SMTP acceptance but before recording success can cause a duplicate email. Stable Message-IDs help investigation but cannot guarantee recipient deduplication. Partial recipient acceptance stops automatic retries for operator review.

Uploads and MongoDB writes cannot be one atomic transaction. Ambiguous database failures retain files until reconciliation can prove they are unreferenced. Startup/hourly cleanup deletes only abandoned `quarantine` upload directories older than 24 hours. It never deletes `reports` directories: one unknown to the database is logged as `storage_orphans_found`, because a wrong `MONGODB_URI` or an older backup makes real evidence look unreferenced. Check the database connection before removing anything by hand. Accepted evidence is never automatically expired. Set an institutional retention policy covering MongoDB, attachment storage, backups, and recipient mailboxes before introducing deletion.

The new collection leaves historical `forms` and old `uploads/` intact; it does not migrate or resend old reports. Back them up and retain them according to policy. Capture, test and production notifications are separated by a stored mode and are never automatically promoted between modes. Use separate databases and data directories for staging and production as well.

## Operations

[OPERATIONS.md](OPERATIONS.md) covers intermittent 502 investigation, the `npm run monitor` probe/watch command, privacy-preserving request/process diagnostics, and optional PM2/nginx logging configuration. Deployment and starting persistent monitoring are separate steps. [FUTURE_IDEAS.md](FUTURE_IDEAS.md) records the deferred ZIP-bundling proposal.

```sh
npm run notifications -- list
npm run notifications -- retry <reference>
```

These commands use the current mode/database. List output includes only identifiers, states, attempt counts and timestamps, never report content. Review `failed` notifications and old `pending` notifications; resolve the cause before retrying, especially after partial/uncertain delivery. Integrate this check with the VM's existing monitoring. Log events `notification_delivery_failed`, `notification_worker_unavailable`, `storage_cleanup_failed` and `storage_orphans_found` also need attention.

`/health/live` checks process liveness; `/health/ready` checks MongoDB connectivity; `/health/notifications` returns 503 when any notification has failed or is still unsent 30 minutes after submission (status only, no counts or references). Point the VM's monitoring at `/health/notifications`: it is the only automatic signal that investigators have not received a report. These endpoints do **not** certify scanner freshness or free disk capacity. Monitor those separately. The in-memory global request limit avoids retaining IP identifiers; nginx/network limits should be tuned for the site's shared users. The application should run as a single instance on this VM; multiple instances need coordinated upload/rate limits and cleanup.

Back up MongoDB and `DATA_DIR/reports` together with restricted access, test restoration, and monitor free space. Run under an unprivileged dedicated user with private directories. No request body, filename, report text, credentials or client IP is intentionally logged by the app. Review nginx, system, SMTP, VPN and NBI logging separately; the app cannot promise network-level anonymity.

## VM upgrade

1. Back up the existing database, uploads, environment and service/proxy configuration. Record the old release for rollback. Do not use real reports for testing.
2. Provision Node v24.11.0, a supported MongoDB installation (validated on 7.0.29), and ClamAV/current signatures. Check the VM's existing MongoDB version and persistent WiredTiger storage before replacing the old Mongoose client. The app requests majority, journaled writes (`w: 'majority', j: true`); confirm successful staging submissions and storage/restart behaviour on the VM. Journaling is always enabled in MongoDB 6.1+, including the tested 7.0; do not add the removed `storage.journal.enabled` setting. See [MongoDB's journaling changes](https://www.mongodb.com/docs/v7.0/release-notes/7.0/). Automated process restarts do not simulate a VM power failure or prove the durability of its disk/backups.
3. Install this release in a new directory with `npm ci --omit=dev --ignore-scripts`. Create an absolute, private data directory outside the code/web root. Update environment variable names using `.env.example`; do not copy the old configuration unchanged.
4. Start in **test** mode with a separate staging database/data directory. Set the correct HTTPS `PUBLIC_ORIGIN`, enable ClamAV, and verify `test:scanner`, `test:delivery`, the form, queue, attachments and service restart.
5. Confirm the relay's size/TLS limits and intended production recipients. Configure `MAIL_MODE=production`, `UPLOAD_SCAN_MODE=clamav`, `REPORT_RECIPIENTS`, `WEBMASTER_EMAIL`, a production database and its data directory. Never mix staging records with live records.
6. Apply either the systemd or PM2 app configuration and the nginx examples in `deploy/`, adjusting paths, architecture and HTTPS configuration. Keep the app and MongoDB on loopback; retain the NBI firewall restriction. The nginx examples log only 5xx status/timing metadata in the custom access log, without client IPs or raw URLs; normal nginx error logs need separate access/retention controls.
7. After restart, check readiness, queue state and disk space. Reopening an existing browser removes obsolete service-worker caches; `sw.js` is a retirement worker. On rollback, preserve `submissions_v2` and new files and inspect pending notifications: the old app will not process this new queue.

The modernised app removes the old Nuxt/Vue build chain, unused LDAP/admin routes, experimental upload routes, and committed generated assets. Their history remains in Git. The public workflows remain report submission and technical help; there is no investigator portal in this version.

## Tests

```sh
npm ci --ignore-scripts
npx playwright install chromium
npm run test:all
npm run test:coverage
```

Install `mongod` locally or set `MONGOD_BINARY`. Each integration/browser test server starts its **own MongoDB process on an ephemeral port with temporary data**, then removes it. Tests do not load `.env` or connect to the production database. SMTP integration uses an in-process local sink with no forwarding; browser tests use local mail capture. All records and attachments are synthetic.

The suite covers multipart uploads and validation; MIME spoofing, macros and excessive Office expansion; limits and disconnect cleanup; disk/database/scanner failures; idempotency/concurrent submissions; queue retries; escaped mail and exact SMTP recipient envelopes; HTTP headers; report/help browser flows; file removal/reselection; duplicate-click protection; network retries; and mobile layouts. Browser checks run in Chromium at desktop and mobile viewport sizes, not every browser engine.

GitHub Actions pins Node, verifies a pinned MongoDB binary checksum, runs backend/browser tests plus offline real-ClamAV integration tests, and audits runtime dependencies. CI has no real SMTP credentials. Current production ClamAV signatures, NBI networking, the production proxy, backups and inbox receipt still require the VM checks above.
