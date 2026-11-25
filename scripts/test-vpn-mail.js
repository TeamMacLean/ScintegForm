import { lookup } from 'node:dns/promises';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { randomUUID, randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { loadConfig, TEST_EMAIL } from '../server/config.js';
import { createMailer } from '../server/mail.js';

export async function runVpnMailTest({ env = process.env, checkOnly = false, log = record => console.info(JSON.stringify(record)), lookupHost = lookup } = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'scinteg-vpn-mail-'));
  let mailer;
  let stage = 'configuration';
  try {
    const config = loadConfig({ ...env, SMTP_HOST: env.SMTP_HOST || 'mail.nbi.ac.uk', MAIL_MODE: 'test', TEST_EMAIL, DATA_DIR: dir });
    stage = 'dns';
    let timeout;
    try {
      await Promise.race([lookupHost(config.smtpHost), new Promise((resolve, reject) => {
        timeout = setTimeout(() => reject(Object.assign(new Error('DNS timeout'), { code: 'ETIMEDOUT' })), 5000);
      })]);
    } finally { clearTimeout(timeout); }
    log({ stage, status: 'passed' });
    stage = 'smtp';
    mailer = createMailer(config);
    await mailer.verify();
    log({ stage, status: 'passed', note: 'SMTP connection, configured TLS and authentication verified; relay acceptance is checked only by sending.' });
    if (!checkOnly) {
      stage = 'delivery';
      const id = randomBytes(12).toString('hex');
      const storageName = randomUUID();
      await mkdir(path.join(dir, 'reports', id), { recursive: true, mode: 0o700 });
      await writeFile(path.join(dir, 'reports', id, storageName), 'Synthetic attachment for Scinteg VPN delivery testing.\n', { mode: 0o600 });
      await mailer.send({ _id: id, kind: 'report', description: 'SYNTHETIC VPN TEST — no real misconduct report. This checks NBI relay acceptance and an attachment. Please confirm receipt in the test inbox.', files: [{ name: 'synthetic-vpn-evidence.txt', mimetype: 'text/plain', storageName }] });
      log({ stage, status: 'accepted', recipient: TEST_EMAIL });
    }
    log({ stage: 'complete', status: 'passed', note: checkOnly ? 'No email sent.' : 'Check deeks@nbi.ac.uk to confirm inbox delivery.' });
  } catch (error) {
    const code = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'EAUTH', 'ETLS', 'ESOCKET', 'ECONNECTION', 'EENVELOPE', 'EMESSAGE', 'PARTIAL_DELIVERY', 'DELIVERY_REJECTED']).has(error.code) ? error.code : 'CHECK_FAILED';
    throw Object.assign(new Error(`VPN mail test failed at ${stage} (${code}). Check VPN/DNS, relay access, TLS and credentials for this stage.`), { stage, code });
  } finally { mailer?.close(); await rm(dir, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--check-only')) throw new Error('Usage: npm run test:mail:vpn [-- --check-only]');
  try { await runVpnMailTest({ checkOnly: args.includes('--check-only') }); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
