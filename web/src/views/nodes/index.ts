import { List } from 'lucide-react';

import { defineView } from '../../shell/api';
import { NodeListView } from './NodeListView';

export const nodesView = defineView({
  id: 'nodes',
  title: '全部节点',
  icon: List,
  component: NodeListView,
  sidebar: true,
  singleton: true,
});
