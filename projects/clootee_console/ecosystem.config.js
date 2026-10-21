// PM2：Clootee Console（console.clootee.com 后端）。配置从项目根目录 .env 读取。
module.exports = {
  apps: [
    {
      name: 'clootee-console',
      script: 'dist/index.js',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
      time: true,
    },
  ],
};
