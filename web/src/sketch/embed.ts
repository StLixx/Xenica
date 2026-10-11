/** 卡片的来源随场景保存，Agent 无需猜测截图对应哪个组件。 */
export type EmbedSource = {
  schema: 1;
  kind: 'react' | 'page' | 'runtime';
  title: string;
  url: string;
  component?: 'PeekAside';
  source?: string;
  revision: string;
  version?: string;
};

export const ASIDE_URL = 'https://xenica.invalid/components/PeekAside';

export function pageURL(input: string): string | null {
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (/\/api\/share\//.test(url.pathname)) return null;
    if ([...url.searchParams.keys()].some((key) => /token|password|secret|api.?key/i.test(key)))
      return null;
    return url.href;
  } catch {
    return null;
  }
}

export function embedSource(element: {
  link?: string | null;
  customData?: Record<string, unknown> | null;
}): EmbedSource | null {
  const data = element.customData?.xenicaEmbed as Partial<EmbedSource> | undefined;
  if (
    data?.schema === 1 &&
    data.kind === 'runtime' &&
    typeof data.version === 'string' &&
    /^[a-zA-Z0-9][a-zA-Z0-9.-]{0,46}$/.test(data.version)
  )
    return {
      schema: 1,
      kind: 'runtime',
      version: data.version,
      title: data.title ?? data.version,
      url: `https://xenica.invalid/versions/${data.version}`,
      revision: data.revision ?? '未标记',
    };
  if (data?.schema === 1 && data.kind === 'react' && data.component === 'PeekAside')
    return {
      schema: 1,
      kind: 'react',
      title: '共享侧栏',
      url: ASIDE_URL,
      component: 'PeekAside',
      source: 'web/src/ui/PeekAside.tsx',
      revision: typeof data.revision === 'string' ? data.revision : '未标记',
    };
  const url = pageURL(element.link ?? '');
  return url
    ? {
        schema: 1,
        kind: 'page',
        title: typeof data?.title === 'string' ? data.title : new URL(url).hostname,
        url,
        revision: typeof data?.revision === 'string' ? data.revision : '未标记',
      }
    : null;
}
