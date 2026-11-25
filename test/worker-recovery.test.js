import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { temporaryMongo } from './helpers.js';
import { connectDatabase } from '../server/database.js';
import { loadConfig } from '../server/config.js';
import { createWorker } from '../server/worker.js';

test('recording an accepted delivery is retried without sending the email again', async t => {
  const mongo = await temporaryMongo();
  const config = loadConfig({ MONGODB_URI: mongo.uri, DATA_DIR: path.join(mongo.dir, 'data') });
  const db = await connectDatabase(config);
  t.after(async () => { await db.close(); await mongo.stop(); });
  await db.save({ _id: db.newId(), kind: 'report', keyHash: 'synthetic', fingerprint: 'synthetic', description: 'Synthetic', files: [] });
  let sends = 0, writes = 0;
  const worker = createWorker({ config, db: { ...db, finish: (record, fields) => ++writes <= 2 ? Promise.reject(new Error('Synthetic DB outage')) : db.finish(record, fields) }, mailer: { send: async () => { sends++; } }, logger: { error() {} } });
  await assert.rejects(worker.tick());
  await assert.rejects(worker.tick());
  await worker.tick();
  assert.equal(sends, 1);
  assert.deepEqual(await db.listNotifications(), []);
});

test('crash recovery routes an expired sending lease to operator review instead of resending', async t => {
  const mongo = await temporaryMongo();
  const config = loadConfig({ MONGODB_URI: mongo.uri, DATA_DIR: path.join(mongo.dir, 'data') });
  const db = await connectDatabase(config);
  t.after(async () => { await db.close(); await mongo.stop(); });
  await db.save({ _id: db.newId(), kind: 'report', keyHash: 'synthetic', fingerprint: 'synthetic', description: 'Synthetic', files: [] });
  const now = new Date(Date.now() + 1000);
  await db.claim(now);
  assert.equal(await db.claim(new Date(now.getTime() + 301000)), null);
  const [record] = await db.listNotifications();
  assert.equal(record.notification.state, 'failed');
  assert.equal(record.notification.lastError, 'DELIVERY_UNCERTAIN');
});
