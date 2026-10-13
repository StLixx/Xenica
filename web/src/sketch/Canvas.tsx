import { lazy, Suspense } from 'react';

import { EmptyState } from '../ui';
import type { CanvasProps } from './types';

const Surface = lazy(() => import('./CanvasSurface'));

/** Excalidraw 及其原生扩展一起按需加载。 */
export function Canvas(props: CanvasProps) {
  return (
    <Suspense fallback={<EmptyState tone="loading" title="加载画板…" />}>
      <Surface {...props} />
    </Suspense>
  );
}
