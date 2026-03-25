module.exports = {
  apps: [
    {
      name: 'morechat',
      cwd: './apps/server',
      script: 'dist/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      exp_backoff_restart_delay: 1000,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}
