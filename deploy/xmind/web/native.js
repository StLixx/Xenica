// 原厂模块只由宿主的私有静态资源目录提供；不把第三方发布文件放进仓库。
const CORE_URL = '/mjs.chunk.XnVMm1_0.js';
let corePromise;
let zipPromise;

let clipboardWriteVersion = 0;
let clipboardWriteTask = Promise.resolve();

async function readBrowserClipboard() {
  if (!navigator.clipboard) throw new Error('当前浏览器不支持剪贴板，请使用 HTTPS 并允许访问');
  if (!navigator.clipboard.read) {
    if (!navigator.clipboard.readText) throw new Error('当前浏览器不支持读取剪贴板');
    return { text: await navigator.clipboard.readText(), html: '' };
  }
  const items = await navigator.clipboard.read();
  let text = '';
  let html = '';
  let image;
  for (const item of items) {
    for (const type of item.types) {
      const blob = await item.getType(type);
      if (type === 'text/plain') text = await blob.text();
      else if (type === 'text/html') html = await blob.text();
      else if (!image && type.startsWith('image/')) {
        const extension = type === 'image/jpeg' ? 'jpg' : type === 'image/svg+xml' ? 'svg' : type.split('/')[1];
        image = new File([blob], `clipboard.${extension}`, { type });
      }
    }
  }
  // 与原厂一致：图片优先，避免同一剪贴板同时插入预览文字与图片。
  return { text: image ? '' : text, html, image };
}

async function pngClipboardImage(image) {
  if (image.type === 'image/png') return image;
  const url = URL.createObjectURL(image);
  try {
    const element = new Image();
    element.src = url;
    await element.decode();
    const canvas = document.createElement('canvas');
    canvas.width = element.naturalWidth;
    canvas.height = element.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法转换剪贴板图片');
    context.drawImage(element, 0, 0);
    return await new Promise((resolve, reject) => canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('无法转换剪贴板图片')),
      'image/png',
    ));
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function writeBrowserClipboard(data) {
  if (!navigator.clipboard) throw new Error('当前浏览器不支持剪贴板，请使用 HTTPS 并允许访问');
  if (!navigator.clipboard.write || !globalThis.ClipboardItem) {
    if (data.image || !navigator.clipboard.writeText) throw new Error('当前浏览器不支持复制图片');
    return navigator.clipboard.writeText(data.text || '');
  }
  const formats = {};
  if (data.text !== undefined) formats['text/plain'] = new Blob([data.text], { type: 'text/plain' });
  if (data.html) formats['text/html'] = new Blob([data.html], { type: 'text/html' });
  if (data.image) formats['image/png'] = await pngClipboardImage(data.image);
  if (!Object.keys(formats).length) formats['text/plain'] = new Blob([''], { type: 'text/plain' });
  await navigator.clipboard.write([new ClipboardItem(formats)]);
}

const clipboardBridge = {
  read: readBrowserClipboard,
  write: data => {
    clipboardWriteVersion += 1;
    clipboardWriteTask = writeBrowserClipboard(data);
    return clipboardWriteTask;
  },
};

async function loadCore() {
  if (!corePromise) {
    corePromise = import(CORE_URL).then(core => {
      const base = new URL('/assets/snowbird-resource/0.0.5/', location.origin).href;
      core.i.globalConfigSetup({
        assetsBaseURL: base,
        toAssetsUrl: path => new URL(path, base).href,
        clipboard: clipboardBridge,
      });
      return core;
    });
  }
  return corePromise;
}

async function loadZip() {
  if (!zipPromise) {
    zipPromise = import('/vendor-jszip.chunk.DWzA5t53.js').then(module => module.t());
  }
  return zipPromise;
}

function decodeResource(value) {
  const bytes = Uint8Array.from(atob(value), character => character.charCodeAt(0));
  return bytes.buffer;
}

function encodeResource(value) {
  const bytes = new Uint8Array(value);
  const parts = [];
  for (let index = 0; index < bytes.length; index += 32768) {
    parts.push(String.fromCharCode(...bytes.subarray(index, index + 32768)));
  }
  return btoa(parts.join(''));
}

function asArrayBuffer(value) {
  if (value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) {
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  }
  throw new TypeError('原生资源必须是二进制数据');
}

