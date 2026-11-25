const path = require('node:path');
const root = path.resolve(__dirname, '..');
const logDirectory = process.env.SCINTEG_LOG_DIR || path.join(root, 'var', 'logs');

module.exports = {
  apps: [{
    name: 'scinteg',
    cwd: root,
    script: 'scripts/run.js',
    args: ['start', '--env-file', process.env.SCINTEG_ENV_FILE || '/etc/scinteg.env'],
    interpreter: process.env.SCINTEG_NODE_BIN || process.execPath,
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 3000,
    wait_ready: true,
    listen_timeout: 15000,
    // Match the app's 200-second shutdown deadline so uploads can finish.
    kill_timeout: 210000,
    out_file: path.join(logDirectory, 'scinteg-out.log'),
    error_file: path.join(logDirectory, 'scinteg-error.log'),
    merge_logs: true,
    time: true,
    env: { NODE_ENV: 'production' },
  }],
};
