import { FileText } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import type { Command } from './api';
import { collectCommands, filterCommands, panelId } from './commands';

const cmd = (id: string, title: string, keywords?: string[]): Command => ({
  id,
  title,
  keywords,
  run: () => {},
});

describe('filterCommands', () => {
  const all = [
    cmd('a', '新建节点', ['new node']),
    cmd('b', '打开：图'),
    cmd('c', '打开：全部节点'),
  ];

  it('returns everything for an empty query', () => {
    expect(filterCommands(all, '  ')).toHaveLength(3);
  });

  it('matches every word against title and keywords', () => {
    expect(filterCommands(all, '打开 节点').map((c) => c.id)).toEqual(['c']);
    expect(filterCommands(all, 'NEW').map((c) => c.id)).toEqual(['a']);
  });
});

describe('panelId', () => {
  it('is stable regardless of param order', () => {
    const v = { id: 'node' };
    expect(panelId(v, { b: '2', a: '1' })).toBe(panelId(v, { a: '1', b: '2' }));
  });

  it('ignores params for singleton views', () => {
    expect(panelId({ id: 'graph', singleton: true }, { x: '1' })).toBe('graph');
  });
});

describe('collectCommands', () => {
  it('adds an open command for each singleton view', () => {
    const views = [
      { id: 'nodes', title: '全部节点', icon: FileText, component: () => null, singleton: true },
      {
        id: 'node',
        title: '节点',
        icon: FileText,
        component: () => null,
        commands: [cmd('x', 'X')],
      },
    ];
    expect(collectCommands(views).map((c) => c.id)).toEqual(['view.open.nodes', 'x']);
  });
});
