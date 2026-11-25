import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import request from 'supertest';
import { temporaryMongo } from './helpers.js';
import { loadConfig } from '../server/config.js';
import { connectDatabase } from '../server/database.js';
import { createApp } from '../server/app.js';

test('notification health uses four hours and keeps other mail modes out of the warning and operator list', async t => {
  const mongo = await temporaryMongo();
  const config = loadConfig({ DATA_DIR: path.join(mongo.dir, 'data'), MONGODB_URI: mongo.uri });
  const db = await connectDatabase(config);
  const other = await connectDatabase({ ...config, mailMode: 'test' });
  t.after(async () => { await other.close(); await db.close(); await mongo.stop(); });
  await other.save({ _id: other.newId(), kind: 'report', keyHash: 'synthetic', fingerprint: 'synthetic', description: 'Synthetic', files: [] });
  const claim = await other.claim(new Date(Date.now() + 1000));
  await other.finish(claim, { state: 'failed', lastError: 'SYNTHETIC' });
  assert.equal(await other.notificationsNeedAttention(new Date()), true);
  assert.equal(await db.notificationsNeedAttention(new Date()), false);
  assert.deepEqual(await db.attentionNotifications(new Date()), []);
  let cutoff;
  const app = await createApp({ config, db: { ...db, notificationsNeedAttention: date => { cutoff = date; return db.notificationsNeedAttention(date); } } });
  const response = await request(app).get('/health/notifications');
  assert.equal(response.status, 200); assert.deepEqual(response.body, { status: 'ok' });
  assert.ok(Math.abs(Date.now() - cutoff.getTime() - 4 * 3600_000) < 2000);
});