function resourceType(path) {
  const extension = path.split('.').pop().toLowerCase();
  return ({
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
    apng: 'image/apng', bmp: 'image/bmp', ico: 'image/x-icon',
  })[extension] || 'application/octet-stream';
}

function waitUntil(predicate, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const check = () => {
      if (predicate()) return resolve();
      if (performance.now() - started >= timeout) return reject(new Error('原生编辑器加载超时'));
      setTimeout(check, 25);
    };
    check();
  });
}

export async function createBlankSnapshot(title = '思维导图') {
  const core = await loadCore();
  const sheetId = crypto.randomUUID();
  const rootId = crypto.randomUUID();
  const document = core.i.DKdeserializeDocument([{
    id: sheetId,
    class: 'sheet',
    title,
    rootTopic: {
      id: rootId,
      class: 'topic',
      title: '中心主题',
      structureClass: 'org.xmind.ui.map.clockwise',
      children: {
        attached: Array.from({ length: 4 }, (_, index) => ({
          id: crypto.randomUUID(),
          title: `分支主题 ${index + 1}`,
        })),
      },
    },
  }], {});
  const styled = core.a.combineTheme(document.sheets[0], {
    colorTheme: core.a.getColorThemeById(core.o.NEW_FILE_DEFAULT_COLOR_THEME_ID),
    skeletonTheme: core.a.getSkeletonThemeById(core.o.NEW_FILE_DEFAULT_SKELETON_THEME_ID),
  }).ownerDocument;
  const serialized = core.i.DKserializeDocument(styled);
  return {
    schema: 1,
    native: { content: serialized.content, metadata: serialized.metadata },
    resources: {},
    view: { activeSheetId: sheetId },
  };
}

