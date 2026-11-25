# VPN mail testing and intermittent 502 diagnosis

## Test NBI email from a VPN-connected machine

VPN access can provide internal DNS and a route to the relay. The relay must also allow the VPN client's address, sender and authentication/TLS configuration. A VPN connection alone does not establish permission to relay mail.

Use Node 24.22.3, install dependencies, and configure SMTP settings in `.env` (see `.env.example`). Then, with the VPN connected:

```sh
# DNS and SMTP/TLS/authentication only; sends no email.
npm run test:mail:vpn -- --check-only

# Same checks, followed by one synthetic report and a harmless text attachment.
npm run test:mail:vpn
```

The default relay is the historical `mail.nbi.ac.uk`; override `SMTP_HOST`/`SMTP_PORT` if NBI confirms another endpoint. Every send is forced into test mode, with **deeks@nbi.ac.uk as the sole header and SMTP-envelope recipient**, regardless of production settings in `.env`. The script never reads MongoDB or existing reports, never connects/disconnects the VPN, never auto-switches the running app into production, and never silently disables TLS.

Output identifies the failed stage: configuration, DNS, SMTP or delivery. `ENOTFOUND`/`EAI_AGAIN` suggests DNS/VPN configuration; connection refusal/timeout suggests routing/firewall/listener access; TLS/authentication failures need relay configuration checked. SMTP verification does not prove sender/recipient relay permission; the synthetic send checks relay acceptance, and the inbox must still be checked for final delivery. See [Nodemailer's verification semantics](https://nodemailer.com/smtp).

For manual browser testing over VPN, `MAIL_MODE=test` in the app's **development** `.env` sends all report/help notifications only to George. Keep a separate development database/data directory and use synthetic data. Switching modes never promotes existing captured reports into live mail.

On the VM, append `-- --env-file /etc/scinteg.env` to npm maintenance commands (and put other flags after that). Use the actual service environment path. Inherited environment values override file values. The shared launcher loads `NODE_EXTRA_CA_CERTS` before child Node startup.

## What a 502 tells us

A 502 at nginx means it could not obtain a usable upstream response; it does not identify the root cause. Possibilities to investigate include an absent/crashed/restarting Node process, wrong upstream port, connection closure, or resource pressure. Upstream read timeouts commonly present as 504 instead. There are no production logs attached to this work, so no particular cause is established or fixed by adding instrumentation.

Collect evidence before increasing timeouts or adding restart loops. Record the incident time (including timezone), status and whether it occurred during upload or on an ordinary page view. Do not record the report body, attachment names, reporter address or identity.

## Terminal checklist during a production 502

SSH to the production VM using the Unix account that already runs PM2. If possible, collect this evidence **before restarting**. Replace `YOUR-APP-NAME` with the name shown by `pm2 status`, and use the actual public hostname and upstream port. Running PM2 as another user (including `sudo pm2`) can show a different process list or start a separate daemon.

```sh
date -Is
pm2 status
pm2 describe YOUR-APP-NAME
pm2 logs YOUR-APP-NAME --lines 200 --nostream

# Compare the public site with the Node listener on the VM.
curl --max-time 10 -sS -o /dev/null -w 'public: HTTP %{http_code}, %{time_total}s\n' https://YOUR-SCINTEG-HOST/
curl --max-time 5 -sS -o /dev/null -w 'local: HTTP %{http_code}, %{time_total}s\n' http://127.0.0.1:3000/

# Use the site's configured error-log path if it differs.
sudo tail -n 100 /var/log/nginx/error.log
free -h
df -h
sudo journalctl -k --since '1 hour ago' --no-pager | grep -Ei 'oom|out of memory|killed process'
```

`--nostream` prints recent logs and returns to the prompt. Avoid `pm2 flush`, which deletes useful evidence. If an old log has no timestamps, the time of a historical event may not be recoverable; configure timestamped, rotated logs for future incidents. The kernel command may return no matches; absence of an OOM entry does not rule out other resource problems.

Interpret these together:

- Public 502 and local connection refused: check the PM2 process state, restarts and configured port. nginx often reports `connect() failed ... Connection refused`.
- Public 502 but local 200: investigate nginx's upstream configuration and the matching error-log entry. A later successful local request does not rule out a brief earlier app outage.
- `upstream prematurely closed connection`: correlate with app errors, PM2 restarts and kernel OOM events at the same time.
- Disk full, OOM kills, or increasing restarts: preserve that evidence before changing limits or restarting services.

After **this new release and its nginx logging configuration are deployed**, additional commands become available (the old app has no health endpoints):

```sh
curl --max-time 5 -i http://127.0.0.1:3000/health/live
curl --max-time 5 -i http://127.0.0.1:3000/health/ready
curl --max-time 5 -i http://127.0.0.1:3000/health/notifications
sudo tail -n 100 /var/log/nginx/scinteg-upstream.jsonl

# From this project's directory on the VM; Ctrl-C stops the watcher.
MONITOR_PUBLIC_ORIGIN=https://YOUR-SCINTEG-HOST npm run monitor -- --env-file /etc/scinteg.env --watch
```

Liveness 200 with readiness 503 points to MongoDB connectivity. Compare the diagnostic log's timestamps and request IDs with the app logs. The watcher produces a timeline only while it is running; it sends alerts only when `--alert` is supplied. Keep logs restricted and redact any client IPs, URLs or report details from old application/nginx logs before sharing them. Record whether a failure happened on a page view or upload, without including the uploaded material.

## Diagnostic layers now available

| Layer | Evidence | Limit |
| --- | --- | --- |
| Public HTTP probe | Status and elapsed time through nginx/TLS/network | A 200 home page does not prove uploads, mail or scanning work |
| Local `/health/live` | Node can answer HTTP | Does not check dependencies |
| Local `/health/ready` | Mongoose connection is ready | Not a complete database transaction or SMTP/AV check |
| `/health/notifications` | No notification has failed or stayed unsent for four hours | Status only; use `npm run notifications -- --env-file /etc/scinteg.env list` for details |
| App failure/slow-request logs | Server-generated request ID, fixed route label, status, duration, processing stage | Requests nginx cannot forward never reach this layer |
| Runtime samples | PID, uptime, RSS/heap memory, event-loop p99 delay, database connection state | Node RSS excludes ClamAV and MongoDB subprocesses |
| PM2 | Restarts, process state, startup/shutdown, stdout/stderr | A restart is evidence, not a diagnosis |
| nginx failure log | Upstream status, connect/header/response times, app request ID where available | Does not replace restricted nginx error logs when detailed diagnosis is needed |

Application request logs omit client IPs, raw URLs/queries, headers, report contents and filenames. Successful routine requests are not logged. Slow requests default to 10 seconds; runtime samples default to every minute (`SLOW_REQUEST_MS`, `OPS_LOG_INTERVAL_MS`; set the latter to 0 to disable). These logs still reveal activity timing: restrict access and retention. Existing dependency, fatal Node and nginx error logs may contain additional details; do not assume they have the same filtering.

## Probe now or record a timeline

Run on the VM to compare the public proxy with the local Node listener:

```sh
MONITOR_PUBLIC_ORIGIN=https://YOUR-SCINTEG-HOST npm run monitor -- --env-file /etc/scinteg.env
MONITOR_PUBLIC_ORIGIN=https://YOUR-SCINTEG-HOST npm run monitor -- --env-file /etc/scinteg.env --watch
```

The one-shot command exits 0 only when all configured probes pass, otherwise 1. Watch mode writes a JSON sample every minute, with bounded timeouts and no overlapping checks. `MONITOR_LOCAL_ORIGIN` defaults to `http://127.0.0.1:3000`. Set it to `off` when monitoring only the public site from a different NBI/VPN machine. Set `MONITOR_INTERVAL_MS` to change the interval (minimum 10 seconds). The default probe sends no email. Add `--alert` to persist/coalesce failures and email the webmaster; `deploy/scinteg-monitor.service.example` and `.timer.example` run it independently of the app every minute. First failures alert promptly, repeated categories at most every four hours. SMTP outages delay those emails. See `VM_PRODUCTION_CHECKS.md` for activation.

Assessments are hints, not root-cause verdicts:

- `public_path_failure`: public site failed while local checks passed (or no local checks were configured). Investigate nginx, TLS, DNS, network routing and upstream configuration.
- `notifications_need_attention`: the site works but a report or help email has failed or is overdue. Run `npm run notifications -- --env-file /etc/scinteg.env list` and check `lastError`.
- `app_unreachable_or_unresponsive`: local Node liveness failed. Compare PM2 restarts and system resource evidence at that time.
- `app_not_ready`: Node responds but its readiness check fails. Investigate MongoDB connectivity and load.
- `healthy`: all configured probes passed at that instant; intermittent failures may occur between samples.

A separate NBI-connected monitor can detect an entire VM outage. A monitor on the same VM is useful for diagnosis but shares its failure domain. Neither the watcher nor a production monitor has been started automatically by this code change.

## PM2 setup and evidence

`deploy/ecosystem.config.cjs` is an optional PM2 configuration for this release. Use **either** PM2 or the systemd app service, not both for the same port. It uses one forked instance, a bounded restart policy, readiness signalling and a 210-second shutdown allowance. It intentionally has no automatic memory-threshold restart until a threshold is chosen using observed VM/application usage.

Before starting it, set `SCINTEG_NODE_BIN` to the absolute Node 24.22.3 executable and `SCINTEG_ENV_FILE` to the intended environment file. These are deployment settings; the file defaults to `/etc/scinteg.env`. Create the log directory for the service account. Example commands to adapt on the VM:

```sh
mkdir -p var/logs
SCINTEG_NODE_BIN="$(command -v node)" SCINTEG_ENV_FILE=/etc/scinteg.env pm2 start deploy/ecosystem.config.cjs
pm2 describe scinteg
pm2 logs scinteg --lines 200 --nostream
pm2 monit
```

Logs default to `var/logs/scinteg-out.log` and `scinteg-error.log`; override with `SCINTEG_LOG_DIR`. Configure log rotation before leaving this running long-term, for example PM2's `pm2-logrotate` module, with a size cap and short retention appropriate to the institution. Do not install or restart another PM2 daemon during an incident without checking the existing service account and process list. See [PM2 log management](https://pm2.keymetrics.io/docs/usage/log-management/) and [ecosystem configuration](https://pm2.keymetrics.io/docs/usage/application-declaration/).

When investigating a failure, compare PM2 restart counts/timestamps with `server_listening`, `shutdown_started`, `shutdown_complete`, `uncaught_exception` and `runtime_sample` events. Check host-wide memory/disk pressure and kernel OOM-kill events: the scanner's memory use will not appear in Node's RSS. Do not paste raw environment dumps or report data into tickets.

## nginx configuration

Include `deploy/nginx-observability.conf.example` in the nginx `http {}` context and adapt the location in `deploy/nginx.conf.example`. The additional access log records only 5xx responses, with status/timing/correlation fields, excluding IPs and raw URLs. Restrict and rotate `/var/log/nginx/scinteg-upstream.jsonl`. An app's `X-Request-ID` appears as `app_request_id` in the proxy log when the app supplied a response.

Run `nginx -t` before reloading on the VM. Preserve existing HTTPS/network restrictions. nginx's normal error log is not covered by this custom access-log format and can contain client IPs and URLs; keep it restricted with short retention and inspect only what is needed for diagnosis. [nginx proxy configuration reference](https://nginx.org/en/docs/http/ngx_http_proxy_module.html).

With a single app instance, planned restarts can briefly produce proxy failures. The long PM2 shutdown allowance lets in-flight requests finish, but it is not zero-downtime deployment. Avoid changing to multiple instances without coordinating rate/concurrency limits and storage cleanup.
