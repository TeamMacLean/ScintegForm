import { loadConfig } from '../server/config.js';
import { getCACertificates } from 'node:tls';
try {
  const config = loadConfig();
  console.info(JSON.stringify({ node: process.versions.node, mode: config.mailMode, origin: config.origin,
    dataDir: config.dataDir, recipients: config.recipients, webmaster: config.webmaster, reportBccWebmaster: config.reportBccWebmaster,
    scanMode: config.scanMode, maxConcurrentUploads: config.maxConcurrentUploads, maxMailAttempts: config.maxMailAttempts,
    notificationOverdueMinutes: config.notificationOverdueMs / 60000, smtpRequireTLS: config.smtpRequireTLS,
    extraCAConfigured: Boolean(process.env.NODE_EXTRA_CA_CERTS),
    extraCACertificatesLoaded: getCACertificates('extra').length,
  }, null, 2));
} catch { console.error('Invalid configuration. Check the selected environment file; no secrets were printed.'); process.exitCode = 1; }
