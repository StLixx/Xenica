import { describe, expect, it } from 'vitest';

import { ASIDE_URL, embedSource, pageURL } from './embed';

describe('卡片来源', () => {
  it('拒绝可执行协议和登录凭据，不把分享权限复制到草图中', () => {
    for (const value of [
      'javascript:alert(1)',
      'data:text/html,hi',
      'http://example.com',
      'https://user:pass@example.com',
      'https://example.com/?token=secret',
      'https://example.com/api/share/secret',
    ])
      expect(pageURL(value)).toBeNull();
    expect(pageURL('https://example.com/page?q=hello')).toBe('https://example.com/page?q=hello');
  });

  it('AI 编辑的来源不能把 React 卡片指向任意组件或源码', () => {
    const result = embedSource({
      customData: {
        xenicaEmbed: {
          schema: 1,
          kind: 'react',
          component: 'PeekAside',
          source: '/secret',
          url: 'javascript:alert(1)',
          revision: 'abc1234',
        },
      },
    });
    expect(result).toMatchObject({
      kind: 'react',
      url: ASIDE_URL,
      source: 'web/src/ui/PeekAside.tsx',
      revision: 'abc1234',
    });
    expect(embedSource({ link: 'javascript:alert(1)' })).toBeNull();
  });

  it('无扩展元数据的原生网页卡片仍可识别来源', () => {
    expect(embedSource({ link: 'https://example.com/' })).toMatchObject({
      kind: 'page',
      url: 'https://example.com/',
      title: 'example.com',
    });
  });
});
