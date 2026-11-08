module.exports = {
  apps: [
    {
      name: 'pos-server',
      script: './pos_server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      error_file: './logs/pm2_error.log',
      out_file: './logs/pm2_out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      min_uptime: '10s',
      max_restarts: 10
    }
  ]
};

