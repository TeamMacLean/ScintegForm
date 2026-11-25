import { createWriteStream, createReadStream } from 'node:fs';
import { mkdir, rm, readFile, chmod, readdir, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { randomUUID, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import multer from 'multer';
import { fileTypeFromFile } from 'file-type';
import yauzl from 'yauzl';
import { logEvent } from './observability.js';

const run = promisify(execFile);
export const allowedTypes = Object.freeze({
  '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.txt': 'text/plain', '.csv': 'text/csv',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
});
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function prepareStorage(config) {
  for (const dir of [config.dataDir, path.join(config.dataDir, 'quarantine'), path.join(config.dataDir, 'reports')]) {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await chmod(dir, 0o700);
  }
}

export function uploadMiddleware(config) {
  const storage = {
    _handleFile(req, file, callback) {
      const filename = randomUUID();
      const target = path.join(req.uploadDir, filename);
      let size = 0;
      const count = new Transform({ transform(chunk, encoding, done) {
        size += chunk.length;
        req.uploadBytes += chunk.length;
        if (req.uploadBytes > config.maxTotalBytes) return done(new HttpError(413, 'The combined file size exceeds the upload limit.'));
        done(null, chunk);
      } });
      pipeline(file.stream, count, createWriteStream(target, { flags: 'wx', mode: 0o600, flush: true }), { signal: req.uploadAbort.signal })
        .then(() => callback(null, { path: target, filename, size }), callback);
    },
    _removeFile(req, file, callback) { rm(file.path, { force: true }).then(() => callback(null), callback); },
  };
  return multer({
    storage, defParamCharset: 'utf8',
    limits: { fileSize: config.maxFileBytes, files: config.maxFiles, fields: 1, parts: config.maxFiles + 1, fieldSize: 80_000, fieldNameSize: 100 },
    fileFilter(req, file, done) {
      if (!file.originalname || file.originalname.length > 200 || /[\p{C}<>:"/\\]/u.test(file.originalname)) {
        return done(new HttpError(400, 'A filename contains unsupported characters or is too long.'));
      }
      if (!allowedTypes[path.extname(file.originalname).toLowerCase()]) return done(new HttpError(415, 'This file type is not supported.'));
      done(null, true);
    },
  }).array('files', config.maxFiles);
}

export async function scanFile(filePath, config) {
  if (config.scanMode === 'disabled') return;
  try {
    // Do not invoke a shell. Uploaded names never form command arguments.
    const database = config.scanDatabase ? [`--database=${config.scanDatabase}`] : [];
    // This is a disposable, read-only scanner. A process ignoring SIGTERM must
    // not hold an upload slot indefinitely after its time/output limit is hit.
    await run(config.scanCommand, [...database, '--recursive', '--no-summary', '--infected', '--alert-encrypted=yes', '--alert-exceeds-max=yes', '--max-scansize=60M', '--max-recursion=10', '--max-files=1000', '--', filePath], { timeout: 60_000, maxBuffer: 64_000, killSignal: 'SIGKILL' });
  } catch (error) {
    if (error.code === 1) throw new HttpError(422, 'A file failed the safety scan. Remove it and try again.');
    throw new HttpError(503, 'File safety scanning is temporarily unavailable. Please try again later.');
  }
}

async function validateOfficeContainer(filePath, extension) {
  return new Promise((resolve, reject) => {
    const mainPart = { '.docx': 'word/document.xml', '.xlsx': 'xl/workbook.xml', '.pptx': 'ppt/presentation.xml' }[extension];
    const invalid = () => new HttpError(415, 'Office files must include their main document, be unencrypted, contain no macros or embedded objects, and expand to at most 50 MB.');
    yauzl.open(filePath, { lazyEntries: true, autoClose: true, strictFileNames: true }, (error, zip) => {
      if (error) return reject(invalid());
      let count = 0;
      let expanded = 0;
      let contentTypes = false;
      let documentPart = false;
      let ended = false;
      const fail = () => { if (!ended) { ended = true; zip.close(); reject(invalid()); } };
      zip.on('error', fail);
      zip.on('entry', entry => {
        expanded += entry.uncompressedSize;
        contentTypes ||= entry.fileName === '[Content_Types].xml' && entry.uncompressedSize > 0;
        documentPart ||= entry.fileName === mainPart && entry.uncompressedSize > 0;
        if (++count > 1000 || expanded > 50_000_000 || entry.generalPurposeBitFlag & 1 ||
          /(?:vbaProject|vbaData|\/activeX\/|\/embeddings\/)/i.test(entry.fileName) ||
          ![0, 8].includes(entry.compressionMethod)) return fail();
        zip.readEntry();
      });
      zip.on('end', () => {
        if (ended) return;
        ended = true;
        if (contentTypes && documentPart) resolve(); else reject(invalid());
      });
      zip.readEntry();
    });
  });
}

export async function validateFiles(files, config, scanner = scanFile) {
  const result = [];
  for (const file of files) {
    if (!file.size) throw new HttpError(400, 'Empty files cannot be submitted.');
    const extension = path.extname(file.originalname).toLowerCase();
    const expected = allowedTypes[extension];
    if (extension === '.txt' || extension === '.csv') {
      try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(await readFile(file.path));
        if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text)) throw new Error('binary');
      } catch {
        throw new HttpError(415, 'Text and CSV files must contain UTF-8 text.');
      }
    } else {
      if (['.docx', '.xlsx', '.pptx'].includes(extension)) await validateOfficeContainer(file.path, extension);
      let detected;
      try { detected = await fileTypeFromFile(file.path); } catch { /* malformed files are rejected */ }
      if (detected?.mime !== expected) throw new HttpError(415, 'A file’s contents do not match its extension.');
    }
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file.path)) hash.update(chunk);
    result.push({ name: file.originalname, size: file.size, mimetype: expected, storageName: file.filename, sha256: hash.digest('hex') });
  }
  // One bounded scanner invocation per submission avoids loading the signature
  // database once for every attachment. The directory contains only this request.
  if (files.length) await scanner(path.dirname(files[0].path), config);
  return result;
}

export async function cleanupAbandoned(config, db, now = Date.now(), logger = console) {
  // Only day-old upload directories left in quarantine by a crash are deleted.
  const quarantine = path.join(config.dataDir, 'quarantine');
  for (const entry of await readdir(quarantine, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[a-f0-9-]{36}$/.test(entry.name)) continue;
    const target = path.join(quarantine, entry.name);
    if (now - (await stat(target)).mtimeMs < 86400_000) continue;
    await rm(target, { recursive: true, force: true });
  }
  // Report directories are never deleted automatically. One the database does not know
  // about may be a failed save, but it may also be real evidence seen through a wrong
  // MONGODB_URI or an older backup, so it is only reported for an operator to check.
  const reports = path.join(config.dataDir, 'reports');
  const orphans = [];
  for (const entry of await readdir(reports, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[a-f0-9]{24}$/.test(entry.name)) continue;
    if (now - (await stat(path.join(reports, entry.name))).mtimeMs < 86400_000) continue;
    if (!await db.exists(entry.name)) orphans.push(entry.name);
  }
  if (orphans.length) logEvent(logger, 'warn', 'storage_orphans_found', { count: orphans.length, references: orphans });
  return orphans;
}
