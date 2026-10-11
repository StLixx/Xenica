import { useRef, useState } from 'react';

import type { Node } from '../api/client';
import { saveSketch, uploadImage, useHealth } from '../api/queries';
import { Button, TextInput } from '../ui';

/** 设计说明与真实截图属于画布数据；编辑需和画布保存一样检查版本。 */
export function ContextPanel({ node, close }: { node: Node; close: () => void }) {
  const body = node.body as Record<string, unknown>;
  const context = (body.context ?? {}) as Record<string, unknown>;
  const [intent, setIntent] = useState(String(context.intent ?? ''));
  const [element, setElement] = useState('');
  const [source, setSource] = useState(`${window.location.origin}/sketch/${node.id}`);
  const [revision, setRevision] = useState(node.updated_at);
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const health = useHealth();

  const store = async () => {
    setBusy(true);
    try {
      const evidence = [...((body.evidence ?? []) as unknown[])];
      if (file) {
        const image = await createImageBitmap(file);
        const size = { width: image.width, height: image.height };
        image.close();
        const url = await uploadImage(file);
        evidence.push({
          file: url.split('/').pop(),
          elementId: element || null,
          source,
          revision,
          imageSize: size,
          viewport: '未核实；尺寸为截图像素',
          commit: health.data?.commit ?? '',
          capturedAt: new Date().toISOString(),
        });
      }
      await saveSketch(
        node.id,
        {
          ...body,
          context: {
            ...context,
            intent,
            repo: 'https://github.com/StLixx/Xenica',
            preview: window.location.origin,
            commit: health.data?.commit ?? '',
            authorization: '读链接只读；写入需单独授权并检查版本',
          },
          evidence,
        } as unknown as Record<string, never>,
        node.updated_at,
      );
      setMessage('设计说明与截图已保存');
      setFile(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex max-h-96 w-80 flex-col gap-2 overflow-y-auto rounded-md border border-line bg-pop p-3 shadow-pop">
      <p className="text-strong">设计上下文</p>
      <p className="text-meta text-fg-2">
        保存目标、已确认决定、待确认事项和下一步，供新会话读取。
      </p>
      <textarea
        aria-label="设计说明"
        value={intent}
        onChange={(e) => setIntent(e.target.value)}
        className="min-h-32 rounded-sm bg-hover p-2 text-body text-fg"
      />
      <p className="text-meta text-fg-2">
        真实截图与结构 PNG 分开保存。请填写截图实际对应的来源和版本。
      </p>
      <details>
        <summary className="item">截图来源与版本</summary>
        <TextInput
          aria-label="截图关联元素 ID"
          placeholder="元素 ID（整图可留空）"
          value={element}
          onChange={(e) => setElement(e.target.value)}
        />
        <TextInput
          aria-label="截图来源"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        />
        <TextInput
          aria-label="截图对应版本"
          value={revision}
          onChange={(e) => setRevision(e.target.value)}
        />
      </details>
      <input
        ref={fileInput}
        className="sr-only"
        type="file"
        aria-label="真实截图"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <Button onClick={() => fileInput.current?.click()}>添加真实截图</Button>
      {file ? (
        <p className="truncate text-meta text-fg-2" title={file.name}>
          {file.name}
        </p>
      ) : null}
      <Button disabled={busy} onClick={() => void store()}>
        保存设计上下文
      </Button>
      <a href={`/api/nodes/${node.id}/archive`} download className="text-label text-accent">
        导出可迁移档案（含历史与原图）
      </a>
      <p className="text-meta text-fg-3">
        长期设计保存在正式草图站；预览中的内容需先归档迁移。档案不含分享令牌。
      </p>
      {message ? (
        <p role="status" className="text-meta text-fg-2">
          {message}
        </p>
      ) : null}
      <Button variant="ghost" onClick={close}>
        关闭设计上下文
      </Button>
    </div>
  );
}
