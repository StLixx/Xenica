import { ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { Node } from '../../api/client';
import {
  mdBody,
  useChildren,
  useRefreshGraph,
  useCreateEdge,
  useDeleteEdge,
  useDeleteNode,
  useEdges,
  useNode,
  useNodes,
  useTraces,
  useUpdateNode,
} from '../../api/queries';
import { useWorkbench, type ViewProps } from '../../shell/api';
import { Button, EmptyState, Markdown, bodyMd, edgeLabel, needsPreview, nodeLabel } from '../../ui';
import { BlockEditor } from './Blocks';
import { Collection, ModeSwitch, useMode } from './Collection';
import { reveal, useGraphIndex, type GraphIndex } from './graph';

const time = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' });
// 痕迹里的动作
const ACTIONS: Record<string, string> = {
  'node.created': '创建',
  'node.updated': '修改',
  'node.deleted': '删除',
  'node.reordered': '调整顺序',
};

/**
 * 节点页。任何节点都可以是一页：标题可有可无，正文由一块块子节点组成；
 * 下面列出提到它的节点（例如「必备」下面是所有标了 #必备 的公式），可以切成列表、表格、画廊。
 */
export function NodeView({ params, setTitle }: ViewProps<{ id: string }>) {
  const node = useNode(params.id);
  const update = useUpdateNode(params.id);
  const children = useChildren(params.id);
  const index = useGraphIndex();
  const wb = useWorkbench();
  const [draft, setDraft] = useState<string | null>(null);
  const [mode, setMode] = useMode(`children.${params.id}`, 'doc');
  const [more, setMore] = useState(false);

  const n = node.data;
  const label = n ? nodeLabel(n, children.data?.[0]) : '';
  useEffect(() => {
    if (label) setTitle(label);
  }, [label, setTitle]);

  const names = useMemo(
    () =>
      [...new Set([...index.byId.values()].map((x) => x.title.trim()).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b, 'zh-CN'),
      ),
    [index],
  );
  const openRef = useCallback(
    (name: string) => {
      const target = index.byTitle(name);
      if (target) wb.openView('node', { id: target.id });
    },
    [index, wb],
  );
  const openItem = useCallback(
    (item: Node) => {
      const parent = index.parentsOf(item.id)[0];
      if (parent && parent.id !== params.id) {
        wb.openView('node', { id: parent.id });
        reveal(parent.id, item.id);
      } else if (parent) reveal(parent.id, item.id);
      else wb.openView('node', { id: item.id });
    },
    [index, wb, params.id],
  );

  if (node.isPending) return <EmptyState tone="loading" title="加载中…" />;
  if (node.isError || !n)
    return <EmptyState tone="error" title="找不到这个节点" hint={node.error?.message} />;

  const save = () => {
    if (draft !== null && draft.trim() !== n.title) update.mutate({ title: draft });
    setDraft(null);
  };
  const parents = index.parentsOf(n.id);
  const ownMd = bodyMd(n);
  const kids = children.data ?? [];

  return (
    <div className="h-full overflow-auto">
      <article className="mx-auto max-w-(--x-doc) px-10 pt-8 pb-16 font-(--x-font-doc)">
        {parents.length > 0 && (
          <nav aria-label="所在" className="mb-1 flex flex-wrap gap-1 text-ui text-fg-3">
            {parents.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  wb.openView('node', { id: p.id });
                  reveal(p.id, n.id);
                }}
                className="cursor-pointer rounded-sm px-1 hover:bg-hover hover:text-fg"
              >
                {index.label(p)}
              </button>
            ))}
          </nav>
        )}
        <input
          aria-label="标题"
          value={draft ?? n.title}
          placeholder={n.title ? '' : ownMd ? '添加标题…' : label}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') setDraft(null);
          }}
          className={`w-full bg-transparent outline-none placeholder:text-fg-3 focus-visible:outline-none ${ownMd && !n.title ? 'text-heading' : 'text-display'}`}
        />
        <div className="mt-2 mb-5 flex items-center gap-4 text-ui text-fg-3">
          <span>{time.format(new Date(n.updated_at))}</span>
          {kids.length > 1 && <span>{kids.length} 块</span>}
          {update.error && <span className="text-danger">{update.error.message}</span>}
          {kids.length > 1 && (
            <div className="ml-auto">
              <ModeSwitch
                label="正文的看法"
                modes={['doc', 'list', 'table', 'gallery']}
                value={mode}
                onChange={setMode}
              />
            </div>
          )}
        </div>
        {ownMd && <SelfBlock node={n} onRef={openRef} />}
        {mode === 'doc' || kids.length <= 1 ? (
          <BlockEditor
            parentId={n.id}
            names={names}
            onRef={openRef}
            hint={index.mentionedBy(n.id).length > 0 ? '写点关于它的…' : undefined}
          />
        ) : (
          <Collection
            nodes={kids}
            mode={mode}
            index={index}
            context={n.id}
            showSource={false}
            onOpen={(item) => {
              setMode('doc');
              reveal(n.id, item.id);
            }}
            onRef={openRef}
          />
        )}
        <Mentioned id={n.id} index={index} onOpen={openItem} onRef={openRef} />
        <div className="mt-10">
          <button
            type="button"
            aria-expanded={more}
            onClick={() => setMore((m) => !m)}
            className="flex cursor-pointer items-center gap-1 text-label text-fg-3 hover:text-fg"
          >
            <ChevronRight size={14} className={`transition-transform ${more ? 'rotate-90' : ''}`} />
            关系与痕迹
          </button>
          {more && (
            <div className="pl-5">
              <Relations id={n.id} />
              <Traces id={n.id} />
              <DeleteNode id={n.id} />
            </div>
          )}
        </div>
      </article>
    </div>
  );
}