export async function openNative({ container, snapshot: initialSnapshot, id, onChange, onState }) {
  if (!(container instanceof HTMLElement)) throw new TypeError('缺少画布容器');
  const core = await loadCore();
  const input = initialSnapshot || await createBlankSnapshot();
  if (input.schema !== 1 || !Array.isArray(input.native?.content)) {
    throw new TypeError('无法识别文档格式');
  }
  let current = core.i.DKdeserializeDocument(input.native.content, input.native.metadata || {});
  if (!current.sheets.length) throw new Error('文档必须包含一个画布');
  const resources = new Map();
  const resourceURLs = new Map();
  for (const [path, base64] of Object.entries(input.resources || {})) {
    resources.set(path, { bytes: decodeResource(base64), base64 });
  }
  const symbol = Symbol(id);
  const native = core.l(symbol);
  const editor = core.c(symbol);
  const subscriptions = [];
  let disposed = false;
  let generation = 0;
  let suppressChanges = false;
  let notifyQueued = false;
  let importInProgress = false;

  function ensureActive() {
    if (disposed) throw new Error('编辑器已关闭');
  }

  function state() {
    return {
      ready: !!editor.activeSheetViewerInited.value,
      selection: editor.activeSheetViewerState.value?.selection ?? null,
      selectionInfo: editor.selection.value,
      actionStates: editor.actionStates.value,
      activeSheetId: editor.activeSheetId.value,
      zoomScale: editor.currentZoomScale.value,
      canUndo: !!editor.canUndo(),
      canRedo: !!editor.canRedo(),
      sheets: (editor.sheets.value || []).map(sheet => ({
        id: sheet.id, title: sheet.title || '画布', rootId: sheet.rootTopic.id,
      })),
    };
  }

  function notifyState() {
    if (disposed || notifyQueued) return;
    notifyQueued = true;
    queueMicrotask(() => {
      notifyQueued = false;
      if (!disposed) onState?.(state());
    });
  }

  function snapshot() {
    const serialized = core.i.DKserializeDocument(current);
    return {
      schema: 1,
      native: { content: serialized.content, metadata: serialized.metadata },
      // 保留当前文件会话内的资源，撤销删除图片时仍能恢复二进制内容。
      resources: Object.fromEntries([...resources].map(([path, resource]) => [path, resource.base64])),
      view: { activeSheetId: editor.activeSheetId.value || current.sheets[0].id },
    };
  }

  function revokeResourceURLs() {
    for (const url of resourceURLs.values()) URL.revokeObjectURL(url);
    resourceURLs.clear();
  }

  const stage = {
    getDocument: async () => current,
    setDocument: document => {
      if (disposed || !document || document === current) return;
      current = document;
      if (!suppressChanges) onChange?.(snapshot());
      notifyState();
    },
    take: async path => resources.get(path)?.bytes ?? null,
    add: async (path, data) => {
      ensureActive();
      const bytes = asArrayBuffer(data);
      const existingURL = resourceURLs.get(path);
      if (existingURL) {
        URL.revokeObjectURL(existingURL);
        resourceURLs.delete(path);
      }
      resources.set(path, { bytes, base64: encodeResource(bytes) });
    },
    // 与原厂宿主一致，资源删除不破坏撤销栈所引用的数据。
    delete: async () => {},
    toUrl: async path => {
      if (resourceURLs.has(path)) return resourceURLs.get(path);
      const resource = resources.get(path);
      if (!resource) return null;
      const url = URL.createObjectURL(new Blob([resource.bytes], { type: resourceType(path) }));
      resourceURLs.set(path, url);
      return url;
    },
  };

  function run(name, inputValue, payload) {
    ensureActive();
    if (importInProgress) throw new Error('文档正在导入，请稍候');
    const action = { name, inputValue, payload };
    if (['copy', 'cut', 'paste'].includes(name)) {
      return (async () => {
        // 文件菜单会拿走焦点；原生仅在 viewer 内有焦点时注册剪贴板 handler。
        if (!editor.isEditingTitle.value) {
          editor.activeSheetViewer.value?.focus();
          await new Promise(resolve => requestAnimationFrame(resolve));
        }
        ensureActive();
        if (editor.actionStates.value[name]?.disabled) throw new Error('请先在画布中选择操作位置');
        if (name !== 'paste') {
          const selected = editor.activeSheetViewerState.value?.selection;
          if (selected?.topics?.length) {
            const fragment = editor.activeSheet.value.queryList(selected.topics.map(id => ({ id }))).clone();
            for (const path of fragment.resources || []) {
              if (!resources.has(path)) throw new Error(`复制所需的图片或附件缺失：${path}`);
            }
          }
        }
        const waitClipboard = async (task, phase) => {
          let timer;
          try {
            return await Promise.race([
              task,
              new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error(`剪贴板操作超时（${phase}），请保持页面在前台后重试`)), 10000);
              }),
            ]);
          } finally {
            clearTimeout(timer);
          }
        };
        const writeVersion = clipboardWriteVersion;
        await waitClipboard(editor.executeActionAsync(action), name === 'paste' ? '读取并粘贴' : '准备原生片段');
        if (name !== 'paste') {
          if (clipboardWriteVersion === writeVersion) throw new Error('原生复制未产生新片段，请重新选择主题后重试');
          await waitClipboard(clipboardWriteTask, '写入系统剪贴板');
          // 原厂 copy handler 没有 await 最终写入；等其结构缓存事务完成后再允许粘贴。
          await waitClipboard(core.i.getGlobalConfig().localDB.getItem('xmind_clipboard'), '保存原生片段');
        }
      })();
    }
    if (name.startsWith('mutateProperty:')) return editor.executePropertyAction(action);
    if (name.startsWith('mutateEditor:')) return editor.executeEditorAction(action);
    if (name.startsWith('mutate:')) return editor.executeMutationAction(action);
    return editor.executeAction(action);
  }

  async function startEditingTitle() {
    ensureActive();
    const name = 'mutate:startEditingTopic';
    if (editor.isEditingTitle.value || editor.actionStates.value[name]?.disabled) return;
    run(name);
    // 原生先挂载并聚焦文字输入框；空格进入编辑时全选，后续输入仍交回原生处理。
    await new Promise(resolve => requestAnimationFrame(resolve));
    ensureActive();
    if (!editor.isEditingTitle.value) return;
    const input = container.ownerDocument.activeElement;
    if (!(input instanceof HTMLElement) || !container.contains(input) || !input.isContentEditable) return;
    const selection = container.ownerDocument.getSelection();
    if (!selection) return;
    const range = container.ownerDocument.createRange();
    range.selectNodeContents(input);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function select(ids) {
    return run('mutate:selectTopics', undefined, { topics: ids, centerOn: false });
  }

  async function addImage(file) {
    ensureActive();
    if (importInProgress) throw new Error('文档正在导入，请稍候');
    const imageGeneration = generation;
    if (!file || typeof file.arrayBuffer !== 'function') throw new TypeError('请选择图片');
    if (editor.actionStates.value['mutate:insertImage']?.disabled) throw new Error('请先选中要插入图片的主题');
    // xap 的压缩器只处理图片字节；资源写入必须绑定当前实例，不能使用原厂默认单例。
    const imageModule = await import('/xap-image.chunk.DdKUvsnD.js');
    const prepared = await imageModule.t(await file.arrayBuffer(), file.name || 'image.png');
    ensureActive();
    if (imageGeneration !== generation || importInProgress) throw new Error('文档已切换，请重新插入图片');
    const xapURL = await editor.createXapUrlByArrayBuffer(prepared.data, prepared.extName || '.png');
    ensureActive();
    if (imageGeneration !== generation || importInProgress) throw new Error('文档已切换，请重新插入图片');
    if (!xapURL) throw new Error('图片资源未能写入');
    run('mutate:insertImage', xapURL);
    return xapURL;
  }

  async function exportFile() {
    ensureActive();
    if (importInProgress) throw new Error('文档正在导入，请稍候');
    const exportDocument = current;
    const exportResources = new Map(resources);
    const JSZip = await loadZip();
    ensureActive();
    const archive = new JSZip();
    await core.i.documentKit.archiveXMindDocument(
      exportDocument,
      async (entry, text) => { archive.file(entry.path, text); },
      async entry => {
        const resource = exportResources.get(entry.path);
        if (!resource) throw new Error(`图片或附件资源缺失：${entry.path}`);
        archive.file(entry.path, resource.bytes);
      },
    );
    return archive.generateAsync({ type: 'arraybuffer', compression: 'STORE' });
  }

  async function importFile(arrayBuffer) {
    ensureActive();
    if (importInProgress) throw new Error('文档正在导入，请稍候');
    importInProgress = true;
    try {
      const JSZip = await loadZip();
      const xmind = await import('/xmind.chunk.CiVbhhD5.js');
      // 官方转换器保留其格式与加密校验；宿主不伪造账号、解密口令或许可状态。
      const normalizedFile = await xmind.t(asArrayBuffer(arrayBuffer));
      const archive = await JSZip.loadAsync(normalizedFile);
      const importedResources = new Map();
      const importedDocument = await core.i.documentKit.unarchiveXMindDocument(
        async entry => {
          const file = archive.file(entry.path);
          if (!file) return '{}';
          return file.async('string');
        },
        async entry => {
          const file = archive.file(entry.path);
          if (!file) throw new Error(`文件资源缺失：${entry.path}`);
          const bytes = await file.async('arraybuffer');
          importedResources.set(entry.path, { bytes, base64: encodeResource(bytes) });
        },
      );
      ensureActive();
      if (!importedDocument.sheets.length) throw new Error('导入文件没有可用画布');
      suppressChanges = true;
      try {
        revokeResourceURLs();
        resources.clear();
        for (const [path, resource] of importedResources) resources.set(path, resource);
        current = importedDocument;
        editor.setInitialSheetId(current.sheets[0].id);
        native.changeFile({ id: `${id}:import:${++generation}`, stage });
        await waitUntil(() => disposed || editor.document.value === current);
        ensureActive();
        await waitUntil(() => disposed || !!editor.activeSheetViewerInited.value);
        ensureActive();
      } finally {
        suppressChanges = false;
      }
      onChange?.(snapshot());
      notifyState();
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error || '无法导入此文件'));
    } finally {
      importInProgress = false;
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const subscription of subscriptions) subscription.unsubscribe();
    revokeResourceURLs();
    editor.dispose();
  }

  try {
    editor.changeLanguage('zh-CN');
    editor.setInitialSheetId(input.view?.activeSheetId || current.sheets[0].id);
    for (const observable of [
      native.$doc, native.$actionStates, native.$selection, native.$properties, native.$styles,
      native.$activeSheetId, native.$activeViewerViewportMetrics,
      native.$activeSheetViewerInited, native.$editorFirstRendered,
    ]) {
      if (observable) subscriptions.push(observable.subscribe(notifyState));
    }
    native.changeFile({ id, stage });
    native.setContainer(container);
    await waitUntil(() => editor.document.value === current && !!editor.activeSheetViewerInited.value);
    editor.markDocumentSaved();
    notifyState();
    return { editor, native, snapshot, run, select, startEditingTitle, addImage, exportFile, importFile, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
