import nodemailer from 'nodemailer';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { TEST_EMAIL } from './config.js';

const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

// captureOnly writes messages to config.captureDir instead of using SMTP while keeping
// the recipients and subject of config.mailMode, so a recovery export matches the
// original notification. It can only stop mail being sent, never cause sending.
export function createMailer(config, { captureOnly = false } = {}) {
  const capture = captureOnly || config.mailMode === 'capture';
  const transport = nodemailer.createTransport(capture ? {
    streamTransport: true, buffer: true, newline: 'windows',
    disableFileAccess: true, disableUrlAccess: true,
  } : {
    host: config.smtpHost, port: config.smtpPort, secure: config.smtpSecure,
    requireTLS: config.smtpRequireTLS,
    auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPassword } : undefined,
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 30_000,
    disableFileAccess: true, disableUrlAccess: true,
  });
  async function completed(info, id, recipients) {
    if (capture) {
      await mkdir(config.captureDir, { recursive: true, mode: 0o700 });
      const target = path.join(config.captureDir, `${id}.eml`);
      const temp = `${target}.${randomUUID()}.tmp`;
      await writeFile(temp, info.message, { mode: 0o600 });
      await rename(temp, target);
      return { accepted: recipients };
    }
    if (info.rejected?.length || info.accepted?.length !== recipients.length) {
      const error = new Error('Mail relay did not accept every recipient');
      error.code = info.accepted?.length ? 'PARTIAL_DELIVERY' : 'DELIVERY_REJECTED';
      throw error;
    }
    return { accepted: info.accepted };
  }
  return {
    close: () => transport.close(),
    verify: () => capture ? Promise.resolve(false) : transport.verify(),
    async sendAlert({ id, issues }) {
      if (!/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw new Error('Invalid alert identifier');
      const to = [config.mailMode === 'production' ? config.webmaster : TEST_EMAIL];
      const text = `Scinteg needs webmaster investigation.\nAssigned to: ${to[0]}\n\n${issues.map(issue => `${issue.code}: ${issue.count} observation(s)\nReferences/request IDs: ${issue.references.join(', ') || '(none)'}`).join('\n\n')}\n\nInspect the restricted logs and notification queue using the production environment file. Do not automatically resend PARTIAL_DELIVERY or DELIVERY_UNCERTAIN messages. Accepted reports remain in private storage. Rejected uploads are removed and may require the reporter to retry. No report contents are included in this alert.\nIf the relay was down, this alert may have been delayed.`;
      const info = await transport.sendMail({ from: { name: 'Scinteg operations', address: config.sender }, to,
        envelope: { from: config.sender, to }, subject: `${config.mailMode === 'production' ? '' : '[TEST] '}Scinteg: webmaster investigation required`,
        text, disableFileAccess: true, disableUrlAccess: true,
      });
      return completed(info, `alert-${id}`, to);
    },
    async send(record) {
      // Select all recipients here, including the SMTP envelope. Never trust record fields.
      const to = config.mailMode === 'production'
        ? (record.kind === 'help' ? [config.webmaster] : config.recipients)
        : [TEST_EMAIL];
      const bcc = config.mailMode === 'production' && record.kind === 'report' && config.reportBccWebmaster && !to.includes(config.webmaster) ? [config.webmaster] : [];
      const envelopeTo = [...new Set([...to, ...bcc])];
      const id = String(record._id);
      if (!/^[a-f0-9]{24}$/.test(id)) throw new Error('Invalid stored report identifier');
      const attachments = await Promise.all((record.files || []).map(async file => {
        if (!/^[a-f0-9-]{36}$/.test(file.storageName)) throw new Error('Invalid stored attachment');
        return {
          filename: file.name, contentType: file.mimetype,
          content: await readFile(path.join(config.dataDir, 'reports', id, file.storageName)),
        };
      }));
      const text = record.kind === 'help'
        ? `Anonymous help request\nReference: ${id}\nSubject: ${record.subject}\n\n${record.description}`
        : `A scientific misconduct report has been submitted.\nReference: ${id}\n\n${record.description}\n\nAttachments: ${(record.files || []).map(f => f.name).join(', ') || '(none)'}`;
      const info = await transport.sendMail({
        // A file capture would keep a Bcc header; leave it out so an export shows what the visible recipients received.
        from: { name: 'Scinteg', address: config.sender }, to, bcc: capture ? [] : bcc,
        envelope: { from: config.sender, to: envelopeTo },
        messageId: `<scinteg-${id}@${config.sender.split('@')[1]}>`,
        subject: `${config.mailMode === 'production' ? '' : '[TEST] '}${record.kind === 'help' ? 'Scinteg anonymous help request' : 'Scinteg report — action required'} (${id})`,
        text, html: `<div style="white-space:pre-wrap;font-family:Arial,sans-serif">${escape(text)}</div>`,
        attachments, disableFileAccess: true, disableUrlAccess: true,
      });
      return completed(info, id, envelopeTo);
    },
  };
}
