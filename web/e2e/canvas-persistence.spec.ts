import { expect, test, type Page } from '@playwright/test';

import { signIn } from './sign-in';

async function newBoard(page: Page) {
  await signIn(page);
  await page.goto('/sketch');
  await page.getByRole('button', { name: '画布管理', exact: true }).click();
  const initial = page.url();
  await page.getByRole('button', { name: '新建草图', exact: true }).click();
  await expect.poll(() => page.url()).not.toBe(initial);
  await expect(page.getByRole('button', { name: '画布管理', exact: true })).toBeVisible();
  return page.url().split('/sketch/')[1]?.split('/')[0] as string;
}

async function typeText(page: Page, text: string, y = 0.55) {
  const stage = page.locator('.excalidraw').first();
  const box = await stage.boundingBox();
  if (!box) throw new Error('画布没有尺寸');
  await page
    .locator('label')
    .filter({ has: page.getByRole('radio', { name: '文字', exact: true }) })
    .click();
  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * y);
  await page.locator('textarea.excalidraw-wysiwyg').fill(text);
  await page.keyboard.press('Escape');
}

test('直接输入的画布文字保存后刷新仍可搜索', async ({ page }) => {
  await signIn(page);
  await page.goto('/sketch');
  await page.getByRole('button', { name: '画布管理', exact: true }).click();
  const initial = page.url();
  await page.getByRole('button', { name: '新建草图', exact: true }).click();
  await expect.poll(() => page.url()).not.toBe(initial);
  const id = page.url().split('/sketch/')[1]?.split('/')[0];
  const stage = page.locator('.excalidraw').first();
  await expect(stage).toBeVisible();
  const box = await stage.boundingBox();
  if (!box) throw new Error('画布没有尺寸');
  const marker = `CANVAS_TEXT_${Date.now()}`;
  await page
    .locator('label')
    .filter({ has: page.getByRole('radio', { name: '文字', exact: true }) })
    .click();
  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.55);
  await page.locator('textarea.excalidraw-wysiwyg').fill(marker);
  await page.keyboard.press('Escape');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible({ timeout: 20_000 });
  const stored = await (await page.request.get(`/api/nodes/${id}`)).json();
  expect(stored.body.scene.elements.some((el: { text?: string }) => el.text === marker)).toBe(true);
  await page.reload();
  await expect(stage).toBeVisible();
  await stage.click({ position: { x: 400, y: 200 } });
  await page.keyboard.press('Control+f');
  await page.locator('.excalidraw').getByRole('textbox').fill(marker);
  await expect(page.getByText(/1 \/ 1/)).toBeVisible();
});

test('保存请求尚未完成时刷新不丢失画布文字', async ({ page }) => {
  // 公网刷新包含重新鉴权与大画布包加载，保存断言从画布就绪后开始计时。
  test.setTimeout(90_000);
  await signIn(page);
  await page.goto('/sketch');
  await page.getByRole('button', { name: '画布管理', exact: true }).click();
  const initial = page.url();
  await page.getByRole('button', { name: '新建草图', exact: true }).click();
  await expect.poll(() => page.url()).not.toBe(initial);
  const id = page.url().split('/sketch/')[1]?.split('/')[0];
  await page.route(`**/api/nodes/${id}`, async (route) => {
    if (route.request().method() === 'PATCH') await route.abort();
    else await route.continue();
  });
  const stage = page.locator('.excalidraw').first();
  await expect(stage).toBeVisible();
  const box = await stage.boundingBox();
  if (!box) throw new Error('画布没有尺寸');
  const marker = `UNSAVED_TEXT_${Date.now()}`;
  await page
    .locator('label')
    .filter({ has: page.getByRole('radio', { name: '文字', exact: true }) })
    .click();
  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.55);
  await page.locator('textarea.excalidraw-wysiwyg').fill(marker);
  await page.reload();
  await expect(stage).toBeVisible({ timeout: 60_000 });
  await page.unroute(`**/api/nodes/${id}`);
  await expect(page.getByText('已保存', { exact: true })).toBeVisible({ timeout: 20_000 });
  const stored = await (await page.request.get(`/api/nodes/${id}`)).json();
  expect(stored.body.scene.elements.some((el: { text?: string }) => el.text === marker)).toBe(true);
});

test('保存期间追加文字不会被旧请求清除恢复副本', async ({ page }) => {
  const id = await newBoard(page);
  let arrived!: () => void;
  let release!: () => void;
  const firstWrite = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  const responseGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let writes = 0;
  await page.route(`**/api/nodes/${id}`, async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    const response = await route.fetch();
    if (++writes === 1) {
      arrived();
      await responseGate;
    }
    await route.fulfill({ response });
  });
  await typeText(page, '第一段文字');
  await firstWrite;
  await typeText(page, '保存期间的第二段', 0.75);
  release();
  await expect
    .poll(async () => {
      const stored = await (await page.request.get(`/api/nodes/${id}`)).json();
      return stored.body.scene.elements
        .filter((el: { type: string }) => el.type === 'text')
        .map((el: { text: string }) => el.text);
    })
    .toEqual(['第一段文字', '保存期间的第二段']);
  await page.reload();
  await expect(page.getByText('画布有更新', { exact: true })).toHaveCount(0);
});

