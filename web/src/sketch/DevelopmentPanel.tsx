import { Button } from '@excalidraw/excalidraw';
import { designCatalog, useVersions } from '../api/development';

export function DevelopmentPanel({
  add,
  openPage,
}: {
  add: (kind: 'page' | 'react' | 'runtime', address?: string, title?: string) => Promise<void>;
  note: (text: string, id: string, source: string) => Promise<void>;
  openPage?: (address: string, title: string) => void;
}) {
  const versions = useVersions();
  const groups = new Map<string, typeof designCatalog.components>();
  for (const component of designCatalog.components) {
    const group = component.title.split(' / ')[0] ?? component.title;
    groups.set(group, [...(groups.get(group) ?? []), component]);
  }
  return (
    <div className="xenica-panel">
      <h2>开发画板</h2>
      {openPage ? (
        <Button onSelect={() => openPage(window.location.origin, '当前页面')}>体验页面</Button>
      ) : null}
      <h3>页面</h3>
      <Button onSelect={() => void add('page', window.location.origin, '当前 Xenica 页面')}>
        当前 Xenica 页面
      </Button>
      {designCatalog.features.map((f) => (
        <Button
          key={f.id}
          onSelect={() => void add('page', new URL(f.url, window.location.origin).href, f.title)}
        >
          {f.title}
        </Button>
      ))}
      <h3>组件</h3>
      <Button onSelect={() => void add('react')}>共享侧栏</Button>
      {[...groups].map(([group, components]) => (
        <details key={group}>
          <summary>{group.split('/').at(-1)}</summary>
          <div className="xenica-board-list">
            {components.map((c) => (
              <Button
                key={c.id}
                onSelect={() =>
                  void add('page', new URL(c.url, window.location.origin).href, c.title)
                }
              >
                {c.title.split(' / ').at(-1)}
              </Button>
            ))}
          </div>
        </details>
      ))}
      <details>
        <summary>历史版本</summary>
        <div className="xenica-board-list">
          {versions.isError ? <p role="alert">版本暂不可用</p> : null}
          {versions.data?.map((v) => (
            <div key={v.id}>
              <Button disabled={!v.available} onSelect={() => void add('runtime', v.id, v.title)}>
                {v.title}
              </Button>
              {!v.available ? <p>未归档，暂不可运行</p> : null}
            </div>
          ))}
        </div>
      </details>
      <details>
        <summary>设计变量</summary>
        {designCatalog.tokens.map((t, i) => (
          <p key={`${t.name}-${i}`}>
            <code>{t.name}</code> · {t.value}
          </p>
        ))}
      </details>
    </div>
  );
}
