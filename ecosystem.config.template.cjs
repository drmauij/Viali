// Template for ecosystem.config.cjs
// Copy this to ecosystem.config.cjs and fill in your actual secrets
// NEVER commit ecosystem.config.cjs to git - it's in .gitignore

module.exports = {
  apps: [
    {
      name: 'viali-app',
      script: 'node',
      args: 'dist/index.js',
      cwd: '/home/ubuntu/viali',
      env: {
        NODE_ENV: 'production',
        PORT: '5000',
        DATABASE_URL: 'postgresql://username:password@host:port/database',
        SESSION_SECRET: 'your-session-secret-here',
        ENCRYPTION_SECRET: 'your-encryption-secret-here',
        OPENAI_API_KEY: 'your-openai-api-key',
        GOOGLE_CLIENT_ID: 'your-google-client-id',
        GOOGLE_CLIENT_SECRET: 'your-google-client-secret',
        RESEND_API_KEY: 'your-resend-api-key',
        RESEND_FROM_EMAIL: 'noreply@mail.viali.app',
        PRODUCTION_URL: 'https://your-domain.com',
        DB_SSL_REJECT_UNAUTHORIZED: 'false'
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      error_file: './logs/app-error.log',
      out_file: './logs/app-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    },
    {
      name: 'viali-worker',
      script: 'server/worker.ts',
      interpreter: 'node_modules/.bin/tsx',
      cwd: '/home/ubuntu/viali',
      env: {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://username:password@host:port/database',
        OPENAI_API_KEY: 'your-openai-api-key',
        DB_SSL_REJECT_UNAUTHORIZED: 'false'
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      error_file: './logs/worker-error.log',
      out_file: './logs/worker-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      min_uptime: '10s',
      max_restarts: 10
    }
  ]
};
