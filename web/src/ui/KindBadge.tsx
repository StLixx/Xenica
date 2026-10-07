import type { CSSProperties } from 'react';

import { kindColor, kindInfo } from './kinds';

/** 节点类型标记：同一种节点在任何地方都长这样。 */
export function KindBadge({ kind, size = 'sm' }: { kind: string; size?: 'sm' | 'lg' }) {
  const { mark, label } = kindInfo(kind);
  const style = { '--h': kindColor(kind) } as CSSProperties;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      style={style}
      className={[
        'inline-grid flex-none place-items-center rounded-sm leading-none font-semibold',
        'bg-kind-soft text-(--h)',
        size === 'sm' ? 'size-4.5 text-meta' : 'size-7.5 rounded-md text-strong',
      ].join(' ')}
    >
      {mark}
    </span>
  );
}
