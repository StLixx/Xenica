/** 草图站点：独立域名，或者 `/sketch` 路径（本机开发和预览站都用路径）。 */

export function isSketchEntry(): boolean {
  return (
    location.pathname.startsWith('/sketch') ||
    (location.hostname.startsWith('excalidraw.') &&
      !new URLSearchParams(location.search).has('experience') &&
      !new URLSearchParams(location.search).has('view'))
  );
}

/** 地址里的草图 id（`/sketch/<id>`）。 */
export function sketchIdFromPath(): string | null {
  const found = /^\/sketch\/([0-9a-fA-F-]{36})/.exec(location.pathname);
  return found?.[1] ?? null;
}

/** 选中一张草图时把 id 写进地址，方便刷新和分享。 */
export function putSketchInPath(id: string, replace = false, title = ''): void {
  const path = `/sketch/${id}${title.trim() ? `/${encodeURIComponent(title.trim())}` : ''}`;
  if (location.pathname === path) return;
  history[replace ? 'replaceState' : 'pushState'](null, '', path);
}
