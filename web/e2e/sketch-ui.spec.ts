import { expect, test } from '@playwright/test';

test('画板只有 Excalidraw，画布菜单管理名字与网址切换', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByLabel('用户名').fill('demo');
  await page.getByLabel('密码').fill('demo');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByTestId('connection')).toContainText('已连接');
  await page.goto('/sketch');
  await expect(page.getByRole('navigation', { name: '草图', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '画布管理', exact: true }).click();
  const initial = page.url();
  await page.getByRole('button', { name: '新建草图', exact: true }).click();
  await expect.poll(() => page.url()).not.toBe(initial);
  await expect(page).toHaveURL(/\/sketch\/[0-9a-f-]{36}/);
  await page.getByRole('button', { name: '画布管理', exact: true }).click();
  await page.getByLabel('草图名字', { exact: true }).fill('画布管理验收');
  await page.getByRole('button', { name: '保存名称', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('名称已保存');
  await expect(page).toHaveTitle('画布管理验收 · Xenica 草图');
  await expect.poll(() => page.url()).toContain(encodeURIComponent('画布管理验收'));
  const first = page.url();
  await page.getByRole('button', { name: '新建草图', exact: true }).click();
  await expect.poll(() => page.url()).not.toBe(first);
  const second = page.url();
  await page.goBack();
  await expect(page).toHaveURL(first);
  await expect(page).toHaveTitle('画布管理验收 · Xenica 草图');
  await page.goForward();
  await expect(page).toHaveURL(second);
  await page.reload();
  await expect(page.getByRole('button', { name: '嵌入内容', exact: true })).toBeVisible();
  await expect(page.locator('.excalidraw')).toHaveCount(1);
  await expect(page.locator('#root > div > header')).toHaveCount(0);
  const appearance = (await page.evaluate(`(() => {
    const main = document.querySelector('.App-toolbar');
    const extra = document.querySelector('.xenica-tools');
    const original = document.querySelector('input[aria-label="矩形"] + .ToolIcon__icon');
    const button = extra.querySelector('button[aria-label="嵌入内容"] .ToolIcon__icon');
    const read = (element) => {
      const style = getComputedStyle(element);
      return { height: element.getBoundingClientRect().height, background: style.backgroundColor,
        radius: style.borderRadius, padding: style.padding, shadow: style.boxShadow };
    };
    return { main: read(main), extra: read(extra), original: read(original), button: read(button) };
  })()`)) as Record<
    'main' | 'extra' | 'original' | 'button',
    {
      height: number;
      background: string;
      radius: string;
      padding: string;
      shadow: string;
    }
  >;
  expect(appearance.extra.height).toBeCloseTo(appearance.main.height);
  for (const property of ['background', 'radius', 'padding', 'shadow'] as const)
    expect(appearance.extra[property]).toBe(appearance.main[property]);
  expect(appearance.button.height).toBeCloseTo(appearance.original.height);
  expect(appearance.button.background).toBe(appearance.original.background);
  expect(appearance.button.radius).toBe(appearance.original.radius);
  await page.locator('input[aria-label="矩形"] + .ToolIcon__icon').hover();
  const hoverBackground = await page.evaluate(
    'getComputedStyle(document.querySelector(\'input[aria-label="矩形"] + .ToolIcon__icon\')).backgroundColor',
  );
  await page.getByRole('button', { name: '嵌入内容', exact: true }).hover();
  expect(
    await page.evaluate(
      'getComputedStyle(document.querySelector(\'.xenica-tool[aria-label="嵌入内容"] .ToolIcon__icon\')).backgroundColor',
    ),
  ).toBe(hoverBackground);
  for (const name of ['分享给 AI', '嵌入内容', '设计上下文']) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.locator('.excalidraw .sidebar')).toHaveCount(1);
    await expect(page.locator('.excalidraw .sidebar')).toContainText(
      name === '分享给 AI' ? '给 AI 看' : name === '嵌入内容' ? '放入真实内容' : name,
    );
  }
  const selectedBackground = await page.evaluate(
    'getComputedStyle(document.querySelector(".ToolIcon_type_radio:checked + .ToolIcon__icon")).backgroundColor',
  );
  expect(
    await page.evaluate(
      'getComputedStyle(document.querySelector(\'.xenica-tool[aria-label="设计上下文"] .ToolIcon__icon\')).backgroundColor',
    ),
  ).toBe(selectedBackground);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('desktop-context.png') });
});

test('窄屏通过画布菜单访问扩展，原生面板可关闭且不横向溢出', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('用户名').fill('demo');
  await page.getByLabel('密码').fill('demo');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByTestId('connection')).toContainText('已连接');
  await page.goto('/sketch');
  await expect(page.locator('.excalidraw')).toBeVisible();
  for (const name of ['画布管理', '分享给 AI', '嵌入内容', '设计上下文']) {
    await page.locator('.main-menu-trigger').click();
    await page.locator('.dropdown-menu').getByRole('button', { name, exact: true }).click();
    await expect(page.locator('.sidebar')).toBeVisible();
    expect(await page.evaluate('document.documentElement.scrollWidth <= innerWidth')).toBe(true);
    if (name === '设计上下文')
      await page.screenshot({ path: testInfo.outputPath('mobile-context.png') });
    await page.locator('.sidebar').getByRole('button', { name: '关闭', exact: true }).click();
    await expect(page.locator('.sidebar')).toHaveCount(0);
  }
});
