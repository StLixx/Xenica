import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';

import type { Node } from '../api/client';
import { sketchBody, uploadImage } from '../api/queries';
import { EmptyState } from '../ui';
import type { Scene, SceneElement } from './scene';
import { dataURLtoBlob, fileIdsOf, sceneOf, signature } from './scene';

/** Excalidraw 的包很大，只有进草图才加载。 */
const Excalidraw = lazy(async () => {
  const mod = await import('@excalidraw/excalidraw');
  await import('@excalidraw/excalidraw/index.css');
  return { default: mod.Excalidraw };
});

type ExcalidrawProps = React.ComponentProps<typeof Excalidraw>;
type Editor = Parameters<NonNullable<ExcalidrawProps['excalidrawAPI']>>[0];
type InitialData = NonNullable<ExcalidrawProps['initialData']>;
type LoadedFile = { id: string; mimeType: string; dataURL: string; created: number };

/** 停手之后再写库，别每按一个键就写一次。 */
const SAVE_DELAY = 800;

async function blobToDataURL(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * 一块画布。写库时做两件事：
 * 1. 贴进来的截图先存进库里，画面里的 `fileId` 换成本库的 id——这样 AI 顺着链接能取到原图；
 * 2. 导出一张 PNG 当「整张图的样子」——AI 想看画面时直接给这一张。
 */
export function Canvas({
  node,
  save,
}: {
  node: Node;
  save: (body: Record<string, never>) => Promise<unknown>;
}) {
  const scene = sceneOf(node);
  const editor = useRef<Editor | null>(null);
  const uploaded = useRef<Record<string, string>>({});
  const savedImage = useRef<string | undefined>(undefined);
  const lastSaved = useRef('');
  const armed = useRef(false);
  const timer = useRef<number | null>(null);
  const [files, setFiles] = useState<Record<string, LoadedFile> | null>(null);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // 画面里的图存在库里，打开时按原样取回来。
  useEffect(() => {
    let alive = true;
    void (async () => {
      const out: Record<string, LoadedFile> = {};
      for (const id of fileIdsOf(scene)) {
        try {
          const res = await fetch(`/api/files/${id}`);
          if (!res.ok) continue;
          const blob = await res.blob();
          out[id] = {
            id,
            mimeType: blob.type || 'image/png',
            dataURL: await blobToDataURL(blob),
            created: Date.now(),
          };
        } catch {
          // 取不到就少一张图，不影响继续画
        }
      }
      if (alive) setFiles(out);
    })();
    return () => {
      alive = false;
    };
  }, [scene]);

  const run = useCallback(async () => {
    const live = editor.current;
    if (!live) return;
    setState('saving');
    try {
      const live_files = live.getFiles();
      for (const [editorId, file] of Object.entries(live_files)) {
        if (uploaded.current[editorId]) continue;
        try {
          const url = await uploadImage(await dataURLtoBlob(file.dataURL));
          uploaded.current[editorId] = url.split('/').pop() ?? '';
        } catch {
          // 单张图传不上去不影响画面保存
        }
      }
      const elements: SceneElement[] = live.getSceneElements().map((element) => {
        const source = element as unknown as SceneElement;
        const next: SceneElement = { ...source };
        if (source.fileId && uploaded.current[source.fileId]) {
          next.fileId = uploaded.current[source.fileId];
        }
        if (source.fileIds) {
          next.fileIds = Object.fromEntries(
            Object.entries(source.fileIds).map(([key, id]) => [key, uploaded.current[id] ?? id]),
          );
        }
        return next;
      });
      let image = savedImage.current;
      try {
        const { exportToBlob } = await import('@excalidraw/excalidraw');
        const blob = await exportToBlob({
          elements: live.getSceneElements(),
          appState: { ...live.getAppState(), exportBackground: true },
          files: live_files,
          mimeType: 'image/png',
          exportPadding: 16,
        });
        const url = await uploadImage(new File([blob], 'sketch.png', { type: 'image/png' }));
        image = url.split('/').pop();
      } catch {
        // 导不出图就沿用上一张
      }
      const next: Scene = { type: 'excalidraw', version: 2, source: 'xenica', elements };
      await save(sketchBody(next, image));
      savedImage.current = image;
      lastSaved.current = signature(live.getSceneElements(), Object.keys(live_files).length);
      setState('saved');
    } catch {
      setState('error');
    }
  }, [save]);

  const change = useCallback<NonNullable<ExcalidrawProps['onChange']>>(
    (elements, _appState, fileMap) => {
      const sig = signature(elements, Object.keys(fileMap).length);
      // 打开画布本身会触发一次 onChange，那次不算改动。
      if (!armed.current) {
        armed.current = true;
        lastSaved.current = sig;
        return;
      }
      if (sig === lastSaved.current) return;
      setState('idle');
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void run(), SAVE_DELAY);
    },
    [run],
  );

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  if (!files) return <EmptyState tone="loading" title="读取画面…" />;

  return (
    <div className="relative h-full w-full">
      <Suspense fallback={<EmptyState tone="loading" title="加载画板…" />}>
        <Excalidraw
          theme="dark"
          langCode="zh-CN"
          initialData={
            {
              elements: scene.elements ?? [],
              appState: { theme: 'dark' },
              files,
            } as unknown as InitialData
          }
          excalidrawAPI={(instance) => {
            editor.current = instance;
          }}
          onChange={change}
        />
      </Suspense>
      <span className="pointer-events-none absolute right-3 bottom-2 text-meta text-fg-3">
        {state === 'saving' ? '保存中…' : null}
        {state === 'saved' ? '已保存' : null}
        {state === 'error' ? '保存失败，接着画还会再试' : null}
      </span>
    </div>
  );
}
