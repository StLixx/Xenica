import { useEffect, useState } from 'react';

import {
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
import { Button, EmptyState, KindBadge, edgeLabel, kindInfo } from '../../ui';

const time = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' });
const ACTIONS: Record<string, string> = {
  'node.created': '创建',
  'node.updated': '修改',
  'node.deleted': '删除',
};

/** 节点页：标题、关系、痕迹。正文编辑器见片段 1.3。 */
export function NodeView({ params, setTitle }: ViewProps<{ id: string }>) {
  const node = useNode(params.id);
  const update = useUpdateNode(params.id);
  const remove = useDeleteNode();
  const wb = useWorkbench();
  const [draft, setDraft] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (node.data) setTitle(node.data.title);
  }, [node.data, setTitle]);

  if (node.isPending) return <EmptyState tone="loading" title="加载中…" />;
  if (node.isError)
    return <EmptyState tone="error" title="找不到这个节点" hint={node.error.message} />;
  const n = node.data;

  const save = () => {
    if (draft !== null && draft.trim() && draft.trim() !== n.title) update.mutate({ title: draft });
    setDraft(null);
  };

  return (
    <div className="h-full overflow-auto">
      <article className="mx-auto max-w-(--x-doc) px-8 pt-6 pb-16 font-(--x-font-doc)">
        <div className="flex items-center gap-3">
          <KindBadge kind={n.kind} size="lg" />
          <input
            aria-label="标题"
            value={draft ?? n.title}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') setDraft(null);
            }}
            className="min-w-0 flex-1 bg-transparent text-display outline-none focus-visible:outline-none"
          />
        </div>
        <div className="mt-2 mb-6 flex flex-wrap gap-x-5 gap-y-1 text-ui text-fg-3">
          <span>
            类型<b className="ml-1.5 font-normal text-fg-2">{kindInfo(n.kind).label}</b>
          </span>
          <span>
            更新
            <b className="ml-1.5 font-normal text-fg-2">{time.format(new Date(n.updated_at))}</b>
          </span>
          {update.error && <span className="text-danger">{update.error.message}</span>}
        </div>
        <Relations id={n.id} />
        <Traces id={n.id} />
        <div className="mt-10">
          {confirming ? (
            <span className="flex items-center gap-2 text-ui text-fg-3">
              关系也会一起删除，痕迹保留。
              <Button
                variant="danger"
                onClick={() =>
                  remove.mutate(n.id, { onSuccess: () => wb.closeView('node', { id: n.id }) })
                }
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
      </article>
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
  const others = (nodes.data ?? []).filter((n) => n.id !== id);

  return (
    <section aria-label="关系">
      <h3 className="mt-6 mb-2 text-label text-fg-3">关系</h3>
      <ul>
        {(edges.data ?? []).map((e) => {
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
                <KindBadge kind={other?.kind ?? 'note'} />
                {other?.title ?? '…'}
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
                {n.title}
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
