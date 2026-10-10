import { FileText, Plus } from 'lucide-react';
import { useState } from 'react';

import { AsideGroup, asideRow, Button, PeekAside, TextInput } from '../ui';
import type { EmbedSource } from './embed';

export function EmbedCard({
  source,
  active,
  id,
  exit,
}: {
  source: EmbedSource | null;
  active: boolean;
  id: string;
  exit: () => void;
}) {
  return (
    <section
      aria-label={`嵌入卡片：${source?.title ?? '无法加载'}`}
      data-embed-kind={source?.kind ?? 'invalid'}
      data-interactive={active}
      className="flex h-full w-full flex-col overflow-hidden rounded-md border border-line bg-bg"
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') exit();
      }}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-line bg-side px-2 py-1">
        <span className="min-w-0 flex-1 truncate text-label">{source?.title ?? '无法加载'}</span>
        {active ? <Button onClick={exit}>返回画布</Button> : null}
      </header>
      <div className="relative min-h-0 flex-1">
        {source?.kind === 'react' ? (
          <AsidePreview id={id} />
        ) : source ? (
          <iframe
            title={`嵌入网页：${source.title}`}
            src={source.url}
            loading="lazy"
            className="h-full w-full border-0"
            referrerPolicy="no-referrer"
            allow="fullscreen; picture-in-picture"
            sandbox={
              new URL(source.url).origin === window.location.origin
                ? 'allow-scripts allow-forms allow-same-origin allow-popups'
                : 'allow-scripts allow-forms allow-popups allow-presentation'
            }
          />
        ) : (
          <p className="p-3 text-body text-fg-2">无法加载此来源，请使用公开的 HTTPS 网页。</p>
        )}
      </div>
      <footer className="flex shrink-0 items-center gap-2 border-t border-line px-2 py-1 text-meta text-fg-3">
        <span className="min-w-0 flex-1 truncate" title={source?.source ?? source?.url}>
          {source?.kind === 'react'
            ? `真实组件 · ${source.revision.slice(0, 7)}`
            : source
              ? '未显示？可打开原页'
              : '无可用来源'}
        </span>
        {source?.kind === 'page' ? (
          <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-accent">
            打开原页
          </a>
        ) : null}
      </footer>
    </section>
  );
}

/** 与两站相同的真实组件；样例数据是组件的使用者，不能另写侧栏实现。 */
function AsidePreview({ id }: { id: string }) {
  const [pages, setPages] = useState(['设计批注', '验收记录']);
  const [picked, setPicked] = useState('设计批注');
  return (
    <div className="flex h-full">
      <PeekAside label="样例侧栏" title="Xenica" badge="X" storageKey={`xenica.embed.${id}.pinned`}>
        {(open) => (
          <>
            <button
              type="button"
              className={asideRow}
              title="样例新建页"
              onClick={() => setPages((current) => [...current, `新页 ${current.length - 1}`])}
            >
              <Plus size={16} className="flex-none" />
              {open && '新建页'}
            </button>
            <div className="mt-2 min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
              <AsideGroup title="页面" open={open}>
                {pages.map((name) => (
                  <button
                    type="button"
                    key={name}
                    className={asideRow}
                    title={name}
                    aria-selected={picked === name}
                    onClick={() => setPicked(name)}
                  >
                    <FileText size={16} className="flex-none" />
                    {open && <span className="truncate">{name}</span>}
                  </button>
                ))}
              </AsideGroup>
            </div>
          </>
        )}
      </PeekAside>
      <div className="min-w-0 flex-1 overflow-auto p-3">
        <p className="text-heading">{picked}</p>
        <p className="my-3 text-body text-fg-2">
          侧栏与主站、草图站共用一个组件。移到侧栏可展开，点击图钉可固定。
        </p>
        <TextInput aria-label="样例编辑" placeholder="在卡片中输入，验证交互" />
        {Array.from({ length: 12 }, (_, index) => (
          <p key={index} className="my-3 text-body text-fg-2">
            批注 {index + 1} · 滚动内容，画布应保持原位。
          </p>
        ))}
      </div>
    </div>
  );
}
