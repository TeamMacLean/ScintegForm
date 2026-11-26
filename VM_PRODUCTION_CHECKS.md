# Scinteg production checks — AlmaLinux 9

## Instructions for Warp / the VM's AI assistant

Audit this checkout and the existing VM configuration against this checklist. Report PASS, FAIL or NOT RUN for every section with concise evidence. Start with diagnostics; do not deploy, restart/stop services, change configuration, change SELinux/firewalls, delete data, retry live notifications or enable timers merely because this document lists those steps. Prepare the concrete cutover commands for George to approve. Synthetic SMTP tests to **deeks@nbi.ac.uk only** are allowed; never send test messages to investigators. Use no real reports as fixtures, and never include credentials, environment-file contents, report contents, filenames or old access logs in your report. Inspect configuration privately and report only the relevant non-secret settings. Stop at a genuine blocker; do not expand this into a redesign.

Read `DATA_RETENTION_AND_RECOVERY.md` and `OPERATIONS.md` too. If checking the old Nuxt app before deploying this release, missing new commands/endpoints are NOT RUN, not proof that the old app is broken.

## Owner decision: restore attachments without antivirus

On **2026-11-26 George explicitly approved disabling antivirus checks to restore file uploads**. This supersedes the prior requirement to resolve ClamAV package, signature and memory issues before enabling attachments. Deploy the supporting code with `ATTACHMENTS_ENABLED=true`, `UPLOAD_SCAN_MODE=disabled`, `MAIL_MODE=production` and `MAX_CONCURRENT_UPLOADS=1`. Keep all file-type/size/count checks, private storage, HTTPS/SMTP verification and recipient routing. Test the full upload-to-email path in isolated staging, with any external synthetic mail sent only to George. Do not report antivirus checks as passed in disabled mode.

The existing cutover helper may assert text-only settings; update its verification expectations intentionally. Use the current dedicated PM2 deployment, not the initial `stop-legacy`/`start` cutover actions. This checklist does not itself change the running text-only service.

## 1. Identify the installation and runtime

Run as the account that owns the existing application/PM2 daemon. Discover the actual app directory, service, port, environment file, MongoDB database and old upload directory. Do not guess `/opt/scinteg/app` or `/etc/scinteg.env`; these are example deployment paths. Do not run `sudo pm2`, `pm2 env`, `printenv` or display `.env`.

```sh
cat /etc/almalinux-release
uname -m
pwd
git status --short
git rev-parse HEAD
command -v node
node --version
mongod --version
mongodump --version
mongorestore --version
# Only when UPLOAD_SCAN_MODE=clamav:
clamscan --version
free -h
df -h
getenforce
```

The new release requires **Node v24.22.3**, including the PM2 interpreter/systemd executable and every maintenance command. Read `.nvmrc`; don't rely on the interactive shell's default. Use `nvm use` if installed, or put the approved version's absolute `bin` directory first in PATH, then check `node --version` again in that same shell. Do not replace a shared Node installation automatically. The original requested v24.11.0 was superseded by George's approval to use the patched Node 24 release.

Record the existing MongoDB version, supported upgrade path and journaling/durable storage. Do not upgrade MongoDB as part of diagnostics. Keep both Node and MongoDB bound to loopback and the site restricted to NBI.

## 2. Verify the exact selected configuration

Use this launcher for all commands. It loads the file before starting the child Node process, including `NODE_EXTRA_CA_CERTS`. Inherited environment variables override file values, so run with the intended service environment. A local `.env` fallback is supported for development; never rely on it for VM maintenance.

```sh
npm run config:check -- --env-file /etc/scinteg.env
```

Expected production values:

