import { Button } from '@excalidraw/excalidraw';
import { designCatalog, useVersions } from '../api/development';
import { useHealth } from '../api/queries';

export function DevelopmentPanel({
  add,
  note,
}: {
  add: (kind: 'page' | 'react' | 'runtime', address?: string, title?: string) => Promise<void>;
  note: (text: string, id: string, source: string) => Promise<void>;
}) {
  const versions = useVersions();
  const health = useHealth();
  return (
    <div className="xenica-panel">
      <h2>开发目录</h2>
      <p>
        当前体验 v{health.data?.version}。设计、原文和批注保存在这张画板，打开运行内容不会替换它们。
      </p>
      <h3>页面与功能</h3>
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
      <h3>确认要求</h3>
      <p>放入画板会新增整理，保留原始表达。</p>
      {designCatalog.decisions.map((d) => (
        <Button key={d.id} onSelect={() => void note(d.title, d.id, d.source)}>
          {d.title}
        </Button>
      ))}
      <h3>历史版本</h3>
      {versions.isError ? <p role="alert">版本目录暂时无法读取</p> : null}
      {versions.data?.length === 0 ? <p>尚未归档历史运行镜像与数据快照。</p> : null}
      {versions.data?.map((v) => (
        <div key={v.id}>
          <Button disabled={!v.available} onSelect={() => void add('runtime', v.id, v.title)}>
            {v.title}
          </Button>
          <p>
            {v.changes.join('；')}
            {v.available ? '' : ` · ${v.reason}`}
          </p>
        </div>
      ))}
      <p>最多同时运行两个历史版本，空闲十五分钟释放；批注和档案继续保留。</p>
      <h3>真实组件</h3>
      <Button onSelect={() => void add('react')}>共享侧栏</Button>
      {designCatalog.components.map((c) => (
        <Button
          key={c.id}
          onSelect={() => void add('page', new URL(c.url, window.location.origin).href, c.title)}
        >
          {c.title}
        </Button>
      ))}
      <h3>设计变量</h3>
      <p>来自当前实际主题与组件。</p>
      {designCatalog.tokens.map((t, i) => (
        <p key={`${t.name}-${i}`}>
          <code>{t.name}</code> · {t.value}
        </p>
      ))}
    </div>
  );
}
