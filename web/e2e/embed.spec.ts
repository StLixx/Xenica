import { expect, test, type Page } from '@playwright/test';

import type { SceneElement } from '../src/sketch/scene';

async function openSketch(page: Page) {
  await page.goto('/');
  await page.getByLabel('用户名').fill('demo');
  await page.getByLabel('密码').fill('demo');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByTestId('connection')).toContainText('已连接');
  await page.goto('/sketch');
  await page.getByRole('button', { name: '新建', exact: false }).click();
  await expect(page).toHaveURL(/\/sketch\/[0-9a-f-]{36}/);
  await expect(page.getByRole('button', { name: '嵌入内容', exact: true })).toBeVisible({
    timeout: 30_000,
  });
  return page.url().split('/sketch/')[1] as string;
}

test('真实侧栏可交互，保存和分享保留组件身份，AI 可编辑卡片', async ({ page, browser }) => {
  const id = await openSketch(page);
  await page.getByRole('button', { name: '嵌入内容', exact: true }).click();
  await page.getByRole('button', { name: '共享侧栏组件', exact: true }).click();
  const card = page.getByRole('region', { name: '嵌入卡片：共享侧栏', exact: true });
  await expect(card).toBeVisible();
  await page.getByRole('button', { name: '操作选中卡片', exact: true }).click();
  await expect(card).toHaveAttribute('data-interactive', 'true');
  await card.getByLabel('样例编辑').fill('卡片内部编辑');
  await card.getByRole('navigation', { name: '样例侧栏', exact: true }).hover();
  await card.getByRole('button', { name: '固定样例侧栏', exact: true }).click();
  await expect(card.getByRole('button', { name: '取消固定样例侧栏', exact: true })).toBeVisible();
  await card.getByRole('button', { name: '返回画布', exact: true }).click();
  await expect(card).toHaveAttribute('data-interactive', 'false');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible({ timeout: 20_000 });
  const original = await (await page.request.get(`/api/nodes/${id}`)).json();
  const element = original.body.scene.elements.find(
    (el: { type: string }) => el.type === 'embeddable',
  );
  expect(element.customData.xenicaEmbed).toMatchObject({
    component: 'PeekAside',
    source: 'web/src/ui/PeekAside.tsx',
  });
  await page.reload();
  await expect(card).toBeVisible({ timeout: 30_000 });
  const restored = await (await page.request.get(`/api/nodes/${id}`)).json();
  expect(restored.body.scene.elements).toEqual(original.body.scene.elements);
  // 编排操作经过真实指针事件，而不只验证 API 改动。
  const beforeDrag = await card.boundingBox();
  if (!beforeDrag) throw new Error('卡片没有尺寸');
  await page.mouse.move(beforeDrag.x + beforeDrag.width / 2, beforeDrag.y + 12);
  await page.mouse.down();
  await page.mouse.move(beforeDrag.x + beforeDrag.width / 2 + 70, beforeDrag.y + 52, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`/api/nodes/${id}`)).json()).body.scene.elements[0].x,
    )
    .toBeGreaterThan(element.x + 50);
  const afterDrag = await card.boundingBox();
  if (!afterDrag) throw new Error('卡片没有尺寸');
  await page.mouse.move(afterDrag.x + afterDrag.width + 2, afterDrag.y + afterDrag.height + 2);
  await page.mouse.down();
  await page.mouse.move(afterDrag.x + afterDrag.width + 72, afterDrag.y + afterDrag.height + 42, {
    steps: 8,
  });
  await page.mouse.up();
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`/api/nodes/${id}`)).json()).body.scene.elements[0].width,
    )
    .toBeGreaterThan(element.width + 40);
  await page.getByRole('button', { name: '重置缩放', exact: true }).click();
  for (let step = 0; step < 10; step++)
    await page.getByRole('button', { name: '放大', exact: true }).click();
  await expect(page.getByText('200%', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '重置缩放', exact: true }).click();
  for (let step = 0; step < 5; step++)
    await page.getByRole('button', { name: '缩小', exact: true }).click();
  await expect(page.getByText('50%', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '重置缩放', exact: true }).click();
  await expect(page.getByText('100%', { exact: true })).toBeVisible();
  const share = await (
    await page.request.post(`/api/nodes/${id}/shares`, { data: { mode: 'write' } })
  ).json();
  const anon = await browser.newContext({ baseURL: new URL(page.url()).origin });
  const sceneResponse = await anon.request.get(`/api/share/${share.token}/scene.json`);
  expect(sceneResponse.ok()).toBeTruthy();
  const scene = await sceneResponse.json();
  expect(scene.elements[0].customData.xenicaEmbed.component).toBe('PeekAside');
  scene.elements[0].x += 80;
  scene.elements[0].width = 560;
  scene.elements[0].version += 1;
  const edit = await anon.request.put(`/api/share/${share.token}`, { data: { scene } });
  expect(edit.ok()).toBeTruthy();
  await page.reload();
  await expect(card).toBeVisible({ timeout: 30_000 });
  const changed = await (await page.request.get(`/api/nodes/${id}`)).json();
  expect(changed.body.scene.elements[0].width).toBe(560);
  await anon.close();
});

