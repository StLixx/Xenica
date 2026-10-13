import { signIn } from './sign-in';
import { expect, test } from '@playwright/test';

// 历史副本可能包含真实资料；公共测试报告不采集其正文、截图或网络轨迹。
test.use({ trace: 'off', screenshot: 'off' });

test('历史版本从兼容快照恢复，单次登录桥接、幂等启动与画板批注保留', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(300_000);
  await signIn(page);
  await expect(page.getByTestId('connection')).toContainText('已连接');
  const catalog = await (await page.request.get('/api/development/versions')).json();
  const versions = catalog.filter((v: { available: boolean }) => v.available);
  if (process.env.XENICA_REQUIRE_HISTORY === '1') expect(versions.length).toBeGreaterThanOrEqual(2);
  test.skip(versions.length < 2, '此隔离检查环境没有历史档案；真实部署必须另跑恢复检查');
  const version = versions[0];
  const first = await (
    await page.request.post(`/api/development/versions/${version.id}/start`)
  ).json();
  const again = await (
    await page.request.post(`/api/development/versions/${version.id}/start`)
  ).json();
  expect(again.id).toBe(first.id);
  expect(again.generation).toBe(first.generation);
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`/api/development/runtimes/${first.id}`)).json()).state,
      { timeout: 120_000 },
    )
    .toBe('running');
  const bridge = await (
    await page.request.post(`/api/development/runtimes/${first.id}/bridge`)
  ).json();
  const anonymous = await browser.newContext();
  const entered = await anonymous.request.get(bridge.url);
  expect(entered.ok()).toBeTruthy();
  expect((await anonymous.request.get(bridge.url)).status()).toBe(401);
  const origin = new URL(bridge.url).origin;
  expect(
    (await anonymous.request.get(origin, { headers: { 'Sec-Fetch-Dest': 'document' } })).status(),
  ).toBe(403);
  expect((await anonymous.request.post(`${origin}/api/auth/logout`)).status()).toBe(403);
  expect((await anonymous.request.get(`${origin}/api/development/versions`)).status()).toBe(403);
  const isolated = await (await anonymous.request.get(`${origin}/api/health`)).json();
  expect(isolated.commit).toBe(version.source);
  // 旧版本尚未提供摘要字段；不可变镜像身份由真实恢复部署器核验。
  if (isolated.artifact) expect(isolated.artifact).toBe(version.image.split('@')[1]);
  await anonymous.close();
  const outsider = await browser.newContext();
  expect((await outsider.request.get(`${origin}/api/nodes`)).status()).toBe(401);
  await outsider.close();
  const second = versions[1];
  const restored = await (
    await page.request.post(`/api/development/versions/${second.id}/start`)
  ).json();
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`/api/development/runtimes/${restored.id}`)).json()).state,
      { timeout: 120_000 },
    )
    .toBe('running');
  const secondBridge = await (
    await page.request.post(`/api/development/runtimes/${restored.id}/bridge`)
  ).json();
  const secondContext = await browser.newContext();
  expect((await secondContext.request.get(secondBridge.url)).ok()).toBeTruthy();
  const secondHealth = await (
    await secondContext.request.get(new URL('/api/health', secondBridge.url).href)
  ).json();
  expect(secondHealth.commit).toBe(second.source);
  await secondContext.close();
  await page.goto('/sketch');
  await page.getByRole('button', { name: '画布管理', exact: true }).click();
  await page.getByRole('button', { name: '新建草图', exact: true }).click();
  await expect(page).toHaveURL(/\/sketch\/[a-f0-9-]+$/);
  const sketch = page.url();
  await page.goto(sketch);
  await page.getByRole('button', { name: '画布管理', exact: true }).click();
  await page.getByText('历史版本', { exact: true }).click();
  await page.getByRole('button', { name: version.title, exact: true }).click();
  await page.getByRole('button', { name: '操作选中卡片', exact: true }).click();
  const frame = page.frameLocator(`iframe[title="历史体验 ${version.id}"]`);
  await expect(frame.getByTestId('connection')).toContainText('已连接', { timeout: 30_000 });
  await frame.getByTestId('connection').click();
  await frame.getByTestId('connection').press('Escape');
  await expect(page.locator('[data-embed-kind="runtime"]')).toHaveAttribute(
    'data-interactive',
    'false',
  );
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  const id = sketch.split('/sketch/')[1]?.split('/')[0];
  const before = await (await page.request.get(`/api/nodes/${id}`)).json();
  expect(JSON.stringify(before.body)).not.toContain('__bridge');
  expect(JSON.stringify(before.body)).not.toContain('ticket=');
  await page.reload();
  expect(page.url()).toBe(sketch);
  await expect(page.locator('[data-embed-kind="runtime"]')).toBeVisible();
  await expect(page.getByRole('button', { name: '画布管理', exact: true })).toBeVisible();
  const after = await (await page.request.get(`/api/nodes/${id}`)).json();
  expect(after.body.scene.elements).toEqual(before.body.scene.elements);
  await page.screenshot({
    path: info.outputPath('history-structure.png'),
    mask: [page.locator('iframe')],
  });
});
