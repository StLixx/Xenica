import type { ReactNode } from 'react';

/** 视图的空白 / 加载 / 出错状态。所有视图用同一个组件，样子统一。 */
export function EmptyState({
  title,
  hint,
  tone = 'empty',
  action,
}: {
  title: string;
  hint?: string;
  tone?: 'empty' | 'loading' | 'error';
  action?: ReactNode;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className="grid h-full place-items-center p-8"
    >
      <div className="flex max-w-sm flex-col items-center gap-2 text-center">
        <div className={tone === 'error' ? 'text-danger' : 'text-fg-2'}>
          {tone === 'loading' ? <span className="animate-pulse">{title}</span> : title}
        </div>
        {hint && <div className="text-ui text-fg-3">{hint}</div>}
        {action}
      </div>
    </div>
  );
}
