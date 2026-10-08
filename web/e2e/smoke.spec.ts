import { expect, test, type Page } from '@playwright/test';

// CI 和预览站都用 XENICA_SEED=demo 启动：有示例数据（crates/server/fixtures/demo.json）和示例账号 demo / demo。
async function signIn(page: Page) {
  await page.goto('/');
  await expect(page.getByText('预览站示例账号：demo / demo')).toBeVisible();
  await page.getByLabel('用户名').fill('demo');
  await page.getByLabel('密码').fill('demo');
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page.getByTestId('connection')).toContainText('已连接');
}

test('api and app require login', async ({ page, request }) => {
  expect((await request.get('/api/nodes')).status()).toBe(401);
  expect((await request.get('/api/health')).status()).toBe(200);

  await page.goto('/');
  await page.getByLabel('用户名').fill('demo');
  await page.getByLabel('密码').fill('wrong');
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page.getByRole('alert')).toContainText('用户名或密码不对');

  await signIn(page);
  await page.reload();
  await expect(page.getByTestId('connection')).toContainText('已连接'); // 刷新后仍是登录状态

  await page.keyboard.press('Control+k');
  await page.getByLabel('命令', { exact: true }).fill('退出登录');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: '登录' })).toBeVisible();
});

test('write a page: blocks, tags, views', async ({ page }) => {
  const tag = `方法${Date.now().toString(36)}`;
  await signIn(page);

  // 新建页：光标直接在第一块里
  await page.keyboard.press('Control+k');
  await page.getByLabel('命令', { exact: true }).fill('新建页');
  await page.keyboard.press('Enter');
  const editor = page.getByRole('region', { name: '正文' });
  await expect(editor.getByLabel('块', { exact: true })).toBeFocused();

  // 回车分块；公式里回车只换行；#标记 连到同名节点
  await page.keyboard.type('第 5 讲 数列极限');
  await page.keyboard.press('Enter');
  await page.keyboard.type('$$');
  await page.keyboard.press('Enter');
  await page.keyboard.type('\\lim (1+1/n)^n = e');
  await page.keyboard.press('Enter');
  await page.keyboard.type(`$$ #${tag}`);
  await page.keyboard.press('Escape'); // 关掉提示
  await page.keyboard.press('Escape'); // 离开编辑，立刻保存
  await expect(editor.locator('[data-block-id]')).toHaveCount(2);
  await expect(editor.locator('.katex')).toBeVisible();
  await expect(page.getByText('保存中…')).toBeHidden();

  // 刷新后还在，标签页标题用第一块
  await page.reload();
  await expect(page.getByRole('tab', { name: '第 5 讲 数列极限' })).toBeVisible();

  // 点标记：打开那个节点，下面列出提到它的块，可以切成表格
  await editor.getByText(`#${tag}`).click();
  const mentioned = page.getByRole('region', { name: '提到它的' });
  await expect(mentioned.locator('.katex')).toBeVisible();
  await mentioned.getByRole('radio', { name: '表格' }).click();
  await expect(mentioned.getByRole('table')).toContainText('第 5 讲 数列极限');
});

test('demo page and graph', async ({ page }) => {
  await signIn(page);
  await page.getByRole('navigation', { name: '侧栏' }).hover();
  await page.getByRole('button', { name: '高数 · 不定积分（第 3 讲）' }).click();
  const editor = page.getByRole('region', { name: '正文' });
  await expect(editor.locator('.katex').first()).toBeVisible();
  await expect(editor.getByText('#必备').first()).toBeVisible();

  await page.keyboard.press('Control+k');
  await page.getByLabel('命令', { exact: true }).fill('图');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('graph')).toContainText('必备');
});