| Setting | Required value / check |
| --- | --- |
| `MAIL_MODE` | `production` only at cutover; separate `test` staging beforehand |
| `REPORT_RECIPIENTS` | `nick.talbot@tsl.ac.uk,debbie.feather@tsl.ac.uk` — confirmed by George; use full addresses, not legacy usernames |
| `WEBMASTER_EMAIL` | `deeks@nbi.ac.uk` |
| `REPORT_BCC_WEBMASTER` | `true` — George receives report copies for now |
| `PUBLIC_ORIGIN` | Exact HTTPS origin people use, including nonstandard port if any |
| `MONGODB_URI` | Explicit correct production database; verify privately, never print it |
| `DATA_DIR` | Absolute canonical private path outside all app/release/web directories; e.g. `/var/lib/scinteg/data` |
| `ATTACHMENTS_ENABLED` | `true` for the attachment rollout |
| `UPLOAD_SCAN_MODE` | `disabled`, as explicitly selected by George; no antivirus process is required |
| `MAX_CONCURRENT_UPLOADS` | Start at `1`; measure VM memory before raising |
| File limits | 10 files, 10,000,000 bytes each, 15,000,000 total |
| `MAX_MAIL_ATTEMPTS` | `60` |
| `NOTIFICATION_OVERDUE_MINUTES` | `240` |
| `ALERT_REPEAT_MINUTES` | `240` |
| `SMTP_REQUIRE_TLS` | `true`; verify relay STARTTLS and trusted CA |

Old `EMAIL_RECIPIENTS`, `WEBMASTER` and `WEBMASTER_TESTING` settings do not configure the rewrite. Do not assume an old `.env` is compatible. The form does not display investigator names; attachments are emailed normally. There is no investigator login/password portal.

Check the service user owns the private data tree and cannot write into the public web root. Check directories for unexpected symlinks and the service sandbox's write permissions. Production startup rejects data paths resolving into this release and symlinked storage subdirectories. Preserve old release directories and old uploads until the retention procedure is complete.

## 3. SMTP, antivirus and capacity

```sh
# No email: DNS, SMTP connection, TLS and configured authentication.
npm run test:mail:vpn -- --env-file /etc/scinteg.env --check-only
# One synthetic attachment email; code forces George as the only recipient.
npm run test:delivery -- --env-file /etc/scinteg.env
# Only when UPLOAD_SCAN_MODE=clamav: clean file + harmless EICAR.
npm run test:scanner -- --env-file /etc/scinteg.env
```

George must confirm inbox receipt and attachment readability; SMTP acceptance alone is insufficient. A VPN route does not itself establish relay permission. If an internal CA is needed, use the NBI-supplied PEM via `NODE_EXTRA_CA_CERTS` and confirm `config:check` reports extra certificates loaded. Do not disable certificate validation or TLS to obtain a green result.

Confirm the relay accepts at least the encoded size of the configured maximum: 15 MB raw attachments is approximately 21 MB of email. The default synthetic delivery is small and does **not** prove this limit. Get the relay limit from NBI or perform a separately prepared synthetic boundary-size test to George only; lower the application limits if needed.

If enabling antivirus later, measure one real full-signature scan's peak RSS and duration (`/usr/bin/time -v` around the scanner check if available). A Mac measurement was approximately 1.5 GB per `clamscan`; use the actual VM measurement. Allow headroom for MongoDB, Node, nginx and the OS. Check `freshclam` updating successfully and signature age. EICAR success alone does not prove freshness. Keep one upload slot unless measurements justify more; a busy slot returns a retriable message.

## 4. Staging and proxy checks

Use a **separate** database, data directory, port and environment file for staging. Set `MAIL_MODE=test` and production-equivalent scan-mode/TLS settings. If dependencies/dev tools are available in the staging checkout:

```sh
node --version
npm ci --ignore-scripts
npm run build
npm test
# Optional real-engine suite when ClamAV is installed; not a disabled-mode release gate:
npm run test:scanner:dev
npm run test:backup
npm run test:e2e
```

These suites use synthetic records and isolated databases/local mail sinks. `test:backup` additionally requires MongoDB Database Tools; browser tests require Playwright Chromium. Don't install dev dependencies over the live release during an audit. Record missing tools as NOT RUN, not PASS.

In staging, test a text report, each supported file family, multiple files, retry after a deliberate mail outage, restart recovery, help form, and unsupported/oversized file rejection. For disabled antivirus, verify files are accepted without invoking a scanner; test malware rejection only when antivirus is enabled. Inspect the email to George and verify original attachment bytes. Exercise alert generation using **synthetic staging** failures. Never submit a fake report to the production form.

After an authorized start of this release, check locally and through the actual HTTPS hostname:

