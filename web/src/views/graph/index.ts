import { Network } from 'lucide-react';

import { defineView } from '../../shell/api';
import { GraphView } from './GraphView';

export const graphView = defineView({
  id: 'graph',
  title: '图',
  icon: Network,
  component: GraphView,
  sidebar: true,
  singleton: true,
});
