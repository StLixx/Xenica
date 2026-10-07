import { useState } from 'react';

import { useCreateNode, useNodes } from '../../api/queries';
import { useWorkbench } from '../../shell/api';
import { EmptyState, KindBadge, TextInput } from '../../ui';

const time = new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** 范例视图：列表 + 新建。写新视图时照这个抄。 */
export function NodeListView() {
  const nodes = useNodes();
  const create = useCreateNode();
  const wb = useWorkbench();
  const [title, setTitle] = useState('');

  const submit = () => {
    if (!title.trim()) return;
    create.mutate(
      { title },
      {
        onSuccess: (node) => {
          setTitle('');
          wb.openView('node', { id: node.id });
        },
      },
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <TextInput
          value={title}
          placeholder="新建节点：输入标题，回车"
          aria-label="新建节点"
          disabled={create.isPending}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        {create.error && <div className="mt-1.5 text-meta text-danger">{create.error.message}</div>}
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-1.5 pb-3">
        {nodes.isPending ? (
          <EmptyState tone="loading" title="加载中…" />
        ) : nodes.isError ? (
          <EmptyState tone="error" title="读取失败" hint={nodes.error.message} />
        ) : nodes.data.length === 0 ? (
          <EmptyState title="还没有节点" hint="在上面输入标题，按回车新建。" />
        ) : (
          <ul aria-label="节点列表">
            {nodes.data.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => wb.openView('node', { id: n.id })}
                  className="flex h-(--x-row) w-full cursor-pointer items-center gap-2 rounded-sm px-1.5 text-left text-body hover:bg-hover"
                >
                  <KindBadge kind={n.kind} />
                  <span className="min-w-0 flex-1 truncate">{n.title}</span>
                  <span className="text-meta text-fg-3 tabular-nums">
                    {time.format(new Date(n.updated_at))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
