import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { simpleParser } from 'mailparser';
import { createMailer } from '../server/mail.js';
import { loadConfig } from '../server/config.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export async function renderMailPreview(captureDir) {
  const names = (await readdir(captureDir)).filter(name => /^[a-f0-9]{24}\.eml$/.test(name)).sort();
  const cards = [];
  for (const name of names) {
    const mail = await simpleParser(await readFile(path.join(captureDir, name)), { skipHtmlToText: true, skipTextToHtml: true });
    const fields = { From: mail.from?.text, To: mail.to?.text, Cc: mail.cc?.text || '(none)', Bcc: mail.bcc?.text || '(none)', Subject: mail.subject, 'Message-ID': mail.messageId };
    const rows = Object.entries(fields).map(([label, value]) => `<tr><th>${label}</th><td>${escape(value)}</td></tr>`).join('');
    const attachments = mail.attachments.map(file => `<li>${escape(file.filename)} — ${escape(file.contentType)} — ${file.size} bytes<br><small>SHA-256: ${createHash('sha256').update(file.content).digest('hex')}</small></li>`).join('');
    const body = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'">${mail.html || '<pre>' + escape(mail.text) + '</pre>'}`;
    cards.push(`<article><h2>${escape(mail.subject)}</h2><table>${rows}</table><h3>HTML body</h3><iframe title="HTML email body" sandbox="" srcdoc="${escape(body)}"></iframe><details><summary>Plain-text body</summary><pre>${escape(mail.text)}</pre></details><h3>Attachments</h3><ul>${attachments || '<li>(none)</li>'}</ul><a href="${name}" download>Download original .eml</a></article>`);
  }
  const output = path.join(captureDir, 'preview.html');
  await writeFile(output, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; frame-src 'self'; base-uri 'none'; form-action 'none'"><title>Scinteg development emails</title><style>body{font:16px/1.5 system-ui,sans-serif;background:#f4f7fa;color:#243746;max-width:1000px;margin:2rem auto;padding:0 1rem}article{background:white;border:1px solid #cad5dd;padding:1.5rem;margin:1.5rem 0;border-radius:6px}table{width:100%;border-collapse:collapse}th{text-align:left;width:120px}td,th{vertical-align:top;padding:.35rem;overflow-wrap:anywhere}iframe{width:100%;min-height:280px;border:1px solid #cad5dd}pre{white-space:pre-wrap;overflow-wrap:anywhere}small{overflow-wrap:anywhere}a{color:#175985}h2{font-size:1.2rem}</style></head><body><h1>Scinteg development emails</h1><p>No email was sent by this preview command. These are locally captured MIME messages. HTML is sandboxed, and scripts and remote resources are blocked.</p>${cards.join('') || '<p>No captured messages found.</p>'}</body></html>`, { mode: 0o600 });
  return output;
}

export async function generateMailPreview(directory = path.resolve('var/dev-mail')) {
  // Intentionally ignore .env and process.env: preview generation can never enable SMTP.
  const config = loadConfig({ MAIL_MODE: 'capture', DATA_DIR: directory });
  const id = '000000000000000000000001';
  const folder = path.join(config.dataDir, 'reports', id);
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const samples = [
    { name: 'résumé-α.txt', mimetype: 'text/plain', bytes: Buffer.from('Synthetic evidence only.\nUnicode: αβ café\n') },
    { name: 'pixel.png', mimetype: 'image/png', bytes: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1EAAAAASUVORK5CYII=', 'base64') },
  ];
  const files = [];
  for (const [index, sample] of samples.entries()) {
    const storageName = `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
    await writeFile(path.join(folder, storageName), sample.bytes, { mode: 0o600 });
    files.push({ name: sample.name, mimetype: sample.mimetype, storageName });
  }
  const mailer = createMailer(config);
  try {
    await mailer.send({ _id: id, kind: 'report', description: 'SYNTHETIC DEVELOPMENT REPORT — not a real allegation.\nLine breaks, αβ, and <evidence> & "quotes" should survive safely.', files });
    await mailer.send({ _id: '000000000000000000000002', kind: 'help', subject: 'Synthetic upload query', description: 'SYNTHETIC HELP REQUEST — please ignore.\nCan you explain the attachment limits?', files: [] });
  } finally { mailer.close(); }
  return renderMailPreview(config.captureDir);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [flag, directory] = process.argv.slice(2);
  const output = flag === '--captures' && directory
    ? await renderMailPreview(path.resolve(directory))
    : !flag ? await generateMailPreview() : (() => { throw new Error('Usage: npm run dev:mail [-- --captures <capture-directory>]'); })();
  console.info(`Email preview: ${output}`);
  console.info('No SMTP connection was made.');
}
