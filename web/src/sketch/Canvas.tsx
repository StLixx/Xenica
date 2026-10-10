import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';

import type { Node } from '../api/client';
import { sketchBody, uploadImage, useHealth } from '../api/queries';
import { Button, EmptyState, TextInput } from '../ui';
import { EmbedCard } from './EmbedCard';
import { ASIDE_URL, embedSource, pageURL, type EmbedSource } from './embed';
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
  const health = useHealth();
  const [panel, setPanel] = useState(false);
  const [url, setURL] = useState('');
  const [error, setError] = useState('');
  const [selectedEmbed, setSelectedEmbed] = useState<string | null>(null);
  const [activeEmbed, setActiveEmbed] = useState<string | null>(null);

  const exitEmbed = () => {
    editor.current?.updateScene({ appState: { activeEmbeddable: null } });
    editor.current?.setActiveTool({ type: 'selection' });
  };

  const addEmbed = async (kind: 'react' | 'page', address?: string) => {
    const live = editor.current;
    if (!live) return;
    const link = kind === 'react' ? ASIDE_URL : pageURL(address ?? url);
    if (!link) {
      setError('请输入不含登录凭据或分享令牌的 HTTPS 网页地址。');
      return;
    }
    const { convertToExcalidrawElements } = await import('@excalidraw/excalidraw');
    const appState = live.getAppState();
    const offset =
      (live.getSceneElements().filter((element) => element.type === 'embeddable').length % 6) * 36;
    const source: EmbedSource = {
      schema: 1,
      kind,
      title: kind === 'react' ? '共享侧栏' : new URL(link).hostname,
      url: link,
      revision: health.data?.commit || `v${health.data?.version ?? '未标记'}`,
      ...(kind === 'react' ? { component: 'PeekAside', source: 'web/src/ui/PeekAside.tsx' } : {}),
    };
    const added = convertToExcalidrawElements([
      {
        type: 'rectangle',
        x: -appState.scrollX + appState.width / appState.zoom.value / 2 - 240 + offset,
        y: -appState.scrollY + appState.height / appState.zoom.value / 2 - 180 + offset,
        width: 480,
        height: 360,
        link,
        customData: { xenicaEmbed: source },
      },
    ]);
    const first = added[0];
    if (!first || first.type !== 'rectangle') return;
    const card = { ...first, type: 'embeddable' as const };
    live.updateScene({
      elements: [...live.getSceneElements(), card],
      appState: { selectedElementIds: { [first.id]: true }, activeEmbeddable: null },
    });
    live.setActiveTool({ type: 'selection' });
    setPanel(false);
    setError('');
  };

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
    (elements, appState, fileMap) => {
      const selected = elements.filter((el) => appState.selectedElementIds[el.id]);
      setSelectedEmbed(
        selected.length === 1 && selected[0]?.type === 'embeddable' ? selected[0].id : null,
      );
      setActiveEmbed(
        appState.activeEmbeddable?.state === 'active' ? appState.activeEmbeddable.element.id : null,
      );
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
          validateEmbeddable={(link) => link === ASIDE_URL || pageURL(link) !== null}
          renderEmbeddable={(element, appState) => (
            <EmbedCard
              id={element.id}
              source={embedSource(element)}
              active={
                appState.activeEmbeddable?.element.id === element.id &&
                appState.activeEmbeddable.state === 'active'
              }
              exit={exitEmbed}
            />
          )}
          renderTopRightUI={() => (
            <div className="flex gap-2">
              {activeEmbed ? (
                <Button onClick={exitEmbed}>返回画布</Button>
              ) : (
                <Button
                  disabled={!selectedEmbed}
                  onClick={() => {
                    const element = editor.current
                      ?.getSceneElements()
                      .find((el) => el.id === selectedEmbed);
                    if (element)
                      editor.current?.updateScene({
                        appState: { activeEmbeddable: { element, state: 'active' } },
                      });
                  }}
                >
                  操作选中卡片
                </Button>
              )}
              <Button onClick={() => setPanel((open) => !open)}>嵌入内容</Button>
            </div>
          )}
        />
      </Suspense>
      {panel ? (
        <div className="absolute top-16 right-3 z-40 flex w-80 flex-col gap-2 rounded-lg border border-line bg-pop p-3 shadow-pop">
          <p className="text-strong">放入真实内容</p>
          <p className="text-meta text-fg-2">
            选中卡片后点「操作选中卡片」。退出交互后可拖动、缩放和批注。
          </p>
          <Button onClick={() => void addEmbed('react')}>共享侧栏组件</Button>
          <Button
            onClick={() => {
              const app = new URL(window.location.origin);
              app.hostname = app.hostname.replace(/^excalidraw\./, '');
              void addEmbed('page', app.href);
            }}
          >
            本次 Xenica 页面
          </Button>
          <Button
            onClick={() =>
              void addEmbed(
                'page',
                'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
              )
            }
          >
            视频样例
          </Button>
          <TextInput
            aria-label="嵌入网页地址"
            placeholder="https://…"
            value={url}
            onChange={(e) => setURL(e.target.value)}
          />
          {error ? (
            <p role="alert" className="text-meta text-danger">
              {error}
            </p>
          ) : null}
          <Button onClick={() => void addEmbed('page')}>添加网页</Button>
          <Button variant="ghost" onClick={() => setPanel(false)}>
            关闭
          </Button>
        </div>
      ) : null}
      <span className="pointer-events-none absolute right-3 bottom-2 text-meta text-fg-3">
        {state === 'saving' ? '保存中…' : null}
        {state === 'saved' ? '已保存' : null}
        {state === 'error' ? '保存失败，接着画还会再试' : null}
      </span>
    </div>
  );
}
