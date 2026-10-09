import { useState } from 'react';

import { useNodes } from '../../api/queries';
import { useWorkbench } from '../../shell/api';
import { EmptyState, TextInput, bodyMd, nodeLabel } from '../../ui';

const time = new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** 范例视图：全部节点（页、块、标记都是节点），可以筛选。写新视图时照这个抄。 */
export function NodeListView() {
  const nodes = useNodes();
  const wb = useWorkbench();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = (nodes.data ?? []).filter(
    (n) => !q || `${n.title}\n${bodyMd(n)}`.toLowerCase().includes(q),
  );

  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <TextInput
          value={query}
          placeholder="筛选：标题或正文里的字"
          aria-label="筛选节点"
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-1.5 pb-3">
        {nodes.isPending ? (
          <EmptyState tone="loading" title="加载中…" />
        ) : nodes.isError ? (
          <EmptyState tone="error" title="读取失败" hint={nodes.error.message} />
        ) : shown.length === 0 ? (
          <EmptyState
            title={q ? '没有匹配的节点' : '还没有节点'}
            hint={q ? '换个词试试。' : '在侧栏点「新建页」开始。'}
          />
        ) : (
          <ul aria-label="节点列表">
            {shown.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => wb.openView('node', { id: n.id })}
                  className="flex h-(--x-row) w-full cursor-pointer items-center gap-2 rounded-sm px-1.5 text-left text-body hover:bg-hover"
                >
                  <span className="min-w-0 flex-1 truncate">{nodeLabel(n)}</span>
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
