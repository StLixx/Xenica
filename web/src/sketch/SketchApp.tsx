import { useState } from 'react';

import type { Node } from '../api/client';
import { sketchBody, useCreateNode, useNodes, useUpdateNode } from '../api/queries';
import { Button, EmptyState, TextInput, nodeLabel } from '../ui';
import { Canvas } from './Canvas';
import { SharePanel } from './SharePanel';
import { putSketchInPath, sketchIdFromPath } from './entry';
import { emptyScene } from './scene';

/**
 * 草图站点：左边一列草图，右边一块画布。
 * 独立域名（excalidraw.<域名>）和 `/sketch` 路径都进这里，见 ADR 0009。
 */
export function SketchApp() {
  const nodes = useNodes();
  const create = useCreateNode();
  const [picked, setPicked] = useState<string | null>(() => sketchIdFromPath());

  const sketches = (nodes.data ?? []).filter((n) => n.kind === 'sketch');
  const current = sketches.find((s) => s.id === picked) ?? sketches[0] ?? null;

  const pick = (id: string) => {
    setPicked(id);
    putSketchInPath(id);
  };

  const add = async () => {
    const node = await create.mutateAsync({
      kind: 'sketch',
      title: '',
      body: sketchBody(emptyScene()),
    });
    pick(node.id);
  };

  if (nodes.isPending) return <EmptyState tone="loading" title="读草图…" />;
  if (nodes.isError)
    return <EmptyState tone="error" title="连不上后端" hint={nodes.error.message} />;

  return (
    <div className="flex h-full">
      <aside className="flex w-(--x-sidebar) shrink-0 flex-col gap-1 border-r border-line bg-side p-2">
        <div className="flex items-center justify-between px-1 pb-1">
          <span className="text-label text-fg-2">草图</span>
          <Button variant="ghost" onClick={() => void add()} disabled={create.isPending}>
            新建
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {sketches.map((s) => (
            <button
              key={s.id}
              type="button"
              className="item w-full text-ui"
              aria-selected={s.id === current?.id}
              title={nodeLabel(s)}
              onClick={() => pick(s.id)}
            >
              <span className="truncate">{nodeLabel(s) || '无标题'}</span>
            </button>
          ))}
          {sketches.length === 0 ? (
            <p className="px-2 py-1 text-meta text-fg-3">还没有草图，点「新建」开始画。</p>
          ) : null}
        </div>
      </aside>
      {current ? (
        <Workspace key={current.id} node={current} />
      ) : (
        <EmptyState title="新建一张草图开始画" hint="画完把「能读」的链接交给 AI。" />
      )}
    </div>
  );
}

function Workspace({ node }: { node: Node }) {
  const update = useUpdateNode(node.id);
  const [title, setTitle] = useState(node.title);
  const [open, setOpen] = useState(false);

  const nameIt = () => {
    const next = title.trim();
    if (next !== node.title) void update.mutateAsync({ title: next });
  };

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-line bg-side px-3 py-2">
        <TextInput
          value={title}
          aria-label="草图名字"
          placeholder="这张草图叫什么（可以不起）"
          className="max-w-(--x-doc)"
          onChange={(e) => setTitle(e.target.value)}
          onBlur={nameIt}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
        <Button variant={open ? 'primary' : 'default'} onClick={() => setOpen((v) => !v)}>
          分享给 AI
        </Button>
      </header>
      <div className="relative min-h-0 flex-1">
        <Canvas node={node} save={(body) => update.mutateAsync({ body })} />
        {open ? (
          <div className="absolute top-2 right-2 z-10">
            <SharePanel node={node.id} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
