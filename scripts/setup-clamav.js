import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

// Keep developer signatures/configuration in this ignored workspace directory.
// Do not touch system scanner configuration or start a service.
const root = path.resolve('var/clamav');
const database = path.join(root, 'db');
await mkdir(database, { recursive: true, mode: 0o700 });
const config = path.join(root, 'freshclam.conf');
if (/[\r\n"]/.test(database)) throw new Error('Unsupported workspace path for FreshClam configuration');
await writeFile(config, `DatabaseDirectory "${database}"\nDatabaseMirror database.clamav.net\nMaxAttempts 1\nConnectTimeout 10\nReceiveTimeout 30\nTestDatabases yes\n`, { mode: 0o600 });
console.info('Downloading/updating official ClamAV signatures into var/clamav/db. This can take a few minutes.');
// Recent Homebrew builds need the packaged ClamAV signing CA explicitly located.
// This does not replace or disable HTTPS certificate verification.
let certificates = process.env.CVD_CERTS_DIR;
if (!certificates) {
  for (const candidate of ['/opt/homebrew/etc/clamav/certs', '/usr/local/etc/clamav/certs', '/etc/clamav/certs']) {
    try { await access(path.join(candidate, 'clamav.crt')); certificates = candidate; break; } catch {}
  }
}
const env = { ...process.env, ...(certificates ? { CVD_CERTS_DIR: certificates } : {}) };
const child = spawn('freshclam', [`--config-file=${config}`, '--stdout'], { stdio: 'inherit', env });
child.on('error', () => {
  console.error('FreshClam is unavailable. Install ClamAV first (brew install clamav on macOS).');
  process.exitCode = 1;
});
child.on('exit', code => {
  if (code === 0) console.info('Ready. Use UPLOAD_SCAN_MODE=clamav and CLAMAV_DATABASE_DIR=./var/clamav/db for local development.');
  else {
    console.error('Signature update failed. No fixture database was substituted. The offline test:scanner:dev command remains available.');
    process.exitCode = 1;
  }
});
