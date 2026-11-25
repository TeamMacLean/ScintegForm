import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';
import yazl from 'yazl';
import { simpleParser } from 'mailparser';
import { temporaryMongo, officeFile } from './helpers.js';
import { loadConfig } from '../server/config.js';
import { connectDatabase } from '../server/database.js';
import { createApp } from '../server/app.js';
import { createMailer } from '../server/mail.js';
import { createWorker } from '../server/worker.js';

async function metadataOnlyOffice(includeMetadata) {
  const zip = new yazl.ZipFile();
  if (includeMetadata) zip.addBuffer(Buffer.from('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'), '[Content_Types].xml');
  zip.end();
  const chunks = [];
  for await (const chunk of zip.outputStream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

test('independent audit regression checks use isolated MongoDB and synthetic files', async t => {
  const mongo = await temporaryMongo();
  const config = loadConfig({ DATA_DIR: path.join(mongo.dir, 'data'), MONGODB_URI: mongo.uri, MIN_FREE_BYTES: '0', MAX_CONCURRENT_UPLOADS: '4' });
  let db = await connectDatabase(config);
  const mailer = createMailer(config);
  t.after(async () => { mailer.close(); await db.close(); await mongo.stop(); });
  const submit = (app, key = randomUUID()) => request(app).post('/api/form/new').set('Idempotency-Key', key)
    .field('description', 'Synthetic audit regression').attach('files', Buffer.from('Retain these original bytes'), 'evidence.txt');
  const quiet = { error() {} };
  const delivered = async id => {
    await createWorker({ config, db, mailer }).tick();
    const mail = await simpleParser(await readFile(path.join(config.captureDir, `${id}.eml`)));
    assert.equal(mail.attachments[0].content.toString(), 'Retain these original bytes');
  };

  await t.test('a real duplicate-key race removes only the losing upload, preserving the winner', async () => {
    let finds = 0;
    let duplicates = 0;
    let release;
    const bothLooked = new Promise(resolve => { release = resolve; });
    const racing = {
      ...db,
      async find(...args) {
        const call = ++finds;
        const result = await db.find(...args);
        if (call <= 2) {
          assert.equal(result, null);
          if (call === 2) release();
          await bothLooked;
        }
        return result;
      },
      async save(input) {
        try { return await db.save(input); }
        catch (error) { if (error.code === 11000) duplicates++; throw error; }
      },
    };
    const app = await createApp({ config, db: racing, logger: quiet });
    const before = await readdir(path.join(config.dataDir, 'reports'));
    const key = randomUUID();
    const responses = await Promise.all([submit(app, key), submit(app, key)]);
    assert.equal(duplicates, 1);
    for (const response of responses) assert.equal(response.status, 202);
    assert.equal(responses[0].body.formId, responses[1].body.formId);
    assert.equal((await readdir(path.join(config.dataDir, 'reports'))).length, before.length + 1);
    await delivered(responses[0].body.formId);
  });

  await t.test('empty and metadata-only ZIPs are rejected as Office documents', async () => {
    const app = await createApp({ config, db, logger: quiet });
    for (const includeMetadata of [false, true]) {
      const response = await request(app).post('/api/form/new').set('Idempotency-Key', randomUUID())
        .field('description', 'Invalid Office structure').attach('files', await metadataOnlyOffice(includeMetadata), 'evidence.docx');
      assert.equal(response.status, 415);
    }
    assert.deepEqual(await readdir(path.join(config.dataDir, 'quarantine')), []);
  });

  await t.test('each supported Office format retains its matching main document and original bytes', async () => {
    const app = await createApp({ config, db, logger: quiet });
    for (const kind of ['docx', 'xlsx', 'pptx']) {
      const bytes = await officeFile({}, kind);
      const response = await request(app).post('/api/form/new').set('Idempotency-Key', randomUUID())
        .field('description', 'Office structure regression').attach('files', bytes, `evidence.${kind}`);
      assert.equal(response.status, 202);
      await createWorker({ config, db, mailer }).tick();
      const mail = await simpleParser(await readFile(path.join(config.captureDir, `${response.body.formId}.eml`)));
      assert.deepEqual(mail.attachments[0].content, bytes);
    }
  });

  await t.test('occupied upload slots reject excess requests and are reusable afterwards', async () => {
    let release;
    let entered;
    const held = new Promise(resolve => { release = resolve; });
    const scanning = new Promise(resolve => { entered = resolve; });
    const app = await createApp({ config: { ...config, maxConcurrentUploads: 1 }, db, logger: quiet,
      scanner: async () => { entered(); await held; },
    });
    const pending = submit(app).then(response => response);
    try {
      await scanning;
      assert.equal((await submit(app)).status, 503);
    } finally { release(); }
    const first = await pending;
    assert.equal(first.status, 202);
    await delivered(first.body.formId);
    const next = await submit(app);
    assert.equal(next.status, 202);
    await delivered(next.body.formId);
    assert.deepEqual(await readdir(path.join(config.dataDir, 'quarantine')), []);
  });

  await t.test('database disconnection at save retains uncertain files and permits retry after recovery', async () => {
    const original = db;
    const interrupted = await createApp({ config, logger: quiet, db: { ...original,
      async save(input) { await original.close(); return original.save(input); },
    } });
    const before = new Set(await readdir(path.join(config.dataDir, 'reports')));
    const key = randomUUID();
    assert.equal((await submit(interrupted, key)).status, 500);
    const orphan = (await readdir(path.join(config.dataDir, 'reports'))).find(id => !before.has(id));
    assert.ok(orphan);
    const retained = await readdir(path.join(config.dataDir, 'reports', orphan));
    assert.equal((await readFile(path.join(config.dataDir, 'reports', orphan, retained[0]))).toString(), 'Retain these original bytes');
    db = await connectDatabase(config);
    const recovered = await createApp({ config, db, logger: quiet });
    const response = await submit(recovered, key);
    assert.equal(response.status, 202);
    await delivered(response.body.formId);
    assert.deepEqual(await readdir(path.join(config.dataDir, 'quarantine')), []);
  });
});
