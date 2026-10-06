import { describe, expect, it } from 'vitest';

import { circleLayout } from './layout';

describe('circleLayout', () => {
  it('is deterministic and gives every node a distinct position', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const a = circleLayout(ids);
    expect(circleLayout(ids)).toEqual(a);
    expect(new Set([...a.values()].map((p) => `${p.x},${p.y}`)).size).toBe(4);
  });

  it('puts a single node at the origin', () => {
    expect(circleLayout(['only']).get('only')).toEqual({ x: 0, y: 0 });
  });
});
