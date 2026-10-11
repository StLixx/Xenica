import { expect, test } from '@playwright/test';

test('固定入口不随最近编辑改变，独立草图可返回唯一开发画板', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('用户名').fill('demo');
  await page.getByLabel('密码').fill('demo');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByTestId('connection')).toContainText('已连接');
  await page.goto('/sketch');
  await expect(page.getByRole('button', { name: '画布管理', exact: true })).toBeVisible();
  const fixed = page.url();
  await page.getByRole('button', { name: '画布管理', exact: true }).click();
  await page.getByRole('button', { name: '新建草图', exact: true }).click();
  await expect.poll(() => page.url()).not.toBe(fixed);
  await page.getByRole('button', { name: '画布管理', exact: true }).click();
  await page.getByRole('button', { name: '返回开发画板', exact: true }).click();
  await expect(page).toHaveURL(fixed);
  await page.goto('/sketch');
  await expect(page).toHaveURL(fixed);
  await page.reload();
  await expect(page).toHaveURL(fixed);
  const board = await (await page.request.post('/api/development-board')).json();
  expect(board.body.purpose).toBe('development');
  expect(new URL(fixed).pathname).toBe('/sketch');
  expect((await page.request.delete(`/api/nodes/${board.id}`)).status()).toBe(400);
});
