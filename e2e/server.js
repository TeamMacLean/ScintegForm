import path from 'node:path';
import { temporaryMongo } from '../test/helpers.js';
import { loadConfig } from '../server/config.js';
import { connectDatabase } from '../server/database.js';
import { createApp } from '../server/app.js';
import { createWorker } from '../server/worker.js';
import { createMailer } from '../server/mail.js';
const mongo = await temporaryMongo();
const config = loadConfig({ ATTACHMENTS_ENABLED: process.env.ATTACHMENTS_ENABLED, DATA_DIR: path.join(mongo.dir, 'data'), MONGODB_URI: mongo.uri, PUBLIC_ORIGIN: 'http://127.0.0.1:4317', MIN_FREE_BYTES: '0', MAX_REQUESTS_PER_MINUTE: '1000' });
const db = await connectDatabase(config);
const app = await createApp({ config, db });
const mailer = createMailer(config);
const worker = createWorker({ config, db, mailer });
const server = app.listen(4317, '127.0.0.1', () => { worker.start(); });
async function stop() {
  await new Promise(resolve => server.close(resolve));
  await worker.stop(); mailer.close(); await db.close(); await mongo.stop();
}
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
