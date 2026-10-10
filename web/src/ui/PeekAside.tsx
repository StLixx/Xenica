import { Pin, PinOff } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';

/** 侧栏里的一行。可交互的一行统一用它。 */
export const asideRow = 'item w-full text-body';

/**
 * 侧栏里的一组（带小组标题）。
 *
 * 收起时标题用 `invisible` 占住原位、不参与朗读：**不能直接不渲染它**，
 * 否则悬停展开的瞬间，下面所有条目会整体下移（真机上量到差 40px），
 * 鼠标底下的东西会跑掉。
 */
export function AsideGroup({
  title,
  open,
  children,
}: {
  title: string;
  open: boolean;
  children: ReactNode;
}) {
  return (
    <section aria-label={title}>
      <div className={`px-2 pt-3 pb-1 text-label text-fg-3 ${open ? '' : 'invisible'}`}>
        {title}
      </div>
      {children}
    </section>
  );
}

/**
 * 可收起的侧栏（参考 Microsoft Edge 的垂直标签页）：平时只占一条图标栏，
 * 鼠标移上去浮在内容上展开、不挤正文，点图钉固定展开。
 *
 * 主站外壳和草图站的侧栏都用这一个实现——两处各写一套迟早走样。
 */
export function PeekAside({
  label,
  title,
  badge,
  storageKey,
  children,
}: {
  /** 无障碍名字，也是测试里定位它的方式（如「侧栏」）。 */
  label: string;
  /** 展开时显示在徽标旁边。 */
  title: string;
  /** 收起时仍能看到的那个字（如 X、草）。 */
  badge: string;
  /** 记住「固定展开」的键。 */
  storageKey: string;
  /** 内容。`open` 为真表示现在展开、该显示文字；为假时只有图标。 */
  children: (open: boolean) => ReactNode;
}) {
  const [pinned, setPinned] = useState(() => localStorage.getItem(storageKey) === '1');
  const [hover, setHover] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const open = pinned || hover;

  const later = (fn: () => void, ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(fn, ms);
  };
  const togglePin = () => {
    localStorage.setItem(storageKey, pinned ? '0' : '1');
    setPinned(!pinned);
    setHover(false);
  };

  return (
    <div className={`relative flex-none ${pinned ? 'w-(--x-sidebar)' : 'w-(--x-rail)'}`}>
      <nav
        aria-label={label}
        data-open={open || undefined}
        onMouseEnter={() => later(() => setHover(true), 120)}
        onMouseLeave={() => later(() => setHover(false), 220)}
        onFocus={() => setHover(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setHover(false);
        }}
        onClick={(e) => {
          // 触屏没有悬停：点图标栏的空白处展开。
          if (e.target === e.currentTarget) setHover(true);
        }}
        className={`absolute inset-y-0 left-0 z-30 flex flex-col gap-0.5 overflow-hidden bg-side px-2 py-2.5 transition-all duration-base ${open ? 'w-(--x-sidebar)' : 'w-(--x-rail)'} ${hover && !pinned ? 'rounded-r-lg shadow-pop' : ''}`}
      >
        <div className="flex h-8 items-center gap-2 px-1.5 pb-2 font-semibold">
          <span className="grid size-5.5 flex-none place-items-center rounded-sm bg-accent text-ui font-bold text-on-accent">
            {badge}
          </span>
          {open && <span className="flex-1">{title}</span>}
          {open && (
            <button
              type="button"
              onClick={togglePin}
              aria-label={pinned ? `取消固定${label}` : `固定${label}`}
              aria-pressed={pinned}
              title={pinned ? '取消固定' : '固定展开'}
              className="grid size-6 cursor-pointer place-items-center rounded-sm text-fg-3 hover:bg-hover hover:text-fg"
            >
              {pinned ? <PinOff size={15} /> : <Pin size={15} />}
            </button>
          )}
        </div>
        {children(open)}
      </nav>
    </div>
  );
}
