# Evidence preservation, backup and manual recovery

## Chosen approach

Preserve the old `forms` collection and original `uploads/` directory without converting or resending historical reports. Keep the old release location until those files are copied into a verified private backup. The rewrite stores new records in `submissions_v2` and originals in an external `DATA_DIR/reports`. An explicit migration offers little immediate benefit and risks accidental replay or evidence loss; historical recovery remains an operator task.

There is no automatic expiry of accepted evidence or historical data. George/institutional records owners must eventually set retention covering database records, originals, backups and recipient mailboxes. Until then, monitor disk usage and preserve records. Do not delete folders labelled `storage_orphans_found`: a wrong database URI or stale restore can make genuine evidence look orphaned. Only abandoned quarantine directories older than a day are automatically cleaned.

## Consistent offline backup

The supplied command requires MongoDB Database Tools (`mongodump`, `mongorestore`) compatible with the VM's MongoDB, and `tar`. On AlmaLinux 9 use the institution's approved RHEL-compatible packages. Check tool versions first. [MongoDB Database Tools](https://www.mongodb.com/docs/database-tools/).

Configure absolute private paths in the selected environment file:

```dotenv
BACKUP_DIR=/var/backups/scinteg
LEGACY_UPLOADS_DIR=/actual/old/release/uploads
```

`BACKUP_DIR` must be outside the app, new data and legacy uploads trees. The optional legacy path must be the actual old directory, not a guessed path. The service account needs read access to sources and write access to the backup destination. Keep that destination private and use restricted off-VM encrypted storage for the second copy. Disk encryption/access controls are infrastructure responsibilities; the tar archive is **not itself encrypted**.

For an approved maintenance window:

1. Put the site into maintenance, stop the actual PM2 **or** systemd app, stop the independent monitor temporarily, and stop any old app or CLI process that can write the selected database/storage. Keep MongoDB running. Verify writers are stopped; the helper's closed-port check is a guard, not proof that every writer stopped.
2. Select Node 24.22.3, verify it, and run:

   ```sh
   npm run backup -- --env-file /etc/scinteg.env --offline
   ```

3. Check the returned archive's checksum from `BACKUP_DIR` with `sha256sum --check <archive-name>.sha256`. Copy archive and checksum to the institution's restricted off-VM backup location, verify again there, and record success without exposing contents.
4. Restart the previously running app and monitor; check all health endpoints and queue status. A failed backup does not justify deleting evidence. Establish a daily backup schedule/maintenance window or use the institution's coordinated backup system; this repository does not automatically stop a live service on a timer.

The archive includes the **selected database** (including both collections if they share that database), `reports/`, optional `recovery/`, optional operational alert state, optional `legacy-uploads/`, and a manifest. It excludes quarantine and development mail captures. If the historical database differs, preserve a second database backup too. Back up production environment/service/proxy configuration separately in a restricted secrets backup.

The helper writes the MongoDB URI only to a temporary mode-0600 config file, removes it before archiving, never puts it into command arguments, rejects source symlinks, and removes only its own incomplete staging files. There is no automatic backup pruning. Abrupt VM loss can leave private incomplete staging files; review them manually. Do not mistake `.partial` files for completed backups.

Why offline: separate MongoDB and filesystem copying cannot form an atomic snapshot while uploads/workers are changing them. MongoDB also documents that dumps without an oplog require writes to stop for a consistent point-in-time result. [MongoDB backup guidance](https://www.mongodb.com/docs/manual/tutorial/backup-and-restore-tools/).

## Restore rehearsal and disaster recovery

`npm run test:backup` performs an actual dump, archive, extraction and MongoDB restore with synthetic old/new collections and files in disposable directories. It never touches the real database. CI's standard suite does not install Database Tools; run this additional suite wherever the tools are installed.

A production restore rehearsal is a separate restricted operator action. Verify checksum first, extract a trusted archive into a new private directory, and restore into a **new isolated MongoDB database/server** with no app worker attached. Use a private `mongorestore --config` file for credentials, `--archive=<extracted>/database.archive.gz --gzip`, and explicit namespace selection/mapping if restoring under another database name. In that case, avoid a destination database in the URI accidentally filtering out source namespaces; use `--nsInclude='SOURCE_DB.*' --nsFrom='SOURCE_DB.*' --nsTo='RESTORE_DB.*'`. Never use `--drop` against the production database for a rehearsal.

Privately verify collection counts, references and attachment hashes against the originals without sharing record contents with an AI/chat. Restore database and files from the same backup. Keep mail workers stopped while reconciling queued/failed notifications: an older backup may contain pending messages already delivered since the snapshot. Do not start a restored queue in production until George checks this. Keep the original archive and current data intact until recovery is confirmed.

## George's notification recovery procedure

Production reports go to **nick.talbot@tsl.ac.uk** and **debbie.feather@tsl.ac.uk**, with **deeks@nbi.ac.uk** BCC. Help requests and operational alerts go only to George. Files are ordinary email attachments, with no new recipient password or download portal. George authorised `UPLOAD_SCAN_MODE=disabled` on 2026-11-26 to restore uploads: antivirus is skipped in that mode, while type/size/Office validation remains. Encrypted Office containers are still rejected. If ClamAV is enabled, password-protected source files must be unlocked before scanning.

The worker retries ordinary mail failures up to 60 attempts with a one-hour backoff cap (approximately 53 hours total). It retries a failed *database completion write* without sending the email again. After a process crash, a sending lease older than five minutes becomes `DELIVERY_UNCERTAIN` and requires manual review. Partial recipient delivery also requires manual review. SMTP itself can still produce ambiguity when the relay accepts a message but the connection fails before acknowledgment; exactly-once email cannot be guaranteed.

```sh
npm run notifications -- --env-file /etc/scinteg.env list
# Export only the chosen accepted record; does not send email or change its state.
npm run notifications -- --env-file /etc/scinteg.env export REFERENCE
```

The export creates a private `.eml` under `DATA_DIR/recovery` with the original attachments, addressed and titled exactly as the original notification for the selected mode: in production, to the investigators with no `[TEST]` prefix (George's BCC is not shown in the file); in test or capture mode, to George with `[TEST]`. Open it in an approved mail client and forward only to the verified intended recipients. Never put it in `public/`, paste it into chat or attach it to a diagnostic ticket. Check George's BCC copy/relay delivery evidence first, especially with `PARTIAL_DELIVERY` or `DELIVERY_UNCERTAIN`; forward only to recipients still needing it.

After confirming manual delivery, mark a **failed** notification resolved:

```sh
npm run notifications -- --env-file /etc/scinteg.env resolve REFERENCE
```

Alternatively, once the relay problem is fixed and prior delivery ruled out:

```sh
npm run notifications -- --env-file /etc/scinteg.env retry REFERENCE
```

Retry is an explicit queue mutation: the running worker will send to production recipients. Do not run it as a diagnostic. Resolve is an operator attestation, not independent delivery proof. Neither command deletes evidence. Rejected uploads have no accepted report to export; the reporter must retry from the retained browser form. Alerts identify request IDs/references and fixed error categories, not report contents; a mail outage can delay those alerts too.
