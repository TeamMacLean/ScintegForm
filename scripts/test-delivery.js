import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID, randomBytes } from 'node:crypto';
import { loadConfig, TEST_EMAIL } from '../server/config.js';
import { createMailer } from '../server/mail.js';

// This entry point cannot select production mode or another recipient, even with a production .env.
const dir = await mkdtemp(path.join(os.tmpdir(), 'scinteg-delivery-'));
let mailer;
try {
  const config = loadConfig({ ...process.env, MAIL_MODE: 'test', TEST_EMAIL, DATA_DIR: dir });
  mailer = createMailer(config);
  const id = randomBytes(12).toString('hex');
  const storageName = randomUUID();
  await mkdir(path.join(dir, 'reports', id), { recursive: true, mode: 0o700 });
  await writeFile(path.join(dir, 'reports', id, storageName), 'Synthetic attachment for Scinteg delivery testing.\n', { mode: 0o600 });
  await mailer.send({ _id: id, kind: 'report', description: 'SYNTHETIC TEST — no real misconduct report. This checks the notification email and attachment.', files: [{ name: 'synthetic-evidence.txt', mimetype: 'text/plain', storageName }] });
  console.info(`SMTP relay accepted the synthetic report for ${TEST_EMAIL}. Check the inbox to confirm final delivery.`);
} catch {
  console.error('Test delivery failed. Check SMTP_HOST/PORT, TLS settings and NBI network access. No production recipients were used.');
  process.exitCode = 1;
} finally {
  mailer?.close();
  await rm(dir, { recursive: true, force: true });
}