test('恢复草稿遇到服务器新版时保留双方且不覆盖', async ({ page }) => {
  const id = await newBoard(page);
  await page.route(`**/api/nodes/${id}`, (route) =>
    route.request().method() === 'PATCH' ? route.abort() : route.continue(),
  );
  await typeText(page, '本地待保存文字');
  const original = await (await page.request.get(`/api/nodes/${id}`)).json();
  const updated = await page.request.patch(`/api/nodes/${id}`, {
    headers: { 'If-Match': `"${original.updated_at}"` },
    data: { title: '来自其他窗口的新版本' },
  });
  expect(updated.ok()).toBeTruthy();
  await page.reload();
  await page.unroute(`**/api/nodes/${id}`);
  await expect(page.getByRole('alert')).toContainText('本次修改未覆盖新版');
  const remote = await (await page.request.get(`/api/nodes/${id}`)).json();
  expect(remote.title).toBe('来自其他窗口的新版本');
  expect(remote.body.scene.elements).toEqual([]);
  await page.getByRole('button', { name: '另存我的草稿', exact: true }).click();
  await expect(page.getByRole('button', { name: '草稿已另存', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '加载新版', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  const nodes = await (await page.request.get('/api/nodes?limit=1000')).json();
  expect(
    nodes.some(
      (node: { title: string; body: { scene?: { elements: { text?: string }[] } } }) =>
        node.title.endsWith('· 冲突草稿') &&
        node.body.scene?.elements.some((el) => el.text === '本地待保存文字'),
    ),
  ).toBe(true);
});

test('未上传原图的画布刷新后仍能恢复并完成上传', async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.deleteProperty(globalThis, 'showOpenFilePicker');
  });
  const id = await newBoard(page);
  await page.route('**/api/files', (route) =>
    route.request().method() === 'POST' ? route.abort() : route.continue(),
  );
  const chooser = page.waitForEvent('filechooser');
  await page
    .locator('label')
    .filter({ has: page.getByRole('radio', { name: '插入图像', exact: true }) })
    .click();
  await (
    await chooser
  ).setFiles({
    name: 'draft.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  const box = await page.locator('.excalidraw').first().boundingBox();
  if (!box) throw new Error('画布没有尺寸');
  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.55);
  await expect(page.getByText('保存失败，将自动重试', { exact: true })).toBeVisible();
  await page.unroute('**/api/files');
  await page.reload();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible({ timeout: 20_000 });
  const stored = await (await page.request.get(`/api/nodes/${id}`)).json();
  const image = stored.body.scene.elements.find((el: { type: string }) => el.type === 'image');
  expect(image).toBeTruthy();
  expect((await page.request.get(`/api/files/${image.fileId}`)).ok()).toBeTruthy();
});

test('不同标签页的待保存草稿互不覆盖', async ({ page, context }) => {
  const id = await newBoard(page);
  const address = page.url();
  await page.route(`**/api/nodes/${id}`, (route) =>
    route.request().method() === 'PATCH' ? route.abort() : route.continue(),
  );
  await typeText(page, '只属于第一个标签页');
  const other = await context.newPage();
  await other.goto(address);
  await expect(other.getByRole('button', { name: '画布管理', exact: true })).toBeVisible();
  await other.route(`**/api/nodes/${id}`, (route) =>
    route.request().method() === 'PATCH' ? route.abort() : route.continue(),
  );
  await typeText(other, '只属于第二个标签页');
  await page.reload();
  await page.unroute(`**/api/nodes/${id}`);
  await expect(page.getByText('已保存', { exact: true })).toBeVisible({ timeout: 20_000 });
  const stored = await (await page.request.get(`/api/nodes/${id}`)).json();
  expect(stored.body.scene.elements.map((el: { text?: string }) => el.text)).toEqual([
    '只属于第一个标签页',
  ]);
  await other.reload();
  await expect(other.getByRole('alert')).toContainText('本次修改未覆盖新版');
  await other.close();
});

test('无法保留草稿且尚未保存时刷新提示保护内容', async ({ page }) => {
  await page.addInitScript(() => {
    const prototype = (
      globalThis as unknown as {
        Storage: { prototype: { setItem: (key: string, value: string) => void } };
      }
    ).Storage.prototype;
    const original = prototype.setItem;
    prototype.setItem = function (key, value) {
      if (key.startsWith('xenica.sketch.draft.')) throw new Error('测试存储不可用');
      original.call(this, key, value);
    };
  });
  const id = await newBoard(page);
  await page.route(`**/api/nodes/${id}`, (route) =>
    route.request().method() === 'PATCH' ? route.abort() : route.continue(),
  );
  await typeText(page, '需要离开保护的文字');
  const dialog = page.waitForEvent('dialog');
  const reload = page.reload({ timeout: 3000 }).catch(() => null);
  const warning = await dialog;
  expect(warning.type()).toBe('beforeunload');
  await warning.dismiss();
  await reload;
  await page.unroute(`**/api/nodes/${id}`);
  await page.evaluate(() =>
    (globalThis as unknown as { dispatchEvent: (event: Event) => void }).dispatchEvent(
      new Event('online'),
    ),
  );
  await expect(page.getByText('已保存', { exact: true })).toBeVisible({ timeout: 20_000 });
  const stored = await (await page.request.get(`/api/nodes/${id}`)).json();
  expect(
    stored.body.scene.elements.some((el: { text?: string }) => el.text === '需要离开保护的文字'),
  ).toBe(true);
});

test('短暂保存失败后无需继续编辑也会自动重试', async ({ page }) => {
  const id = await newBoard(page);
  let writes = 0;
  await page.route(`**/api/nodes/${id}`, (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    if (++writes === 1) return route.abort();
    return route.continue();
  });
  await typeText(page, '自动重试保存的文字');
  await expect(page.getByText('保存失败，将自动重试', { exact: true })).toBeVisible();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible({ timeout: 15_000 });
  const stored = await (await page.request.get(`/api/nodes/${id}`)).json();
  expect(
    stored.body.scene.elements.some((el: { text?: string }) => el.text === '自动重试保存的文字'),
  ).toBe(true);
  expect(writes).toBe(2);
});
