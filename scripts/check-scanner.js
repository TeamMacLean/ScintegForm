import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { loadConfig } from '../server/config.js';
import { scanFile } from '../server/uploads.js';

// The EICAR string is the standard harmless antivirus test signature, not malware.
const dir = await mkdtemp(path.join(os.tmpdir(), 'scinteg-antivirus-check-'));
try {
  const config = loadConfig({ ...process.env, UPLOAD_SCAN_MODE: 'clamav' });
  await writeFile(path.join(dir, 'clean.txt'), 'Synthetic clean evidence\n', { mode: 0o600 });
  await scanFile(dir, config);
  await writeFile(path.join(dir, 'eicar.txt'), 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*', { mode: 0o600 });
  let blocked = false;
  try { await scanFile(dir, config); } catch (error) { if (error.status === 422) blocked = true; else throw error; }
  if (!blocked) throw new Error('The scanner did not block the harmless EICAR signature.');
  console.info('Scanner check passed: clean file accepted, harmless EICAR test signature blocked.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally { await rm(dir, { recursive: true, force: true }); }