```sh
curl --max-time 5 -i http://127.0.0.1:3000/health/live
curl --max-time 5 -i http://127.0.0.1:3000/health/ready
curl --max-time 5 -i http://127.0.0.1:3000/health/notifications
curl --max-time 10 -i https://YOUR-SCINTEG-HOST/health/notifications
npm run monitor -- --env-file /etc/scinteg.env
sudo nginx -t
```

Check `deploy/nginx.conf.example` against the existing HTTPS configuration: body size, request buffering, timeouts and route forwarding. Preserve network restrictions. If nginx can reach Node from the shell but gives 502, inspect recent restricted nginx/journal/SELinux AVC evidence. On AlmaLinux 9, investigate the `httpd_can_network_connect` SELinux boolean for reverse proxy traffic. Apply the documented policy adjustment only when needed and approved; never disable SELinux globally. [RHEL 9 nginx reverse-proxy instructions](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/html-single/deploying_web_servers_and_reverse_proxies/index).

## 5. Alerts and 502 evidence

The app persists operational alerts in `DATA_DIR/ops` and sends them to George, normally on its next minute check. First failures alert promptly; repeated issues are coalesced to at most one email per issue category per four hours per monitor channel. Unsent notifications become overdue after four hours; terminal/uncertain failures flag immediately. Failed SMTP alerts remain queued for retry. Alert counts are observations, not counts of affected submissions.

Install/adapt `deploy/scinteg-monitor.service.example` and `.timer.example` **after approval**, removing `.example` from installed names. Match the existing app account, Node path, working directory, environment path and writable data path. This monitor must run independently of the app and uses a separate alert state file; it can therefore report a stopped app or startup failure. Don't run two monitor instances sharing that state file. The app itself can run under either PM2 or systemd, not both.

```sh
# After paths and installation are approved:
sudo systemctl daemon-reload
sudo systemctl enable --now scinteg-monitor.timer
systemctl list-timers scinteg-monitor.timer
sudo journalctl -u scinteg-monitor.service --since '1 hour ago' --no-pager
```

Confirm the timer actually runs and writes `health_sample`, including the notification check. Prove alert receipt using a separate staging monitor and a stopped staging app. A same-VM monitor cannot report a whole-VM outage; existing NBI infrastructure monitoring should cover VM-down. SMTP outages also delay email alerts. These are known limitations, not promises of guaranteed instant alerts.

During a 502 collect timestamp/timezone, PM2/systemd state and restart counts, public/local probe results, nginx upstream timing logs, kernel OOM events, RAM and disk before restarting. Use `OPERATIONS.md`. Restrict and rotate logs; do not share raw historical logs that contain client IPs or report information.

## 6. Evidence preservation, backup and cutover

Follow `DATA_RETENTION_AND_RECOVERY.md`. Before cutover, verify a private backup of the old database (`forms` included), old `uploads/`, environment/service/proxy configuration and rollback release. The backup helper covers the database selected by its configuration; if old and new databases differ, back up **both**. Check restoration into an isolated destination. Do not migrate old reports into the outgoing queue.

Identify the ongoing backup job, protected off-VM destination, last successful backup, restore evidence and owner. A script existing in Git is not an active backup policy. The supplied backup command requires all writers stopped throughout; schedule a short maintenance window or use an institutionally managed coordinated snapshot procedure. Never silently take an inconsistent live copy.

After cutover, run config/health/queue checks again, confirm only one production app instance, monitoring status recorded, scanner updates scheduled if antivirus is enabled, and logs/backups have owners. Keep `submissions_v2` and new evidence even if rolling back: the old app won't process the new queue.

## Report format / release decision

Return: exact revision and Node version; PASS/FAIL/NOT RUN per section; any blocker with evidence and a concrete fix; confirmed investigator/BCC routing; inbox confirmation outstanding or complete; scan mode (and peak memory/signature age only if antivirus is enabled); monitoring activation; backup/restore status; and **GO / GO FOR STAGING ONLY / NO-GO**. Separate environmental gaps from code defects. Do not call required TLS/delivery and durable-storage checks passed without evidence. Record agreed operational deferrals explicitly. Scanner capacity is a prerequisite only if antivirus is enabled.
