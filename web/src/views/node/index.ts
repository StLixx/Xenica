import { FileText } from 'lucide-react';

import { defineView } from '../../shell/api';
import { NodeView } from './NodeView';

export const nodeView = defineView<{ id: string }>({
  id: 'node',
  title: '节点',
  icon: FileText,
  component: NodeView,
});
