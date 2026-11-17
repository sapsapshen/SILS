const fs = require('fs');

const accountEnv = {};
try {
  for (const line of fs.readFileSync('/data/ms-cookbook/.data/account-db.env', 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match) accountEnv[match[1]] = match[2];
  }
} catch (error) {
  console.error('Could not read account database env:', error.message);
}

module.exports = {
  apps: [
    {
      name: 'ms-cookbook',
      cwd: '/data/ms-cookbook',
      script: 'run.sh',
      interpreter: 'bash',
      autorestart: true,
      max_restarts: 20,
      max_memory_restart: '1G',
      restart_delay: 3000,
      kill_timeout: 8000,
      merge_logs: true,
      time: true,
      out_file: '/data/ms-cookbook/logs/pm2-out.log',
      error_file: '/data/ms-cookbook/logs/pm2-err.log',
      env: {
        ...accountEnv,
        DATA_DIR: '/data/ms-cookbook/.data',
        PORT: '8899',
        ANALYTICS_RUNTIME_DIR: '/data/ms-cookbook/.data/analytics-runtime',
        SESSION_SECRET: 'b826134f0081c000355aa7280130148b1ae407bd034ef91a4538b206d1f9d82f',
        APP_BASE_URL: 'http://127.0.0.1:8899',
        ALLOWED_ORIGINS: 'http://ms-cookbook.sapsap.com,http://120.53.222.178:8899,http://127.0.0.1:8899,http://localhost:8899',
        PYTHONUNBUFFERED: '1'
      }
    }
  ]
};
