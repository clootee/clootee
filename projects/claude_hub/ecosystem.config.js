// PM2 配置：启动 claude-hub 后端（运行编译产物 dist，运行期不需要 TypeScript / ts-node）
// 前置条件：dist 已构建。restart.sh / restart.bat 会先跑 backend/scripts/setup.js 保证这点；
// 手动 pm2 start 前请先执行  cd backend && npm run build
module.exports = {
  apps: [
    {
      name: 'claude-hub',
      cwd: __dirname + '/backend',
      script: 'dist/index.js',
      interpreter: 'node',
      env: { NODE_ENV: 'production', PORT: '8970' },
    },
  ],
};
