import { FilePlus2, FileText, Hash, Pin, PinOff, Search } from 'lucide-react';
import { useMemo, useRef, useState, type ReactNode } from 'react';

import { useEdges, useNodes } from '../api/queries';
import { nodeLabel } from '../ui';
import type { AnyView } from './api';
import { useWorkbench } from './api';

const PIN_KEY = 'xenica.sidebar.pinned';

/**
 * 左侧栏（参考 Edge 的垂直标签页）：平时收成一条图标栏；鼠标移上去时浮在内容上展开，不挤正文；
 * 点图钉固定展开。触屏没有悬停，点一下图标栏空白处展开。
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
  const [pinned, setPinned] = useState(() => localStorage.getItem(PIN_KEY) === '1');
  const [hover, setHover] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const open = pinned || hover;
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

  const later = (fn: () => void, ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(fn, ms);
  };
  const togglePin = () => {
    localStorage.setItem(PIN_KEY, pinned ? '0' : '1');
    setPinned(!pinned);
    setHover(false);
  };
  const row = 'item w-full text-body';

  return (
    <div className={`relative flex-none ${pinned ? 'w-(--x-sidebar)' : 'w-(--x-rail)'}`}>
      <nav
        aria-label="侧栏"
        data-open={open || undefined}
        onMouseEnter={() => later(() => setHover(true), 120)}
        onMouseLeave={() => later(() => setHover(false), 220)}
        onFocus={() => setHover(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setHover(false);
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) setHover(true);
        }}
        className={`absolute inset-y-0 left-0 z-30 flex flex-col gap-0.5 overflow-hidden bg-side px-2 py-2.5 transition-all duration-base ${open ? 'w-(--x-sidebar)' : 'w-(--x-rail)'} ${hover && !pinned ? 'rounded-r-lg shadow-pop' : ''}`}
      >
        <div className="flex h-8 items-center gap-2 px-1.5 pb-2 font-semibold">
          <span className="grid size-5.5 flex-none place-items-center rounded-sm bg-accent text-ui font-bold text-on-accent">
            X
          </span>
          {open && <span className="flex-1">Xenica</span>}
          {open && (
            <button
              type="button"
              onClick={togglePin}
              aria-label={pinned ? '取消固定侧栏' : '固定侧栏'}
              aria-pressed={pinned}
              title={pinned ? '取消固定' : '固定展开'}
              className="grid size-6 cursor-pointer place-items-center rounded-sm text-fg-3 hover:bg-hover hover:text-fg"
            >
              {pinned ? <PinOff size={15} /> : <Pin size={15} />}
            </button>
          )}
        </div>
        <button type="button" className={row} onClick={onOpenPalette} title="搜索或命令（Ctrl K）">
          <Search size={16} className="flex-none" />
          {open && (
            <>
              搜索或命令<span className="ml-auto text-meta text-fg-3">Ctrl K</span>
            </>
          )}
        </button>
        <button type="button" className={row} onClick={onNewPage} title="新建页">
          <FilePlus2 size={16} className="flex-none" />
          {open && '新建页'}
        </button>
        {views
          .filter((v) => v.sidebar)
          .map((v) => (
            <button
              key={v.id}
              type="button"
              className={row}
              onClick={() => wb.openView(v.id)}
              title={v.title}
            >
              <v.icon size={16} className="flex-none" />
              {open && v.title}
            </button>
          ))}
        {open && (
          <div className="-mx-2 mt-2 min-h-0 flex-1 overflow-y-auto px-2">
            <Group title="页面">
              {pages.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={row}
                  onClick={() => wb.openView('node', { id: n.id })}
                >
                  <FileText size={15} className="flex-none text-fg-3" />
                  <span className="truncate">{n.label}</span>
                </button>
              ))}
            </Group>
            {tags.length > 0 && (
              <Group title="标记">
                {tags.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className={row}
                    onClick={() => wb.openView('node', { id: n.id })}
                  >
                    <Hash size={15} className="flex-none text-fg-3" />
                    <span className="truncate">{n.label}</span>
                  </button>
                ))}
              </Group>
            )}
          </div>
        )}
      </nav>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <div className="px-2 pt-3 pb-1 text-label text-fg-3">{title}</div>
      {children}
    </section>
  );
}
