import { readFileSync, existsSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Load environment before spawning Node so NODE_EXTRA_CA_CERTS takes effect too.
const root = fileURLToPath(new URL('../', import.meta.url));
const tasks = { start: 'server/index.js', dev: 'server/index.js', notifications: 'scripts/notifications.js', monitor: 'scripts/healthcheck.js', 'test:scanner': 'scripts/check-scanner.js', 'test:delivery': 'scripts/test-delivery.js', 'test:mail:vpn': 'scripts/test-vpn-mail.js', 'config:check': 'scripts/config-check.js', backup: 'scripts/backup.js' };
try {
  const expected = readFileSync(path.join(root, '.nvmrc'), 'utf8').trim();
  if (process.versions.node !== expected) throw new Error(`Use Node ${expected}; current process uses ${process.versions.node}.`);
  const [task, ...args] = process.argv.slice(2);
  if (!tasks[task]) throw new Error('Unknown Scinteg command');
  const index = args.indexOf('--env-file');
  const selected = index >= 0 ? args.splice(index, 2)[1] : process.env.SCINTEG_ENV_FILE;
  if (index >= 0 && (!selected || selected.startsWith('--'))) throw new Error('--env-file requires a path');
  const source = selected || (existsSync(path.join(root, '.env')) ? path.join(root, '.env') : null);
  if (!source && !['start', 'dev'].includes(task)) throw new Error('Select configuration with --env-file /etc/scinteg.env or SCINTEG_ENV_FILE (a local .env is also supported).');
  let configured = {};
  if (source) { try { configured = parseEnv(readFileSync(source, 'utf8')); } catch { throw new Error('Cannot read the selected environment file'); } }
  const child = spawn(process.execPath, [...(task === 'dev' ? ['--watch'] : []), tasks[task], ...args], {
    cwd: root, env: { ...configured, ...process.env, SCINTEG_CONFIG_SELECTED: source ? 'file' : 'development-defaults' }, stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
  });
  child.on('message', message => { if (message === 'ready') process.send?.('ready'); });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  child.on('error', () => { console.error('Could not start Scinteg command'); process.exitCode = 1; });
  child.on('exit', (code, signal) => { process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1); });
} catch (error) { console.error(error.message); process.exitCode = 1; }
