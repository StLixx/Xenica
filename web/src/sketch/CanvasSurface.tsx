import { Excalidraw, Button, Footer, MainMenu } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { ArrowLeft, FolderOpen, Link, MousePointer2, NotebookPen, Share2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError } from '../api/client';
import {
  sketchBody,
  createNode,
  readSketch,
  readImage,
  uploadImage,
  useHealth,
} from '../api/queries';
import { EmptyState } from '../ui';
import { CanvasPanels } from './CanvasPanels';
import { EmbedCard } from './EmbedCard';
import { DevelopmentPanel } from './DevelopmentPanel';
import { clearDraft, readDraft, writeDraft, type DraftFile } from './draft';
import { ASIDE_URL, embedSource, pageURL, type EmbedSource } from './embed';
import type { Scene, SceneElement } from './scene';
import { dataURLtoBlob, fileIdsOf, sceneOf, signature } from './scene';

import './canvas.css';
import type { CanvasProps } from './types';
import { NativeToolButton } from './upstream/ToolButton';

type ExcalidrawProps = React.ComponentProps<typeof Excalidraw>;
type Editor = Parameters<NonNullable<ExcalidrawProps['excalidrawAPI']>>[0];
type InitialData = NonNullable<ExcalidrawProps['initialData']>;
type LoadedFile = DraftFile;

