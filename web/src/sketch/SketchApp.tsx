import { useEffect, useState } from 'react';

import type { Node } from '../api/client';
import {
  sketchBody,
  saveSketch,
  useNode,
  useCreateNode,
  useNodes,
  useDevelopmentBoard,
  useUpdateNode,
} from '../api/queries';
import { EmptyState } from '../ui';
import { Canvas } from './Canvas';
import { putSketchInPath, sketchIdFromPath } from './entry';
import { emptyScene } from './scene';

/** 草图站只有画布；管理入口由 Excalidraw 自身承载。 */
export function SketchApp() {
  const nodes = useNodes();
  const create = useCreateNode();
  const [picked, setPicked] = useState<string | null>(() => sketchIdFromPath());
  const development = useDevelopmentBoard(!picked);
  const sketches = (nodes.data ?? []).filter((n) => n.kind === 'sketch');
  const current = picked ? sketches.find((s) => s.id === picked) : development.data;

  useEffect(() => {
    const onPop = () => setPicked(sketchIdFromPath());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => {
    if (current && !sketchIdFromPath() && (current.body as {purpose?:string}).purpose !== 'development') putSketchInPath(current.id, true);
  }, [current]);

  const pick = (id: string) => {
    setPicked(id);
    if (id === development.data?.id) history.pushState(null, '', '/sketch');
    else putSketchInPath(id, false, sketches.find((sketch) => sketch.id === id)?.title);
  };
  const add = async () => {
    const node = await create.mutateAsync({
      kind: 'sketch',
      title: '',
      body: sketchBody(emptyScene()),
    });
    pick(node.id);
  };
  if (nodes.isPending || (!picked && development.isPending))
    return <EmptyState tone="loading" title="读草图…" />;
  if (nodes.isError || create.isError || (!picked && development.isError))
    return (
      <EmptyState
        tone="error"
        title="连不上后端"
        hint={nodes.error?.message ?? create.error?.message ?? development.error?.message}
      />
    );
  if (!current)
    return picked ? (
      <EmptyState title="找不到这张草图" hint="请通过有效的画布网址打开。" />
    ) : (
      <EmptyState tone="loading" title="准备画布…" />
    );
  return (
    <Workspace
      key={current.id}
      node={current}
      sketches={sketches}
      add={add}
      pick={pick}
      creating={create.isPending}
    />
  );
}

function Workspace({
  node,
  ...management
}: {
  node: Node;
  sketches: Node[];
  add: () => Promise<void>;
  pick: (id: string) => void;
  creating: boolean;
}) {
  const current = useNode(node.id, 2000);
  const fresh = current.data ?? node;
  const update = useUpdateNode(node.id, fresh.updated_at);
  useEffect(() => {
    document.title = `${fresh.title || '无标题'} · Xenica 草图`;
    if ((fresh.body as {purpose?:string}).purpose === 'development') history.replaceState(null, '', '/sketch');
    else putSketchInPath(fresh.id, true, fresh.title);
  }, [fresh.id, fresh.title, fresh.body]);
  return (
    <Canvas
      node={fresh}
      save={(body, revision) => saveSketch(node.id, body, revision)}
      rename={async (title) => {
        await update.mutateAsync({ title });
      }}
      {...management}
    />
  );
}
