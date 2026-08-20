// Playwright 配置：无头 chromium，针对本地已启动的 pm2 服务
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 180000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:8970',
    headless: true,
    actionTimeout: 15000,
    // 使用已缓存的 chromium 构建，避免重新下载浏览器
    launchOptions: {
      executablePath:
        process.env.LOCALAPPDATA +
        '\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
    },
  },
});
