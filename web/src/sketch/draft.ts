import type { Scene } from './scene';

export type DraftFile = { id: string; mimeType: string; dataURL: string; created: number };
export type CanvasDraft = {
  schema: 1;
  revision: string;
  scene: Scene;
  files: Record<string, DraftFile>;
};

const key = (id: string) => `xenica.sketch.draft.${id}`;

/** 每个标签页独立保留同步草稿，刷新恢复时不混入其它窗口的未保存内容。 */
export function writeDraft(id: string, draft: CanvasDraft): boolean {
  try {
    sessionStorage.setItem(key(id), JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function readDraft(id: string): CanvasDraft | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key(id)) ?? 'null') as CanvasDraft | null;
    if (
      value?.schema !== 1 ||
      typeof value.revision !== 'string' ||
      !Array.isArray(value.scene?.elements) ||
      value.scene.elements.some((element) => !element || typeof element.id !== 'string') ||
      !value.files ||
      typeof value.files !== 'object' ||
      Object.values(value.files).some(
        (file) =>
          !file ||
          typeof file.id !== 'string' ||
          typeof file.mimeType !== 'string' ||
          typeof file.dataURL !== 'string' ||
          typeof file.created !== 'number',
      )
    )
      return null;
    return value;
  } catch {
    return null;
  }
}

/** 只有服务器确认了当前完整画面，才移除恢复副本。 */
export function clearDraft(id: string): boolean {
  try {
    sessionStorage.removeItem(key(id));
    return true;
  } catch {
    return false;
  }
}
