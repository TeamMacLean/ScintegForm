import { mkdir, mkdtemp, cp, rm, writeFile, rename, readdir, lstat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import net from 'node:net';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { loadConfig, canonicalPath } from '../server/config.js';

const run = promisify(execFile);
const inside = (parent, child) => { const relative = path.relative(parent, child); return !relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)); };
async function rejectSymlinks(directory) {
  const item = await lstat(directory);
  if (item.isSymbolicLink()) throw new Error('Backup source contains a symlink; review it before copying');
  if (item.isDirectory()) for (const entry of await readdir(directory)) await rejectSymlinks(path.join(directory, entry));
}
async function listenerAvailable(config) {
  return new Promise(resolve => {
    const socket = net.connect({ host: config.host, port: config.port });
    socket.setTimeout(2000);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(true); });
    socket.once('error', error => resolve(error.code !== 'ECONNREFUSED'));
  });
}

// Offline by design: stop ALL writers first, and keep them stopped until this
// returns. It never stops services, deletes evidence, migrates or sends reports.
export async function createBackup({ config, backupDir, legacyUploadsDir, offline = false }) {
  if (!offline) throw new Error('Stop all application writers and supply --offline');
  if (!backupDir || !path.isAbsolute(backupDir)) throw new Error('BACKUP_DIR must be absolute');
  if (await listenerAvailable(config)) throw new Error('Application listener is still reachable; stop it before backup');
  const destination = canonicalPath(backupDir);
  const legacy = legacyUploadsDir ? canonicalPath(legacyUploadsDir) : null;
  for (const source of [config.dataDir, fileURLToPath(new URL('../', import.meta.url)), ...(legacy ? [legacy] : [])]) {
    if (inside(source, destination)) throw new Error('BACKUP_DIR must be outside source and application directories');
  }
  await mkdir(destination, { recursive: true, mode: 0o700 });
  const staging = await mkdtemp(path.join(destination, '.scinteg-backup-'));
  const name = `scinteg-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.tar.gz`;
  const archive = path.join(destination, name);
  const partial = `${archive}.partial`;
  try {
    const dumpConfig = path.join(staging, 'mongo-config.yml');
    await writeFile(dumpConfig, `uri: ${JSON.stringify(config.mongoUri)}\n`, { mode: 0o600 });
    try {
      // Credentials are in a private temporary config, never command arguments/logs.
      await run('mongodump', ['--config', dumpConfig, `--archive=${path.join(staging, 'database.archive.gz')}`, '--gzip'], { maxBuffer: 1_000_000, timeout: 3600_000 });
    } catch { throw new Error('Database backup failed; check tools, configuration and permissions'); }
    finally { await rm(dumpConfig, { force: true }); }
    const contents = ['database.archive.gz'];
    for (const area of ['reports', 'recovery', 'ops']) {
      const source = path.join(config.dataDir, area);
      try { await lstat(source); } catch (error) { if (error.code === 'ENOENT' && area !== 'reports') continue; throw error; }
      await rejectSymlinks(source);
      await cp(source, path.join(staging, area), { recursive: true, preserveTimestamps: true }); contents.push(area);
    }
    if (legacy) {
      await rejectSymlinks(legacy);
      await cp(legacy, path.join(staging, 'legacy-uploads'), { recursive: true, preserveTimestamps: true }); contents.push('legacy-uploads');
    }
    await writeFile(path.join(staging, 'manifest.json'), JSON.stringify({ format: 1, createdAt: new Date().toISOString(), node: process.versions.node, mode: config.mailMode, contents, restore: 'Restore only with workers stopped. Review pending/uncertain notifications before enabling delivery. No automatic expiry of evidence or legacy data.' }, null, 2), { mode: 0o600 });
    await run('tar', ['-czf', partial, '-C', staging, '.'], { maxBuffer: 1_000_000, timeout: 3600_000 });
    const hash = createHash('sha256'); for await (const chunk of createReadStream(partial)) hash.update(chunk);
    await rename(partial, archive);
    await writeFile(`${archive}.sha256`, `${hash.digest('hex')}  ${name}\n`, { mode: 0o600, flush: true });
    return archive;
  } finally { await rm(staging, { recursive: true, force: true }); await rm(partial, { force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.umask(0o077);
  try {
    if (process.argv.slice(2).some(arg => arg !== '--offline')) throw new Error('Unknown backup option');
    const archive = await createBackup({ config: loadConfig(), backupDir: process.env.BACKUP_DIR, legacyUploadsDir: process.env.LEGACY_UPLOADS_DIR, offline: process.argv.includes('--offline') });
    console.info(`Private backup complete: ${archive}. Verify checksum, copy to restricted off-VM storage, and test restoration before relying on it.`);
  } catch { console.error('Backup failed. Ensure all writers are stopped, --offline is supplied, BACKUP_DIR is external, and MongoDB tools/source permissions are correct. No report data was deleted.'); process.exitCode = 1; }
}
