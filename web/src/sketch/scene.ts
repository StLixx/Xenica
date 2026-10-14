/** 画面数据的读写。纯函数，单独测。 */
import type { Node } from '../api/client';

export type SceneElement = {
  id: string;
  version?: number;
  fileId?: string;
  fileIds?: Record<string, string>;
} & Record<string, unknown>;

export type Scene = {
  type?: string;
  version?: number;
  source?: string;
  elements?: SceneElement[];
} & Record<string, unknown>;

/** 一张空画面。 */
export function emptyScene(): Scene {
  return { type: 'excalidraw', version: 2, source: 'xenica', elements: [] };
}

/** 节点里的画面数据。不是草图（没有画面）就当空画面。 */
export function sceneOf(node: Node): Scene {
  const scene = (node.body as { scene?: Scene } | undefined)?.scene;
  if (!scene || !Array.isArray(scene.elements)) return emptyScene();
  return scene;
}

/** 画面里引用到的文件（贴进去的截图）。 */
export function fileIdsOf(scene: Scene): string[] {
  const out = new Set<string>();
  for (const el of scene.elements ?? []) {
    if (el.fileId) out.add(el.fileId);
    for (const id of Object.values(el.fileIds ?? {})) out.add(id);
  }
  return [...out];
}

/** 内容指纹：元素的版本号或文件数变了才需要写库（滚动、选中都不算改）。 */
export function signature(
  elements: readonly { id: string; version?: number; isDeleted?: boolean }[],
  fileCount: number,
): string {
  return `${elements
    .filter((e) => !e.isDeleted)
    .map((e) => `${e.id}:${e.version ?? 0}`)
    .join(',')}|${fileCount}`;
}

/** 图片的 dataURL 转成能上传的 blob。 */
export async function dataURLtoBlob(dataURL: string): Promise<Blob> {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]*)$/i.exec(dataURL);
  if (!match?.[1] || match[2] === undefined) throw new Error('不是有效的图片 dataURL');
  const decoded = atob(match[2]);
  const bytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: match[1] });
}