test('网页使用隔离 iframe，支持点击、内部滚动与退出，拒绝凭据地址', async ({ page }) => {
  await page.route('https://embed.example.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: '<button onclick="this.textContent=\'已点击\'">网页按钮</button><input aria-label="网页输入"><div style="height:2000px">滚动内容</div>',
    }),
  );
  await openSketch(page);
  await page.getByRole('button', { name: '嵌入内容', exact: true }).click();
  await page.getByLabel('嵌入网页地址').fill('https://embed.example.test/?token=private');
  await page.getByRole('button', { name: '添加网页', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('不含登录凭据');
  await page.getByLabel('嵌入网页地址').fill('https://embed.example.test/');
  await page.getByRole('button', { name: '添加网页', exact: true }).click();
  await page.getByRole('button', { name: '操作选中卡片', exact: true }).click();
  const frame = page.frameLocator('iframe[title="嵌入网页：embed.example.test"]');
  await frame.getByRole('button', { name: '网页按钮' }).click();
  await expect(frame.getByRole('button', { name: '已点击' })).toBeVisible();
  await frame.getByLabel('网页输入').fill('真实网页');
  await frame.getByRole('button', { name: '已点击' }).hover();
  await page.mouse.wheel(0, 300);
  await expect
    .poll(async () =>
      page
        .frames()
        .find((f) => f.url().startsWith('https://embed.example.test/'))
        ?.evaluate('window.scrollY'),
    )
    .toBeGreaterThan(0);
  await page.getByRole('button', { name: '返回画布', exact: true }).first().click();
  await expect(page.getByRole('region', { name: '嵌入卡片：embed.example.test' })).toHaveAttribute(
    'data-interactive',
    'false',
  );
  await expect(page.getByRole('link', { name: '打开原页' })).toHaveAttribute(
    'rel',
    'noopener noreferrer',
  );
});

test('混合卡片编排与多卡片验证', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await page.route('https://embed.example.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: '<meta charset="utf-8"><button>网页样例</button><video controls></video><p>可交互内容</p>',
    }),
  );
  const id = await openSketch(page);
  await page.getByRole('button', { name: '嵌入内容', exact: true }).click();
  await page.getByRole('button', { name: '共享侧栏组件', exact: true }).click();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible({ timeout: 20_000 });
  const original = await (await page.request.get(`/api/nodes/${id}`)).json();
  const template: SceneElement = original.body.scene.elements[0];
  const measurements = [];
  for (const count of [3, 20]) {
    const elements = Array.from({ length: count }, (_, index) => ({
      ...template,
      id: `embed-${count}-${index}`,
      x: (index % 4) * 520,
      y: Math.floor(index / 4) * 400,
      version: (template.version ?? 1) + 1,
      ...(index % 3 !== 0
        ? {
            link: `https://embed.example.test/${index}`,
            customData: {
              xenicaEmbed: {
                schema: 1,
                kind: 'page',
                title: `网页 ${index}`,
                url: `https://embed.example.test/${index}`,
                revision: 'test',
              },
            },
          }
        : {}),
    }));
    const update = await page.request.patch(`/api/nodes/${id}`, {
      data: { body: { scene: { ...original.body.scene, elements } } },
    });
    expect(update.ok()).toBeTruthy();
    const start = Date.now();
    await page.reload();
    await expect(page.getByRole('button', { name: '嵌入内容', exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await page.locator('.excalidraw').click({ position: { x: 350, y: 120 } });
    await page.keyboard.press('Shift+1');
    await expect(page.locator('[data-embed-kind]')).toHaveCount(count);
    const readyMs = Date.now() - start;
    for (const key of ['Equal', 'Minus', 'Minus', 'Equal']) await page.keyboard.press(key);
    const stage = await page.locator('.excalidraw').boundingBox();
    if (!stage) throw new Error('画布没有尺寸');
    await page.keyboard.down('Space');
    await page.mouse.move(stage.x + stage.width * 0.6, stage.y + stage.height * 0.7);
    await page.mouse.down();
    await page.mouse.move(stage.x + stage.width * 0.6 + 60, stage.y + stage.height * 0.7 + 60, {
      steps: 10,
    });
    await page.mouse.up();
    await page.keyboard.up('Space');
    await page.keyboard.press('Shift+1');
    await expect(page.locator('[data-embed-kind]')).toHaveCount(count);
    expect(browserErrors).toEqual([]);
    measurements.push({
      count,
      readyMs,
      note: '混合卡片全部呈现；缩放、平移后仍可见，无页面脚本错误。网页样例为隔离测试内容，不计外部网络延迟。',
    });
    await page.screenshot({ path: testInfo.outputPath(`mixed-${count}.png`) });
  }
  await testInfo.attach('卡片验证记录', {
    body: JSON.stringify(measurements, null, 2),
    contentType: 'application/json',
  });
  console.log('卡片验证记录', JSON.stringify(measurements));
});
