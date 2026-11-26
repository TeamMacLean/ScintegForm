# Deployment handoff and next-release TODO

The text-only production deployment is complete. This is the remaining-work list; no further restart or cutover is required to finish this handoff.

## Current deployed baseline

- Public site: https://scinteg.tsl.ac.uk
- Exact deployed-source commit: `1c74ecb02bcb226d10b66acf30dd87496b8d506a`. All 126 tracked files in that commit match the running release byte-for-byte. Later documentation-only commits do not change deployed application code.
- Release: `/var/lib/scinteg/releases/text-only-20261126`; Node **24.22.3**; one PM2 application named `scinteg`.
- Production configuration: `/etc/scinteg.env`; retain `ATTACHMENTS_ENABLED=false`, `MAIL_MODE=production` and `UPLOAD_SCAN_MODE=clamav`. Do not substitute `MAX_FILES=0` or disable scanning.
- Reports/descriptions, help requests, durable delivery and webmaster BCC are enabled. Attachments are explicitly unavailable; attachment-specific checks are deferred, not passed.
- Cutover completed on **2026-11-26**, with **29.965 seconds** stop-to-verified maintenance. Checksum, isolated database restore, document hashes and evidence hashes passed before startup.
- The dedicated `scinteg-text-only.service` is **enabled for next boot**, but intentionally inactive during this boot because its PM2 daemon is already running independently. Do not start the unit over that daemon merely to change its displayed status. No reboot test has been performed.
- Legacy applications are stopped, with no competing boot/cron entry. Separate emergency recovery remains at `/var/lib/scinteg/rollback/nuxt-929a84f` and uses EOL Node 12; it is not the new text-only implementation.

## Private records and recovery

- Deployment record, reviewed patch/helpers and recovery instructions: `/var/lib/scinteg/deployments/20261126T121835Z-j2iwrudj/`.
- Verified pre-cutover database/evidence/configuration bundle: `/var/backups/scinteg/cutover-qXqZ28/`.
- Closeout archive and checksum: `/var/backups/scinteg/deployment-archives/scinteg-text-only-20261126.tar.gz` and the adjacent `.sha256`; archive inventory/provenance: adjacent `.manifest.json`.
- The closeout archive is **private, local and not itself encrypted**. It includes records, source history, startup metadata and the existing verified pre-cutover bundle; it is not a fresh backup of post-cutover submissions or a complete VM/release-dependency image. Keep the retained release/recovery directories too.
- Never commit archives, PM2 dumps, private environment files, database dumps or report/evidence contents to GitHub.
- Never restore an older database over current accepted reports. Legacy recovery cannot process the new-format notification queue: preserve it and reconcile pending/uncertain delivery manually. See `DATA_RETENTION_AND_RECOVERY.md`.

## Manual checks while monitoring is deferred

Run as `deeks`; these commands do not create reports or send test email:

```bash
NODE=/opt/nvm/versions/node/v24.22.3/bin/node
OPS=/var/lib/scinteg/preparation/cutover.mjs
"$NODE" "$OPS" verify
"$NODE" "$OPS" queue
```

## Operational follow-ups — proposed owners and deadlines

- [ ] **George, initially hourly during working hours:** run the health/queue checks above and investigate failed or overdue notifications. Do not blindly retry uncertain deliveries; existing email alerts cannot independently detect an SMTP or VM outage.
- [ ] **George / NBI infrastructure — 2026-11-26 17:00 UTC:** copy the private closeout archive and retained release/recovery artifacts to an approved encrypted off-VM location; verify checksums at the destination. The local archive does not satisfy this requirement.
- [ ] **George — 2026-11-27 17:00 UTC:** configure independent health/queue monitoring and schedule a controlled reboot-persistence check. Verify only the dedicated new PM2 home is resurrected and port 3000 has one intended listener. Do not reboot merely to close this task.
- [ ] **George / NBI infrastructure — 2026-12-03 17:00 UTC:** establish coordinated automated database/evidence/configuration backups, destination verification, access controls and an approved retention policy.
- [ ] **George / NBI infrastructure — 2026-12-10 17:00 UTC:** perform a broader disaster-recovery exercise, including off-VM restoration, dependencies/assets, configuration and notification reconciliation without unintended delivery.

## Before attachments can be re-enabled

- [ ] **NBI infrastructure, coordinated by George — review by 2026-11-30 17:00 UTC:** obtain an approved supported ClamAV package with the 1.4.7 security fixes or documented equivalent backports. Available 1.4.6 had no such evidence.
- [ ] Validate current full official signatures and run one bounded clean/EICAR check with safe host headroom. Measure scan duration against the configured application timeout. Previous soft-memory throttling was not proof of a passing memory requirement; do not repeat the stalled test or remove protection indiscriminately.
- [ ] Confirm relay attachment-size support and application/mail limits.
- [ ] Test normal scanned attachments in isolated staging, including clean, malicious and unsupported files. Any synthetic external delivery must go only to `deeks@nbi.ac.uk`; never test against investigators.
- [ ] Obtain approval for attachment re-enablement only after these gates pass. Keep the explicit text-only configuration until then; no automatic re-enable date is promised.

## Next code deployment

- [ ] Fetch/reconcile GitHub, identify the currently running immutable release and preserve its source/operational provenance. Never install dependencies into a running legacy checkout or overwrite its only recovery copy.
- [ ] Prepare a separate candidate and run tests relevant to the change. Verify explicit production configuration, Node version, recipients/BCC, private storage, trusted HTTPS and isolated staging. Do not put real report contents in diagnostics.
- [ ] Recheck actual process/service ownership and saved startup definitions. The existing helper's **`stop-legacy` and initial `start` actions are tied to the 2026-11-26 cutover**; do not rerun them as a generic redeploy procedure. Scope the next stop/start to the currently active dedicated PM2 deployment.
- [ ] Before an approved maintenance window, prepare a runnable rollback and a fresh consistent database/evidence/configuration backup procedure; require checksum, isolated restore and evidence verification before activating new code.
- [ ] Get explicit cutover approval, preserve all post-cutover data on rollback, verify runtime/health/queue/startup exclusivity, then record the deployed commit and archive the new deployment evidence. No synthetic production reports or investigator test emails.

Additional operator references: `VM_PRODUCTION_CHECKS.md`, `OPERATIONS.md`, and `DATA_RETENTION_AND_RECOVERY.md`. Attachment-specific requirements in those guides remain gates for re-enablement, not unfinished blockers for the already-approved text-only deployment.
