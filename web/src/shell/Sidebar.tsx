import { FilePlus2, FileText, Hash, Search } from 'lucide-react';
import { useMemo } from 'react';

import { useEdges, useNodes } from '../api/queries';
import { AsideGroup, asideRow, nodeLabel, PeekAside } from '../ui';
import type { AnyView } from './api';
import { useWorkbench } from './api';

const PIN_KEY = 'xenica.sidebar.pinned';

/**
 * 左侧栏（参考 Edge 的垂直标签页）：默认收成一条图标栏，鼠标移上去浮出展开、不挤正文，
 * 点图钉固定展开。收放的行为在 `ui/PeekAside` 里，草图站用的是同一个。
 */
export function Sidebar({
  views,
  onOpenPalette,
  onNewPage,
}: {
  views: AnyView[];
  onOpenPalette: () => void;
  onNewPage: () => void;
}) {
  const wb = useWorkbench();
  const nodes = useNodes();
  const edges = useEdges();

  const { pages, tags } = useMemo(() => {
    const contained = new Set<string>();
    const mentioned = new Set<string>();
    const hasChildren = new Set<string>();
    for (const e of edges.data ?? []) {
      if (e.kind === 'contains') {
        contained.add(e.target);
        hasChildren.add(e.source);
      } else if (e.kind === 'mentions') mentioned.add(e.target);
    }
    const list = nodes.data ?? [];
    const byId = new Map(list.map((n) => [n.id, n]));
    const first = new Map<string, (typeof list)[number]>();
    for (const e of edges.data ?? []) {
      const child = byId.get(e.target);
      const cur = first.get(e.source);
      if (e.kind === 'contains' && child && (!cur || child.created_at < cur.created_at))
        first.set(e.source, child);
    }
    const roots = list
      .filter((n) => !contained.has(n.id))
      .map((n) => ({ ...n, label: nodeLabel(n, first.get(n.id)) }));
    return {
      pages: roots.filter((n) => hasChildren.has(n.id) || !mentioned.has(n.id)),
      tags: roots.filter((n) => !hasChildren.has(n.id) && mentioned.has(n.id)),
    };
  }, [nodes.data, edges.data]);

  return (
    <PeekAside label="侧栏" title="Xenica" badge="X" storageKey={PIN_KEY}>
      {(open) => (
        <>
          <button
            type="button"
            className={asideRow}
            onClick={onOpenPalette}
            title="搜索或命令（Ctrl K）"
          >
            <Search size={16} className="flex-none" />
            {open && (
              <>
                搜索或命令<span className="ml-auto text-meta text-fg-3">Ctrl K</span>
              </>
            )}
          </button>
          <button type="button" className={asideRow} onClick={onNewPage} title="新建页">
            <FilePlus2 size={16} className="flex-none" />
            {open && '新建页'}
          </button>
          {views
            .filter((v) => v.sidebar)
            .map((v) => (
              <button
                key={v.id}
                type="button"
                className={asideRow}
                onClick={() => wb.openView(v.id)}
                title={v.title}
              >
                <v.icon size={16} className="flex-none" />
                {open && v.title}
              </button>
            ))}
          {open && (
            <div className="-mx-2 mt-2 min-h-0 flex-1 overflow-y-auto px-2">
              <AsideGroup title="页面">
                {pages.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className={asideRow}
                    onClick={() => wb.openView('node', { id: n.id })}
                  >
                    <FileText size={15} className="flex-none text-fg-3" />
                    <span className="truncate">{n.label}</span>
                  </button>
                ))}
              </AsideGroup>
              {tags.length > 0 && (
                <AsideGroup title="标记">
                  {tags.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      className={asideRow}
                      onClick={() => wb.openView('node', { id: n.id })}
                    >
                      <Hash size={15} className="flex-none text-fg-3" />
                      <span className="truncate">{n.label}</span>
                    </button>
                  ))}
                </AsideGroup>
              )}
            </div>
          )}
        </>
      )}
    </PeekAside>
  );
}
