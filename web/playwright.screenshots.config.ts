import { defineConfig } from '@playwright/test';

/**
 * 截图对比：给每个 story 截一张图，和 master 上的基准截图比。
 * 基准截图不进仓库：CI 在 master 上生成并存为构件，PR 下载来比（见 .github/workflows/ci.yml）。
 * 字体渲染因系统而异，所以只在 CI 的 Playwright 容器里跑才有意义；本地跑只用来自查。
 */
export default defineConfig({
  testDir: './screenshots',
  snapshotPathTemplate: '{testDir}/__baseline__/{arg}{ext}',
  outputDir: './screenshots/__results__',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list'], ['json', { outputFile: 'screenshots/__results__/report.json' }]],
  expect: { toHaveScreenshot: { animations: 'disabled', caret: 'hide', scale: 'css' } },
  use: {
    baseURL: 'http://127.0.0.1:6007',
    viewport: { width: 960, height: 640 },
    colorScheme: 'dark',
    locale: 'zh-CN',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  webServer: {
    command: 'node screenshots/serve.mjs storybook-static 6007',
    url: 'http://127.0.0.1:6007/index.json',
    reuseExistingServer: !process.env.CI,
  },
});
