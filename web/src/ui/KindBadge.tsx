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
        'inline-grid flex-none place-items-center rounded-[5px] leading-none font-semibold',
        'bg-[color-mix(in_srgb,var(--h)_18%,transparent)] text-(--h)',
        size === 'sm' ? 'size-[18px] text-[11px]' : 'size-[30px] rounded-md text-[16px]',
      ].join(' ')}
    >
      {mark}
    </span>
  );
}
