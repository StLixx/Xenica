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

test('create, rename, relate and find a node', async ({ page }) => {
  const stamp = Date.now().toString(36);
  const a = `秦统一六国 ${stamp}`;
  const b = `郡县制 ${stamp}`;

  await signIn(page);

  // 新建两个节点：列表里出现，并自动在新标签页打开
  const input = page.getByLabel('新建节点');
  await input.fill(b);
  await input.press('Enter');
  await expect(page.getByLabel('标题')).toHaveValue(b);
  await page.getByRole('tab', { name: '全部节点' }).click();
  await input.fill(a);
  await input.press('Enter');
  await expect(page.getByLabel('标题')).toHaveValue(a);

  // 关联到另一个节点
  await page.getByLabel('关联到').selectOption({ label: b });
  await page.getByRole('button', { name: '添加关系' }).click();
  await expect(page.getByRole('region', { name: '关系' })).toContainText(b);

  // 改标题：标签页标题跟着变，痕迹里多一条「修改」
  const title = page.getByLabel('标题');
  await title.fill(`${a}（改）`);
  await title.press('Enter');
  await expect(page.getByRole('tab', { name: `${a}（改）` })).toBeVisible();
  await expect(page.getByRole('region', { name: '痕迹' })).toContainText('你修改');

  // 命令面板打开图，图里能看到节点
  await page.keyboard.press('Control+k');
  await page.getByLabel('命令', { exact: true }).fill('图');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('graph')).toContainText(b);
});

test('demo seed is visible', async ({ page }) => {
  await signIn(page);
  await page.getByRole('tab', { name: '全部节点' }).click();
  await expect(page.getByText('秦统一六国', { exact: true }).first()).toBeVisible();
});
