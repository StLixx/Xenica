import { Plus } from 'lucide-react';
import { useState } from 'react';

import type { Node } from '../api/client';
import { sketchBody, useCreateNode, useNodes, useUpdateNode } from '../api/queries';
import { AsideGroup, asideRow, Button, EmptyState, PeekAside, TextInput, nodeLabel } from '../ui';
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
      <PeekAside label="草图" title="草图" badge="草" storageKey="xenica.sketch.pinned">
        {(open) => (
          <>
            <button
              type="button"
              className={asideRow}
              onClick={() => void add()}
              disabled={create.isPending}
              title="新建草图"
            >
              <Plus size={16} className="flex-none" />
              {open && '新建草图'}
            </button>
            {/* 展开和收起共用同一棵结构，只有文字和首字格子不同——否则悬停展开时
                下面的条目会整体下移（真机上量到差 40px），鼠标底下的东西会跑掉。 */}
            <div className="-mx-2 mt-2 min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-2">
              {sketches.length === 0 ? (
                open ? (
                  <p className="px-2 py-1 text-meta text-fg-3">
                    还没有草图，点「新建草图」开始画。
                  </p>
                ) : null
              ) : (
                <AsideGroup title="全部草图" open={open}>
                  {sketches.map((s) => {
                    const name = nodeLabel(s) || '无标题';
                    return (
                      <button
                        key={s.id}
                        type="button"
                        className={asideRow}
                        aria-selected={s.id === current?.id}
                        aria-label={name}
                        title={name}
                        onClick={() => pick(s.id)}
                      >
                        {open ? (
                          <span className="truncate">{name}</span>
                        ) : (
                          <span className="grid size-5.5 flex-none place-items-center rounded-sm bg-hover text-ui text-fg-2">
                            {name.slice(0, 1)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </AsideGroup>
              )}
            </div>
          </>
        )}
      </PeekAside>
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
