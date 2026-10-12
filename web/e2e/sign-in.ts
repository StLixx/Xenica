import { expect, test, type Page } from '@playwright/test';

/** 私有部署只使用服务端签发的短期 test 会话；密码不进入 CI 或浏览器测试报告。 */
export async function signIn(page: Page) {
  const sealed = process.env.XENICA_E2E_SESSIONS;
  if (sealed) {
    const tokens = (JSON.parse(sealed) as Record<string, string[]>)[test.info().title];
    if (!tokens?.length || tokens.some((token) => !/^[a-f0-9]{64}$/.test(token)))
      throw new Error('当前场景缺少短期测试会话');
    const origin = new URL(process.env.XENICA_URL ?? 'http://localhost:8080');
    let authenticated = false;
    for (const token of tokens) {
      await page.context().addCookies([
        {
          name: 'xenica_session',
          value: token,
          domain: origin.hostname,
          path: '/',
          httpOnly: true,
          secure: origin.protocol === 'https:',
          sameSite: 'Lax',
        },
      ]);
      const session = await (await page.request.get('/api/auth/session')).json();
      if (session.user?.name === 'test') {
        authenticated = true;
        break;
      }
    }
    if (!authenticated) throw new Error('短期测试会话均已失效，必须重新签发');
    await page.goto('/');
  } else {
    await page.goto('/');
    await page.getByLabel('用户名').fill('demo');
    await page.getByLabel('密码').fill('demo');
    await page.getByRole('button', { name: '登录', exact: true }).click();
  }
  await expect(page.getByTestId('connection')).toContainText('已连接');
}