/** 停手之后再写库，别每按一个键就写一次。 */
const SAVE_DELAY = 800;
const SAVE_RETRY_DELAY = 2000;

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
export default function CanvasSurface({ node, save, ...management }: CanvasProps) {
  const scene = sceneOf(node);
  const [draft] = useState(() => readDraft(node.id));
  const [initialScene] = useState(() => draft?.scene ?? scene);
  const editor = useRef<Editor | null>(null);
  const uploaded = useRef<Record<string, string>>({});
  const savedImage = useRef<string | undefined>(undefined);
  const lastSaved = useRef(signature(scene.elements ?? [], fileIdsOf(scene).length));
  const lastObserved = useRef('');
  const armed = useRef(false);
  const timer = useRef<number | null>(null);
  const revision = useRef(draft?.revision ?? node.updated_at);
  const [visibleRevision, setVisibleRevision] = useState(node.updated_at);
  const bodyRef = useRef(node.body);
  const busy = useRef(false);
  const saveRetries = useRef(0);
  const dirty = useRef(Boolean(draft));
  const draftDurable = useRef(Boolean(draft));
  const conflicted = useRef(Boolean(draft && draft.revision !== node.updated_at));
  const [conflict, setConflict] = useState(Boolean(draft && draft.revision !== node.updated_at));
  const [draftSaved, setDraftSaved] = useState(false);
  const [files, setFiles] = useState<Record<string, LoadedFile> | null>(null);
  const [editorReady, setEditorReady] = useState(false);
  const [state, setState] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>(
    draft ? 'pending' : 'idle',
  );
  const health = useHealth();
  const [url, setURL] = useState('');
  const [error, setError] = useState('');
  const [selectedEmbed, setSelectedEmbed] = useState<string | null>(null);
  const [activeEmbed, setActiveEmbed] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<string | null>(null);
  const cacheDraft = useCallback(() => {
    const live = editor.current;
    if (!live) return;
    draftDurable.current = writeDraft(node.id, {
      schema: 1,
      revision: revision.current,
      scene: {
        type: 'excalidraw',
        version: 2,
        source: 'xenica',
        elements: live.getSceneElements() as unknown as SceneElement[],
      },
      files: live.getFiles() as unknown as Record<string, LoadedFile>,
    });
  }, [node.id]);
  const togglePanel = (tab: string) => {
    const current = editor.current?.getAppState().openSidebar;
    editor.current?.toggleSidebar({
      name: 'xenica',
      tab,
      force: current?.name !== 'xenica' || current.tab !== tab,
    });
  };

  useEffect(() => {
    if (conflict) editor.current?.toggleSidebar({ name: 'xenica', tab: 'context', force: true });
  }, [conflict, editorReady]);

  useEffect(() => {
    if (
      node.updated_at === revision.current ||
      Date.parse(node.updated_at) < Date.parse(revision.current) ||
      busy.current ||
      !editor.current
    )
      return;
    if (dirty.current) {
      conflicted.current = true;
      setConflict(true);
      if (timer.current !== null) window.clearTimeout(timer.current);
      return;
    }
    revision.current = node.updated_at;
    setVisibleRevision(node.updated_at);
    bodyRef.current = node.body;
    const elements = sceneOf(node).elements ?? [];
    lastSaved.current = signature(elements, Object.keys(editor.current.getFiles()).length);
    editor.current.updateScene({
      elements: elements as unknown as Parameters<Editor['updateScene']>[0]['elements'],
    });
  }, [node]);

  const keepDraft = async () => {
    const live = editor.current;
    if (!live) return;
    for (const [id, file] of Object.entries(live.getFiles())) {
      if (!uploaded.current[id])
        uploaded.current[id] =
          (await uploadImage(await dataURLtoBlob(file.dataURL))).split('/').pop() ?? '';
    }
    const elements = live.getSceneElements().map((element) => {
      const next = { ...element } as unknown as SceneElement;
      if (next.fileId) next.fileId = uploaded.current[next.fileId] ?? next.fileId;
      return next;
    });
    const body = {
      ...bodyRef.current,
      ...sketchBody({ type: 'excalidraw', version: 2, source: 'xenica', elements }),
    } as Record<string, never>;
    delete body.image;
    delete body.purpose; // 冲突草稿保留内容，不复制唯一开发画板身份。
    await createNode({ kind: 'sketch', title: `${node.title || '草图'} · 冲突草稿`, body });
    setDraftSaved(true);
  };

  const exitEmbed = () => {
    editor.current?.updateScene({ appState: { activeEmbeddable: null } });
    editor.current?.setActiveTool({ type: 'selection' });
  };

  const addEmbed = async (kind: 'react' | 'page' | 'runtime', address?: string, title?: string) => {
    const live = editor.current;
    if (!live) return;
    const link =
      kind === 'react'
        ? ASIDE_URL
        : kind === 'runtime'
          ? `https://xenica.invalid/versions/${address}`
          : pageURL(address ?? url);
    if (!link) {
      setError('请输入不含登录凭据或分享令牌的 HTTPS 网页地址。');
      return;
    }
    const existing = live.getSceneElements().find((element) => {
      const source = embedSource(element);
      return (
        source?.kind === kind && source.url === link && source.revision === health.data?.commit
      );
    });
    if (existing) {
      live.scrollToContent(existing);
      live.updateScene({ appState: { selectedElementIds: { [existing.id]: true } } });
      live.toggleSidebar({ name: 'xenica', force: false });
      return;
    }
    const { convertToExcalidrawElements } = await import('@excalidraw/excalidraw');
    const appState = live.getAppState();
    const offset =
      (live.getSceneElements().filter((element) => element.type === 'embeddable').length % 6) * 36;
    const source: EmbedSource = {
      schema: 1,
      kind,
      title: title ?? (kind === 'react' ? '共享侧栏' : new URL(link).hostname),
      url: link,
      revision: health.data?.commit || `v${health.data?.version ?? '未标记'}`,
      ...(kind === 'react' ? { component: 'PeekAside', source: 'web/src/ui/PeekAside.tsx' } : {}),
      ...(kind === 'runtime' ? { version: address } : {}),
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
    live.toggleSidebar({ name: 'xenica', force: false });
    setError('');
  };

  const addNote = async (text: string, id: string, source: string) => {
    const live = editor.current;
    if (!live) return;
    const existing = live
      .getSceneElements()
      .find((el) => (el.customData?.xenicaContext as { id?: string } | undefined)?.id === id);
    if (existing) {
      live.scrollToContent(existing);
      return;
    }
    const { convertToExcalidrawElements } = await import('@excalidraw/excalidraw');
    const app = live.getAppState();
    const elements = convertToExcalidrawElements([
      {
        type: 'rectangle',
        x: -app.scrollX + app.width / app.zoom.value / 2 - 240,
        y: -app.scrollY + app.height / app.zoom.value / 2 - 180,
        width: 480,
        height: 180,
        label: { text },
        customData: { xenicaContext: { id, source, type: 'confirmed-decision' } },
      },
    ]);
    live.updateScene({ elements: [...live.getSceneElements(), ...elements] });
    live.toggleSidebar({ name: 'xenica', force: false });
  };

  // 画面里的图存在库里，打开时按原样取回来。
  useEffect(() => {
    let alive = true;
    void (async () => {
      const out: Record<string, LoadedFile> = { ...draft?.files };
      for (const id of new Set([...fileIdsOf(initialScene), ...fileIdsOf(scene)])) {
        if (out[id]) continue;
        try {
          const blob = await readImage(id);
          out[id] = {
            id,
            mimeType: blob.type || 'image/png',
            dataURL: await blobToDataURL(blob),
            created: Date.now(),
          };
          uploaded.current[id] = id;
        } catch {
          // 取不到就少一张图，不影响继续画
        }
      }
      if (alive) {
        const live = editor.current;
        if (live && !dirty.current && !conflicted.current) {
          lastSaved.current = signature(
            live.getSceneElements(),
            new Set([...Object.keys(live.getFiles()), ...Object.keys(out)]).size,
          );
          live.addFiles(Object.values(out) as unknown as Parameters<Editor['addFiles']>[0]);
        }
        setFiles(out);
      }
    })();
    return () => {
      alive = false;
    };
  }, [scene, initialScene, draft]);

  const run = useCallback(
    async function persist() {
      const live = editor.current;
      if (!live || busy.current || conflicted.current) return;
      const snapshot = live.getSceneElements();
      const snapshotSig = signature(snapshot, Object.keys(live.getFiles()).length);
      if (snapshotSig === lastSaved.current) return;
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
      busy.current = true;
      const expected = revision.current;
      let succeeded = false;
      setState('saving');
      try {
        const live_files = live.getFiles();
        for (const [editorId, file] of Object.entries(live_files)) {
          if (uploaded.current[editorId]) continue;
          try {
            const url = await uploadImage(await dataURLtoBlob(file.dataURL));
            uploaded.current[editorId] = url.split('/').pop() ?? '';
          } catch {
            // 原图缺失时保留本地画面，不保存一个无法完整恢复的档案。
            throw new Error('原图上传未完成，请重试保存');
          }
        }
        const elements: SceneElement[] = snapshot.map((element) => {
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
        let image: string | undefined;
        try {
          const { exportToBlob, convertToExcalidrawElements } =
            await import('@excalidraw/excalidraw');
          const structure = snapshot.flatMap((element) => {
            if (element.type !== 'embeddable') return [element];
            const source = embedSource(element);
            return convertToExcalidrawElements(
              [
                {
                  ...element,
                  type: 'rectangle',
                  link: null,
                  label: {
                    text: `结构占位：${source?.title ?? '未知嵌入'}\n类型：${source?.kind ?? '未知'}\n来源：${source?.source ?? source?.url ?? '未标记'}\n元素：${element.id}\n版本：${source?.revision ?? '未标记'}\n真实内容请读取独立截图证据`,
                  },
                },
              ],
              { regenerateIds: false },
            );
          });
          const blob = await exportToBlob({
            elements: structure,
            appState: { ...live.getAppState(), exportBackground: true },
            files: live_files,
            mimeType: 'image/png',
            exportPadding: 16,
          });
          const url = await uploadImage(new File([blob], 'sketch.png', { type: 'image/png' }));
          image = url.split('/').pop();
        } catch {
          // 新画面导不出图时明确保留上一版，不能假装是当前图片。
        }
        const next: Scene = { type: 'excalidraw', version: 2, source: 'xenica', elements };
        const body = { ...bodyRef.current, ...sketchBody(next, image) } as Record<string, never>;
        if (!image) {
          delete body.image;
          const previous = savedImage.current ?? (bodyRef.current as { image?: string }).image;
          if (previous)
            Object.assign(body, { previousImage: { file: previous, revision: expected } });
        }
        const saved = await save(body, expected);
        revision.current = saved.updated_at;
        setVisibleRevision(saved.updated_at);
        bodyRef.current = saved.body;
        savedImage.current = image;
        lastSaved.current = snapshotSig;
        dirty.current =
          signature(live.getSceneElements(), Object.keys(live.getFiles()).length) !== snapshotSig;
        if (dirty.current) cacheDraft();
        else {
          clearDraft(node.id);
          draftDurable.current = false;
        }
        succeeded = true;
        saveRetries.current = 0;
        setState(dirty.current ? 'pending' : 'saved');
      } catch (error) {
        saveRetries.current = Math.min(saveRetries.current + 1, 5);
        if (error instanceof ApiError && error.code === 'conflict') {
          conflicted.current = true;
          setConflict(true);
        }
        setState('error');
      } finally {
        busy.current = false;
        if (dirty.current && !conflicted.current) {
          if (timer.current !== null) window.clearTimeout(timer.current);
          const delay = succeeded
            ? SAVE_DELAY
            : Math.min(30_000, SAVE_RETRY_DELAY * 2 ** (saveRetries.current - 1));
          timer.current = window.setTimeout(() => void persist(), delay);
        }
      }
    },
    [save, cacheDraft, node.id],
  );

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
        if (!dirty.current) {
          lastSaved.current = sig;
          lastObserved.current = sig;
          return;
        }
      }
      // 选中、搜索、鼠标移动的通知不能反复推迟尚未完成的保存。
      if (sig === lastObserved.current) return;
      lastObserved.current = sig;
      dirty.current = conflicted.current || busy.current || sig !== lastSaved.current;
      if (!dirty.current) {
        clearDraft(node.id);
        setState('saved');
        return;
      }
      cacheDraft();
      if (conflicted.current) return;
      saveRetries.current = 0;
      setState('pending');
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void run(), SAVE_DELAY);
    },
    [run, cacheDraft, node.id],
  );

  useEffect(() => {
    const leaving = (event: BeforeUnloadEvent) => {
      if (dirty.current && !draftDurable.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    const retry = () => {
      saveRetries.current = 0;
      if (dirty.current) void run();
    };
    window.addEventListener('beforeunload', leaving);
    window.addEventListener('online', retry);
    return () => {
      window.removeEventListener('beforeunload', leaving);
      window.removeEventListener('online', retry);
    };
  }, [run]);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  if (!files) return <EmptyState tone="loading" title="读取画面…" />;

  return (
    <div className="relative h-full w-full" data-testid="sketch-workspace">
      <Excalidraw
        theme="dark"
        name={node.title || '无标题'}
        langCode="zh-CN"
        initialData={
          {
            elements: initialScene.elements ?? [],
            appState: { theme: 'dark' },
            files,
          } as unknown as InitialData
        }
        excalidrawAPI={(instance) => {
          editor.current = instance;
          setEditorReady(true);
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
            openPage={management.openPage}
          />
        )}
        renderTopRightUI={(_mobile, appState) =>
          appState.zenModeEnabled ? null : (
            <div
              className="xenica-tools sidebar-trigger Island App-toolbar-container"
              role="toolbar"
              aria-label="画布扩展工具"
            >
              {activeEmbed ? (
                <NativeToolButton
                  className="xenica-tool"
                  title="返回画布"
                  aria-label="返回画布"
                  onSelect={exitEmbed}
                >
                  <ArrowLeft />
                </NativeToolButton>
              ) : (
                <NativeToolButton
                  className="xenica-tool"
                  title="操作选中卡片"
                  aria-label="操作选中卡片"
                  disabled={!selectedEmbed}
                  onSelect={() => {
                    const element = editor.current
                      ?.getSceneElements()
                      .find((el) => el.id === selectedEmbed);
                    if (element)
                      editor.current?.updateScene({
                        appState: { activeEmbeddable: { element, state: 'active' } },
                      });
                  }}
                >
                  <MousePointer2 />
                </NativeToolButton>
              )}
              <NativeToolButton
                className="xenica-tool"
                selected={sidebarTab === 'embed'}
                title="嵌入内容"
                aria-label="嵌入内容"
                onSelect={() => togglePanel('embed')}
              >
                <Link />
              </NativeToolButton>
              <NativeToolButton
                className="xenica-tool"
                selected={sidebarTab === 'share'}
                title="分享给 AI"
                aria-label="分享给 AI"
                onSelect={() => togglePanel('share')}
              >
                <Share2 />
              </NativeToolButton>
              <NativeToolButton
                className="xenica-tool"
                selected={sidebarTab === 'context'}
                title="设计上下文"
                aria-label="设计上下文"
                onSelect={() => togglePanel('context')}
              >
                <NotebookPen />
              </NativeToolButton>
              <NativeToolButton
                className="xenica-tool"
                selected={sidebarTab === 'boards'}
                title="画布管理"
                aria-label="画布管理"
                onSelect={() => togglePanel('boards')}
              >
                <FolderOpen />
              </NativeToolButton>
            </div>
          )
        }
      >
        <MainMenu>
          <MainMenu.Item
            icon={<FolderOpen />}
            onSelect={() =>
              editor.current?.toggleSidebar({ name: 'xenica', tab: 'boards', force: true })
            }
          >
            画布管理
          </MainMenu.Item>
          <MainMenu.Item
            icon={<Share2 />}
            onSelect={() =>
              editor.current?.toggleSidebar({ name: 'xenica', tab: 'share', force: true })
            }
          >
            分享给 AI
          </MainMenu.Item>
          <MainMenu.Item
            icon={<Link />}
            onSelect={() =>
              editor.current?.toggleSidebar({ name: 'xenica', tab: 'embed', force: true })
            }
          >
            嵌入内容
          </MainMenu.Item>
          <MainMenu.Item
            icon={<NotebookPen />}
            onSelect={() =>
              editor.current?.toggleSidebar({ name: 'xenica', tab: 'context', force: true })
            }
          >
            设计上下文
          </MainMenu.Item>
          <MainMenu.Item
            icon={<MousePointer2 />}
            disabled={!selectedEmbed && !activeEmbed}
            onSelect={() => {
              if (activeEmbed) exitEmbed();
              else {
                const element = editor.current
                  ?.getSceneElements()
                  .find((el) => el.id === selectedEmbed);
                if (element)
                  editor.current?.updateScene({
                    appState: { activeEmbeddable: { element, state: 'active' } },
                  });
              }
            }}
          >
            {activeEmbed ? '返回画布' : '操作选中卡片'}
          </MainMenu.Item>
          <MainMenu.Separator />
          <MainMenu.DefaultItems.LoadScene />
          <MainMenu.DefaultItems.SaveToActiveFile />
          <MainMenu.DefaultItems.Export />
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.SearchMenu />
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.Separator />
          <MainMenu.DefaultItems.Help />
        </MainMenu>
        <Footer>
          <span className="xenica-save-state" title={`版本 ${visibleRevision}`}>
            {state === 'saving'
              ? '保存中…'
              : state === 'saved'
                ? '已保存'
                : state === 'error' && !conflict
                  ? '保存失败，将自动重试'
                  : state === 'pending'
                    ? '等待保存…'
                    : null}
          </span>
          {conflict ? (
            <Button
              onSelect={() =>
                editor.current?.toggleSidebar({ name: 'xenica', tab: 'context', force: true })
              }
            >
              画布有更新
            </Button>
          ) : null}
        </Footer>
        <CanvasPanels
          node={node}
          {...management}
          onTabChange={setSidebarTab}
          directory={
            <DevelopmentPanel add={addEmbed} note={addNote} openPage={management.openPage} />
          }
          embed={
            <div className="xenica-panel">
              <h2>放入真实内容</h2>
              <p>选中卡片后点「操作选中卡片」。退出交互后可拖动、缩放和批注。</p>
              <Button onSelect={() => void addEmbed('react')}>共享侧栏组件</Button>
              <Button
                onSelect={() => {
                  const app = new URL(window.location.origin);
                  app.hostname = app.hostname.replace(/^excalidraw\./, '');
                  void addEmbed('page', app.href);
                }}
              >
                本次 Xenica 页面
              </Button>
              <Button
                onSelect={() =>
                  void addEmbed(
                    'page',
                    'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
                  )
                }
              >
                视频样例
              </Button>
              <input
                className="xenica-input"
                type="url"
                aria-label="嵌入网页地址"
                placeholder="https://…"
                value={url}
                onChange={(e) => setURL(e.target.value)}
              />
              {error ? <p role="alert">{error}</p> : null}
              <Button onSelect={() => void addEmbed('page')}>添加网页</Button>
            </div>
          }
          conflict={
            conflict ? (
              <div role="alert" className="xenica-panel">
                <p>画布已被更新，本次修改未覆盖新版</p>
                <p>你的画面仍在这里。先另存草稿，再加载新版进行比较。</p>
                <Button
                  onSelect={() => void keepDraft().catch(() => setState('error'))}
                  disabled={draftSaved}
                >
                  {draftSaved ? '草稿已另存' : '另存我的草稿'}
                </Button>
                <Button
                  disabled={!draftSaved}
                  onSelect={() =>
                    void readSketch(node.id).then(() => {
                      clearDraft(node.id);
                      window.location.reload();
                    })
                  }
                >
                  加载新版
                </Button>
              </div>
            ) : null
          }
        />
      </Excalidraw>
    </div>
  );
}
