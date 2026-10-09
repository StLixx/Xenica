/** 草图站点：独立域名，或者 `/sketch` 路径（本机开发和预览站都用路径）。 */

export function isSketchEntry(): boolean {
  return location.hostname.startsWith('excalidraw.') || location.pathname.startsWith('/sketch');
}

/** 地址里的草图 id（`/sketch/<id>`）。 */
export function sketchIdFromPath(): string | null {
  const found = /^\/sketch\/([0-9a-fA-F-]{36})/.exec(location.pathname);
  return found?.[1] ?? null;
}

/** 选中一张草图时把 id 写进地址，方便刷新和分享。 */
export function putSketchInPath(id: string): void {
  history.replaceState(null, '', `/sketch/${id}`);
}
