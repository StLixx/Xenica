import { defineConfig, devices } from '@playwright/test';

/**
 * 端到端冒烟测试，跑在真实的后端 + 数据库上。
 * 先启动服务（见 AGENTS.md「本地开发」），再 `pnpm e2e`。XENICA_URL 默认 http://localhost:8080。
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.XENICA_URL ?? 'http://localhost:8080',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    colorScheme: 'dark',
    locale: 'zh-CN',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: process.env.CHROMIUM_PATH
          ? { executablePath: process.env.CHROMIUM_PATH }
          : {},
      },
    },
  ],
});
