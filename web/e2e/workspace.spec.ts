import { signIn } from './sign-in';
import { expect, test } from '@playwright/test';

test('登录不公开凭据，目录简短，页面体验与画板保持同一工作区', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await expect(page.getByText('预览站示例账号：demo / demo')).toHaveCount(0);
  await signIn(page);
  await expect(page.getByTestId('connection')).toContainText('已连接');
  await page.goto('/sketch');
  await page.getByRole('button', { name: '画布管理', exact: true }).click();
  await expect(page.getByRole('button', { name: /用户只负责开始前范围定义/ })).toHaveCount(0);
  await expect(page.getByText('--x-font-doc', { exact: true })).not.toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('workspace-directory.png') });
  const board = page.url();
  await page.getByRole('button', { name: '体验页面', exact: true }).click();
  const experience = page.getByRole('region', { name: '页面体验' });
  await expect(experience).toBeVisible();
  await expect(experience.getByRole('navigation', { name: '侧栏', exact: true })).toBeVisible();
  await expect(experience.locator('iframe')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('workspace-page.png') });
  await experience.getByRole('button', { name: '返回画板', exact: true }).click();
  await expect(page.getByRole('region', { name: '页面体验' })).toHaveCount(0);
  expect(page.url()).toBe(board);
  await expect(page.locator('canvas.interactive')).toBeVisible();
});
