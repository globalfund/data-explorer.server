module.exports = {
  apps: [
    {
      name: 'the-data-explorer-api',
      script: 'dist/index.js',
      instances: 'max',
      exec_mode: 'cluster',
      max_memory_restart: '2G',
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      autorestart: true,
      restart_delay: 100,
      out_file: '/home/zim/app-logs/the-data-explorer-api/out.log',
      error_file: '/home/zim/app-logs/the-data-explorer-api/error.log',
      watch: true,
      ignore_watch: [
        '.git',
        'logs',
        'public',
        '.circle',
        '.vscode',
        'README.md',
        'yarn.lock',
        '.gitignore',
        'node_modules',
        'package.json',
        'tsconfig.json',
      ],
    },
  ],
};
