import { FileText, LayoutGrid, List, Table2, type LucideIcon } from 'lucide-react';
import { useState } from 'react';

import type { Node } from '../../api/client';
import { bodyMd, Markdown, nodeLabel, stripTags } from '../../ui';
import type { GraphIndex } from './graph';

export type Mode = 'doc' | 'list' | 'table' | 'gallery';

const MODES: Record<Mode, { label: string; icon: LucideIcon }> = {
  doc: { label: '文档', icon: FileText },
  list: { label: '列表', icon: List },
  table: { label: '表格', icon: Table2 },
  gallery: { label: '画廊', icon: LayoutGrid },
};

const time = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' });

/** 记住每个地方选的看法（存在本机）。 */
export function useMode(key: string, fallback: Mode): [Mode, (m: Mode) => void] {
  const storageKey = `xenica.mode.${key}`;
  const [mode, setMode] = useState<Mode>(
    () => (localStorage.getItem(storageKey) as Mode | null) ?? fallback,
  );
  return [
    mode,
    (m) => {
      localStorage.setItem(storageKey, m);
      setMode(m);
    },
  ];
}

export function ModeSwitch({
  modes,
  value,
  onChange,
  label,
}: {
  modes: Mode[];
  value: Mode;
  onChange: (m: Mode) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-0.5 rounded-sm bg-hover p-0.5">
      {modes.map((m) => {
        const { label: text, icon: Icon } = MODES[m];
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={value === m}
            title={text}
            onClick={() => onChange(m)}
            className={`flex h-6 cursor-pointer items-center gap-1 rounded-sm px-2 text-meta transition-colors ${value === m ? 'bg-pop text-fg shadow-raise' : 'text-fg-3 hover:text-fg'}`}
          >
            <Icon size={13} />
            {text}
          </button>
        );
      })}
    </div>
  );
}

/** 一条的内容：正文（公式、图片照常渲染），没有正文就显示名字。 */
function Content({
  node,
  onRef,
  bare,
}: {
  node: Node;
  onRef: (name: string) => void;
  /** 去掉 #标记（标记另外显示时）。 */
  bare?: boolean;
}) {
  const md = bare ? stripTags(bodyMd(node)).trim() : bodyMd(node);
  if (!md.trim()) return <span className="text-fg-2">{nodeLabel(node)}</span>;
  return <Markdown md={md} onRef={onRef} className="x-md-compact" />;
}

function Chip({ node, onOpen }: { node: Node; onOpen: (n: Node) => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen(node);
      }}
      className="max-w-40 cursor-pointer truncate rounded-sm bg-accent-soft px-1.5 text-meta text-accent hover:bg-selected"
    >
      {nodeLabel(node)}
    </button>
  );
}

/**
 * 同一组节点的几种看法：列表、表格、画廊。
 * 点一条 = 打开它所在的页并滚到那里（没有所在页就打开它自己）。
 */
export function Collection({
  nodes,
  mode,
  index,
  context,
  showSource,
  onOpen,
  onRef,
}: {
  nodes: Node[];
  mode: Exclude<Mode, 'doc'>;
  index: GraphIndex;
  /** 当前所在的节点：标记列里不再重复显示它。 */
  context: string;
  showSource: boolean;
  onOpen: (node: Node) => void;
  onRef: (name: string) => void;
}) {
  const tags = (n: Node) => index.mentionsOf(n.id).filter((t) => t.id !== context);
  const source = (n: Node) => index.parentsOf(n.id).filter((p) => p.id !== context)[0];

  if (mode === 'table')
    return (
      <div className="overflow-x-auto rounded-md shadow-raise">
        <table className="w-full border-collapse text-left text-ui">
          <thead className="text-label text-fg-3">
            <tr className="border-b border-line">
              <th className="px-3 py-2">内容</th>
              <th className="w-36 px-3 py-2">标记</th>
              {showSource && <th className="w-40 px-3 py-2">来自</th>}
              <th className="w-16 px-3 py-2">更新</th>
            </tr>
          </thead>
          <tbody>
            {nodes.map((n) => {
              const src = source(n);
              return (
                <tr
                  key={n.id}
                  onClick={() => onOpen(n)}
                  className="cursor-pointer border-b border-line align-top last:border-0 hover:bg-hover"
                >
                  <td className="px-3 py-2 text-body">
                    <Content node={n} onRef={onRef} bare />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {tags(n).map((t) => (
                        <Chip key={t.id} node={t} onOpen={(x) => onOpen(x)} />
                      ))}
                    </div>
                  </td>
                  {showSource && (
                    <td className="truncate px-3 py-2 text-fg-2">{src ? index.label(src) : ''}</td>
                  )}
                  <td className="px-3 py-2 text-fg-3 tabular-nums">
                    {time.format(new Date(n.updated_at))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );

  if (mode === 'gallery')
    return (
      <div className="grid-cards grid gap-3">
        {nodes.map((n) => {
          const src = source(n);
          return (
            <div
              key={n.id}
              role="button"
              tabIndex={0}
              onClick={() => onOpen(n)}
              onKeyDown={(e) => e.key === 'Enter' && onOpen(n)}
              className="flex max-h-72 cursor-pointer flex-col overflow-hidden rounded-md bg-raised p-3 text-left text-body shadow-raise transition-colors hover:bg-pop"
            >
              <div className="min-h-0 flex-1 overflow-hidden">
                <Content node={n} onRef={onRef} bare />
              </div>
              {(showSource && src) || tags(n).length ? (
                <div className="mt-2 flex flex-wrap items-center gap-1 text-meta text-fg-3">
                  {tags(n).map((t) => (
                    <Chip key={t.id} node={t} onOpen={onOpen} />
                  ))}
                  {showSource && src && (
                    <span className="ml-auto truncate">{index.label(src)}</span>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );

  return (
    <ul className="flex flex-col">
      {nodes.map((n) => {
        const src = source(n);
        return (
          <li key={n.id}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => onOpen(n)}
              onKeyDown={(e) => e.key === 'Enter' && onOpen(n)}
              className="flex cursor-pointer items-start gap-3 rounded-sm px-2 py-1.5 text-body hover:bg-hover"
            >
              <div className="min-w-0 flex-1">
                <Content node={n} onRef={onRef} />
              </div>
              {showSource && src && (
                <span className="mt-0.5 max-w-40 flex-none truncate text-meta text-fg-3">
                  {index.label(src)}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
