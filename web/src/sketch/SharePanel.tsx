import { useState } from 'react';

import { useCreateShare, useRevokeShare, useShares } from '../api/queries';
import { Button } from '@excalidraw/excalidraw';

/**
 * 分享链接：给 AI 读的、给 AI 改的。
 * 「能读」的地址打开就是整理好的文字说明，不用登录——这是让 AI 读懂画面的关键，
 * 因为 excalidraw.com 的分享链接和 Notion 的嵌入对 AI 都是不透明的。
 */
export function SharePanel({ node }: { node: string }) {
  const shares = useShares(node);
  const create = useCreateShare(node);
  const revoke = useRevokeShare(node);
  const [copied, setCopied] = useState('');
  const live = (shares.data ?? []).filter((s) => !s.revoked_at);

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
    } catch {
      setCopied('复制失败：手动选中复制');
    }
  };

  return (
    <div className="xenica-panel">
      <p className="xenica-text">给 AI 看</p>
      <p className="xenica-text">
        打开链接就是这段画面的文字说明，不用登录。「能改」的那条还能让 AI 把新画面写回来。
      </p>
      {/* 竖排：卡片只有 240 宽，两个按钮并排放不下，右边那个会顶到屏幕外。 */}
      <div className="mt-2 flex flex-col gap-1.5">
        <Button
          className="w-full justify-center"
          onSelect={() => create.mutate('read')}
          disabled={create.isPending}
        >
          新建「能读」链接
        </Button>
        <Button
          className="w-full justify-center"
          onSelect={() => create.mutate('write')}
          disabled={create.isPending}
        >
          新建「能改」链接
        </Button>
      </div>
      {create.error ? <p className="xenica-text">{create.error.message}</p> : null}
      <ul className="mt-3 flex flex-col gap-2">
        {live.map((s) => (
          <li key={s.id} className="xenica-text">
            <div className="flex items-center justify-between gap-2">
              <span className="xenica-text">{s.mode === 'write' ? '能读能改' : '只能读'}</span>
              <div className="flex gap-1">
                <Button onSelect={() => void copy(s.url)}>复制</Button>
                <Button onSelect={() => revoke.mutate(s.id)} disabled={revoke.isPending}>
                  作废
                </Button>
              </div>
            </div>
            <p className="xenica-text" title={copied === s.url ? undefined : s.url}>
              {copied === s.url ? '已复制到剪贴板' : s.url}
            </p>
          </li>
        ))}
        {live.length === 0 && !shares.isPending ? (
          <li className="xenica-text">还没有链接。给 AI 读一张图，就从这里复制地址。</li>
        ) : null}
      </ul>
    </div>
  );
}