/** 节点自己的正文（单独打开一块时）。 */
function SelfBlock({ node, onRef }: { node: Node; onRef: (name: string) => void }) {
  const update = useUpdateNode(node.id);
  const refresh = useRefreshGraph();
  const [draft, setDraft] = useState<string | null>(null);
  const md = bodyMd(node);
  if (draft === null)
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label="编辑正文"
        onClick={() => setDraft(md)}
        onKeyDown={(e) => e.key === 'Enter' && setDraft(md)}
        className="mb-4 cursor-text rounded-md bg-raised px-4 py-3 text-body shadow-raise"
      >
        <Markdown md={md} onRef={onRef} />
      </div>
    );
  return (
    <div className="mb-4 rounded-md bg-raised px-4 py-3 shadow-raise">
      <textarea
        aria-label="正文"
        autoFocus
        value={draft}
        rows={Math.max(2, draft.split('\n').length)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== md) update.mutate({ body: mdBody(draft) }, { onSuccess: () => refresh() });
          setDraft(null);
        }}
        onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()}
        className="block w-full resize-none bg-transparent text-body leading-relaxed outline-none focus-visible:outline-none"
      />
      {needsPreview(draft) && <Markdown md={draft} className="x-md-compact mt-2" />}
    </div>
  );
}

/** 提到这个节点的所有节点（#标记、[[名字]]），可以切换看法。 */
function Mentioned({
  id,
  index,
  onOpen,
  onRef,
}: {
  id: string;
  index: GraphIndex;
  onOpen: (n: Node) => void;
  onRef: (name: string) => void;
}) {
  const nodes = index.mentionedBy(id);
  const [mode, setMode] = useMode(`mentioned.${id}`, 'list');
  if (nodes.length === 0) return null;
  const m = mode === 'doc' ? 'list' : mode;
  return (
    <section aria-label="提到它的" className="mt-10">
      <div className="mb-2 flex items-center gap-3">
        <h3 className="text-label text-fg-3">提到它的 · {nodes.length}</h3>
        <div className="ml-auto">
          <ModeSwitch
            label="提到它的看法"
            modes={['list', 'table', 'gallery']}
            value={m}
            onChange={setMode}
          />
        </div>
      </div>
      <Collection
        nodes={nodes}
        mode={m}
        index={index}
        context={id}
        showSource
        onOpen={onOpen}
        onRef={onRef}
      />
    </section>
  );
}

