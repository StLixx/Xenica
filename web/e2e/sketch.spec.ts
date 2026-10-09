import { expect, test, type Page } from '@playwright/test';

// 草图站点：CI 和预览站都用 XENICA_SEED=demo 启动（账号 demo / demo）。
async function signIn(page: Page) {
  await page.goto('/');
  await expect(page.getByText('预览站示例账号：demo / demo')).toBeVisible();
  await page.getByLabel('用户名').fill('demo');
  await page.getByLabel('密码').fill('demo');
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page.getByTestId('connection')).toContainText('已连接');
}

test('画一张草图，给 AI 的链接能读到画了什么', async ({ page, browser }) => {
  await signIn(page);
  const origin = new URL(page.url()).origin;

  // 独立入口：/sketch（域名入口见 ADR 0009，同一个前端）
  await page.goto('/sketch');
  await page.getByRole('button', { name: '新建' }).click();
  await expect(page).toHaveURL(/\/sketch\/[0-9a-f-]{36}/);
  const id = page.url().split('/sketch/')[1] as string;

  // 画布起来了：画一个框
  const stage = page.locator('.excalidraw').first();
  await expect(stage).toBeVisible({ timeout: 30_000 });
  const box = await stage.boundingBox();
  if (!box) throw new Error('画布没有尺寸');
  await stage.click({ position: { x: 60, y: 60 } });
  await page.keyboard.press('r');
  // 落在画布空白处：左边会弹出属性面板，顶上还有工具条，别拖到它们身上。
  const startX = box.x + box.width * 0.5;
  const startY = box.y + box.height * 0.55;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 160, startY + 100, { steps: 8 });
  await page.mouse.up();

  // 停手之后自己写库
  await expect(page.getByText('已保存')).toBeVisible({ timeout: 20_000 });

  // 开一条「能读」的链接
  await page.getByRole('button', { name: '分享给 AI' }).click();
  await page.getByRole('button', { name: '新建「能读」链接' }).click();
  await expect(page.getByText('只能读')).toBeVisible();

  const shares = (await (await page.request.get(`/api/nodes/${id}/shares`)).json()) as {
    token: string;
  }[];
  expect(shares.length).toBeGreaterThan(0);
  const token = shares[0]?.token as string;

  // 换一个没有 Cookie 的上下文：就当是别的 AI 打开这个链接
  const anon = await browser.newContext();
  const res = await anon.request.get(`${origin}/api/share/${token}`);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('text/markdown');
  const text = await res.text();
  expect(text).toContain('1 个框'); // 画了什么，读得到
  expect(text).toContain('画布原始数据');
  expect(text).toContain(`/api/share/${token}/scene.json`);
  // 只读链接拿不到管理接口
  expect((await anon.request.get(`${origin}/api/nodes/${id}/shares`)).status()).toBe(401);
  await anon.close();
});
