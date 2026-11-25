import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';

export async function connectDatabase(config) {
  const connection = await mongoose.createConnection(config.mongoUri, {
    serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000, socketTimeoutMS: 15000,
    bufferCommands: false, writeConcern: { w: 'majority', j: true, wtimeoutMS: 5000 },
  }).asPromise();
  const schema = new mongoose.Schema({
    kind: { type: String, enum: ['report', 'help'], required: true },
    mode: { type: String, required: true },
    keyHash: { type: String, required: true },
    fingerprint: { type: String, required: true },
    description: { type: String, required: true, maxlength: 20000 },
    subject: { type: String, maxlength: 200 },
    files: [{ name: String, size: Number, mimetype: String, storageName: String, sha256: String, _id: false }],
    notification: {
      state: { type: String, enum: ['pending', 'sending', 'sent', 'failed'], default: 'pending' },
      attempts: { type: Number, default: 0 },
      nextAttemptAt: { type: Date, default: Date.now },
      leaseUntil: Date, leaseToken: String, sentAt: Date, lastError: String,
    },
  }, { timestamps: true, versionKey: false });
  schema.index({ mode: 1, kind: 1, keyHash: 1 }, { unique: true });
  schema.index({ mode: 1, 'notification.state': 1, 'notification.nextAttemptAt': 1 });
  const Record = connection.model('SubmissionV2', schema, 'submissions_v2');
  try { await Record.init(); } catch (error) { await connection.close(); throw error; }
  return {
    newId: () => new mongoose.Types.ObjectId().toString(),
    close: () => connection.close(),
    healthy: () => connection.readyState === 1,
    find: (kind, keyHash) => Record.findOne({ kind, keyHash, mode: config.mailMode }).lean(),
    exists: id => Record.exists({ _id: id }),
    save: input => Record.create({ ...input, mode: config.mailMode, notification: { state: 'pending', attempts: 0, nextAttemptAt: new Date() } }),
    async claim(now = new Date()) {
      // A crash on the last permitted attempt must become visible as a failure.
      await Record.updateMany({ mode: config.mailMode, 'notification.state': 'sending', 'notification.leaseUntil': { $lte: now }, 'notification.attempts': { $gte: config.maxMailAttempts } }, {
        $set: { 'notification.state': 'failed', 'notification.lastError': 'DELIVERY_UNCERTAIN' },
      });
      return Record.findOneAndUpdate({
        mode: config.mailMode, 'notification.attempts': { $lt: config.maxMailAttempts },
        $or: [
          { 'notification.state': 'pending', 'notification.nextAttemptAt': { $lte: now } },
          { 'notification.state': 'sending', 'notification.leaseUntil': { $lte: now } },
        ],
      }, {
        $set: { 'notification.state': 'sending', 'notification.leaseUntil': new Date(now.getTime() + 300_000), 'notification.leaseToken': randomUUID() },
        $inc: { 'notification.attempts': 1 },
      }, { new: true, sort: { createdAt: 1 } }).lean();
    },
    finish: (record, fields) => Record.updateOne({ _id: record._id, 'notification.leaseToken': record.notification.leaseToken }, {
      $set: Object.fromEntries(Object.entries(fields).map(([key, value]) => [`notification.${key}`, value])),
      $unset: { 'notification.leaseUntil': '', 'notification.leaseToken': '' },
    }),
    listNotifications: () => Record.find({ mode: config.mailMode, 'notification.state': { $ne: 'sent' } }, { _id: 1, kind: 1, createdAt: 1, notification: 1 }).lean(),
    retry: id => Record.updateOne({ _id: id, mode: config.mailMode, 'notification.state': 'failed' }, {
      $set: { 'notification.state': 'pending', 'notification.attempts': 0, 'notification.nextAttemptAt': new Date() },
    }),
  };
}
