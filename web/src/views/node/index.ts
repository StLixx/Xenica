import { FileText } from 'lucide-react';

import { createNode } from '../../api/queries';
import { defineView } from '../../shell/api';
import { NodeView } from './NodeView';

export const nodeView = defineView<{ id: string }>({
  id: 'node',
  title: '节点',
  icon: FileText,
  component: NodeView,
  commands: [
    {
      id: 'node.new',
      title: '新建节点',
      keywords: ['new', 'create', 'xinjian'],
      run: async (wb) => {
        const node = await createNode({ title: '未命名' });
        wb.openView('node', { id: node.id });
      },
    },
  ],
});