function DeleteNode({ id }: { id: string }) {
  const remove = useDeleteNode();
  const wb = useWorkbench();
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="mt-8">
      {confirming ? (
        <span className="flex items-center gap-2 text-ui text-fg-3">
          里面的块和关系也会一起删除，痕迹保留。
          <Button
            variant="danger"
            onClick={() => remove.mutate(id, { onSuccess: () => wb.closeView('node', { id }) })}
          >
            确认删除
          </Button>
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            取消
          </Button>
        </span>
      ) : (
        <Button variant="ghost" onClick={() => setConfirming(true)}>
          删除节点
        </Button>
      )}
    </div>
  );
}

function Relations({ id }: { id: string }) {
  const edges = useEdges(id);
  const nodes = useNodes();
  const create = useCreateEdge();
  const remove = useDeleteEdge();
  const wb = useWorkbench();
  const [target, setTarget] = useState('');
  const byId = new Map((nodes.data ?? []).map((n) => [n.id, n]));
  const others = (nodes.data ?? []).filter((n) => n.id !== id && n.title.trim());

  return (
    <section aria-label="关系">
      <h3 className="mt-6 mb-2 text-label text-fg-3">关系</h3>
      <ul>
        {(edges.data ?? [])
          .filter((e) => e.kind !== 'contains')
          .map((e) => {
            const otherId = e.source === id ? e.target : e.source;
            const other = byId.get(otherId);
            return (
              <li key={e.id} className="group flex h-(--x-row) items-center gap-2 text-body">
                <span className="w-10 text-meta text-fg-3">
                  {e.source === id ? edgeLabel(e.kind) : `← ${edgeLabel(e.kind)}`}
                </span>
                <button
                  type="button"
                  onClick={() => wb.openView('node', { id: otherId })}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm bg-hover py-px pr-2 pl-0.5 hover:bg-press"
                >
                  {other ? nodeLabel(other) : '…'}
                </button>
                <Button
                  variant="ghost"
                  className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  aria-label="删除关系"
                  onClick={() => remove.mutate(e.id)}
                >
                  移除
                </Button>
              </li>
            );
          })}
      </ul>
      {others.length > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <select
            aria-label="关联到"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="h-7 max-w-64 rounded-sm bg-hover px-2 text-ui text-fg-2 outline-none"
          >
            <option value="">关联到…</option>
            {others.map((n) => (
              <option key={n.id} value={n.id}>
                {nodeLabel(n)}
              </option>
            ))}
          </select>
          <Button
            disabled={!target || create.isPending}
            onClick={() =>
              create.mutate({ source: id, target }, { onSuccess: () => setTarget('') })
            }
          >
            添加关系
          </Button>
          {create.error && <span className="text-meta text-danger">{create.error.message}</span>}
        </div>
      )}
    </section>
  );
}

function Traces({ id }: { id: string }) {
  const traces = useTraces(id);
  return (
    <section aria-label="痕迹">
      <h3 className="mt-8 mb-2 text-label text-fg-3">痕迹</h3>
      <ul className="text-ui text-fg-2">
        {(traces.data ?? []).map((t) => (
          <li key={t.id} className="flex gap-3 py-0.5">
            <span className="w-28 text-fg-3 tabular-nums">{time.format(new Date(t.at))}</span>
            <span>
              {t.actor.type === 'user' ? '你' : `处理器 ${t.actor.id}@${t.actor.version}`}
              {ACTIONS[t.action] ?? t.action}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
