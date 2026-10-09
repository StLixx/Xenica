import { memo, type MouseEvent } from 'react';

import { renderMarkdown } from './markdown';

/**
 * 渲染一段正文。点到 `#标记`、`[[名字]]` 时调用 onRef（不会触发外层的点击）。
 */
export const Markdown = memo(function Markdown({
  md,
  onRef,
  className = '',
}: {
  md: string;
  onRef?: (name: string) => void;
  className?: string;
}) {
  const click = (e: MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest('a');
    if (!a) return;
    e.stopPropagation();
    const name = a.getAttribute('data-ref');
    if (name !== null) {
      e.preventDefault();
      onRef?.(name);
    }
  };
  return (
    <div
      className={`x-md ${className}`}
      onClick={click}
      // 已经过 DOMPurify 清洗（见 markdown.ts）
      dangerouslySetInnerHTML={{ __html: renderMarkdown(md) }}
    />
  );
});
