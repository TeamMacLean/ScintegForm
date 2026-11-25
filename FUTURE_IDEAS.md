# Future project ideas

## Bundle many evidence files into a ZIP for recipients

Status: deferred. Continue prioritising reliable submissions, safe uploads and predictable email delivery.

A server-generated ZIP could make a report with many small files easier to download and keep together. It may reduce attachment count and MIME overhead. It is unlikely to shrink already compressed JPEG, PDF or Office files much, and it does not bypass the mail relay's size limits. Some gateways may block or quarantine archives.

If implemented later:

- Generate the archive from already validated and scanned originals. Continue rejecting user-uploaded archives unless a separate, bounded archive-inspection policy is introduced.
- Keep originals unchanged, with their hashes and original names. Produce a manifest mapping safe, unique ZIP entry names to originals, especially for duplicate names and Unicode names.
- Preserve individual size, total size and file-count limits. Raising the count needs its own resource-budget review; a ZIP alone is not a reason to remove limits.
- Stream archive creation with bounded CPU, disk and memory usage. Avoid path traversal, absolute paths and duplicate entries. Clean up cancelled/failed builds and temporary delivery copies.
- Enforce the relay limit on the resulting MIME message, accounting for base64 encoding and headers. ZIP size alone is insufficient.
- Test empty/single/many files, duplicate and unusual names, incompressible data, disk exhaustion, interrupted construction, retries and recipient extraction. Verify NBI gateway treatment of generated ZIPs.
- Consider a configurable bundling threshold only after measuring typical file counts and asking recipients which format is easier to review.

For genuinely large evidence sets, restricted downloads may be more useful than email attachments, but would introduce recipient access control, expiry, auditing and retention work. Keep that as a separate design decision.

## Independent uptime monitoring

The repository now provides a probe and diagnostic logging; production activation is separate. A monitor on another NBI/VPN-connected machine can detect loss of the whole VM. A probe running on the application VM can compare nginx with Node and MongoDB readiness, but cannot report while its own VM is down.

Potential later additions: a private uptime dashboard, alerts after consecutive failures and on recovery, and a maintenance-window feature. Monitor synthetic health endpoints only. Do not submit fake misconduct reports on a timer or expose the internal site publicly to make an external monitor reach it. Webmaster alerts to George and a same-VM systemd timer are now implemented; activate them using `VM_PRODUCTION_CHECKS.md`. Off-VM monitoring remains an infrastructure follow-up.

## Remove the webmaster report BCC later

George has explicitly retained `deeks@nbi.ac.uk` as a BCC on production reports for now. Once operational recovery is established and the institution agrees, set `REPORT_BCC_WEBMASTER=false`. Help and operational alerts still go to the webmaster. This is a future owner decision, not part of this release.
