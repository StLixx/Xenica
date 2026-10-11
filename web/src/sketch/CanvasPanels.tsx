import { Button, Sidebar } from '@excalidraw/excalidraw';
import { FolderOpen, Link, NotebookPen, Share2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { useDevelopmentBoard } from '../api/queries';
import { nodeLabel } from '../ui';
import type { CanvasProps } from './types';
import { ContextPanel } from './ContextPanel';
import { SharePanel } from './SharePanel';

export function CanvasPanels({
  node,
  embed,
  conflict,
  onTabChange,
  ...management
}: Omit<CanvasProps, 'save'> & {
  embed: ReactNode;
  conflict: ReactNode;
  onTabChange: (tab: string | null) => void;
}) {
  const [docked, setDocked] = useState(true);
  return (
    <Sidebar
      name="xenica"
      className="default-sidebar sidebar--xenica"
      docked={docked}
      onDock={setDocked}
      onStateChange={(state) => onTabChange(state?.tab ?? null)}
    >
      <Sidebar.Tabs>
        <Sidebar.Header>
          <Sidebar.TabTriggers>
            <Sidebar.TabTrigger tab="boards" title="画布管理" aria-label="管理画布">
              <FolderOpen />
            </Sidebar.TabTrigger>
            <Sidebar.TabTrigger tab="embed" title="嵌入内容" aria-label="嵌入面板">
              <Link />
            </Sidebar.TabTrigger>
            <Sidebar.TabTrigger tab="share" title="分享给 AI" aria-label="分享面板">
              <Share2 />
            </Sidebar.TabTrigger>
            <Sidebar.TabTrigger tab="context" title="设计上下文" aria-label="上下文面板">
              <NotebookPen />
            </Sidebar.TabTrigger>
          </Sidebar.TabTriggers>
        </Sidebar.Header>
        {conflict}
        <Sidebar.Tab tab="boards">
          <BoardManager key={node.id} node={node} {...management} />
        </Sidebar.Tab>
        <Sidebar.Tab tab="embed">{embed}</Sidebar.Tab>
        <Sidebar.Tab tab="share">
          <SharePanel node={node.id} />
        </Sidebar.Tab>
        <Sidebar.Tab tab="context">
          <ContextPanel node={node} />
        </Sidebar.Tab>
      </Sidebar.Tabs>
    </Sidebar>
  );
}

function BoardManager({ node, sketches, add, pick, creating, rename }: Omit<CanvasProps, 'save'>) {
  const development = useDevelopmentBoard(true);
  const [title, setTitle] = useState(node.title);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const nameIt = async () => {
    setBusy(true);
    try {
      await rename(title.trim());
      setMessage('名称已保存');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="xenica-panel">
      <h2>画布管理</h2>
      <Button
        disabled={!development.data}
        onSelect={() => development.data && pick(development.data.id)}
      >
        返回开发画板
      </Button>
      <label htmlFor="sketch-name">草图名字</label>
      <input
        id="sketch-name"
        className="xenica-input"
        value={title}
        placeholder="无标题"
        onChange={(e) => setTitle(e.target.value)}
      />
      <Button onSelect={() => void nameIt()} disabled={busy}>
        保存名称
      </Button>
      {message ? <p role="status">{message}</p> : null}
      <Button
        onSelect={() =>
          void add().catch((error: unknown) =>
            setMessage(error instanceof Error ? error.message : '新建失败'),
          )
        }
        disabled={creating}
      >
        新建草图
      </Button>
      <h3>切换画布</h3>
      <div className="xenica-board-list">
        {sketches.map((sketch) => (
          <Button key={sketch.id} selected={sketch.id === node.id} onSelect={() => pick(sketch.id)}>
            {nodeLabel(sketch) || '无标题'}
          </Button>
        ))}
      </div>
      <p>网址指向当前画布，刷新或复制网址可以再次打开。</p>
    </div>
  );
}
