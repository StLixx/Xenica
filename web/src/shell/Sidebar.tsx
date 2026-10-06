import { PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react';
import { useState } from 'react';

import type { AnyView } from './api';
import { useWorkbench } from './api';

const FOLD_KEY = 'xenica.sidebar.folded';

/** 左侧栏：可折叠，折叠后只剩图标。（片段 0.3 会把它换成更好的侧边标签页。） */
export function Sidebar({ views, onOpenPalette }: { views: AnyView[]; onOpenPalette: () => void }) {
  const wb = useWorkbench();
  const [folded, setFolded] = useState(() => localStorage.getItem(FOLD_KEY) === '1');
  const toggle = () => {
    localStorage.setItem(FOLD_KEY, folded ? '0' : '1');
    setFolded(!folded);
  };
  const item =
    'flex h-(--x-row) w-full cursor-pointer items-center gap-2 rounded-sm px-2 text-[14px] whitespace-nowrap text-fg-2 hover:bg-hover hover:text-fg';

  return (
    <nav
      aria-label="侧栏"
      className={`row-span-2 flex flex-col gap-0.5 overflow-hidden bg-side px-2 py-2.5 transition-[width] duration-200 ${folded ? 'w-[52px]' : 'w-[232px]'}`}
    >
      <div
        className={`flex items-center gap-2 px-1.5 pb-2 font-semibold ${folded ? 'flex-col' : ''}`}
      >
        <span className="grid size-[22px] flex-none place-items-center rounded-sm bg-accent text-[13px] font-bold text-on-accent">
          X
        </span>
        {!folded && <span>Xenica</span>}
        <button
          type="button"
          onClick={toggle}
          aria-label={folded ? '展开侧栏' : '折叠侧栏'}
          className="ml-auto grid size-6 cursor-pointer place-items-center rounded-sm text-fg-3 hover:bg-hover hover:text-fg"
        >
          {folded ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>
      <button type="button" className={item} onClick={onOpenPalette} title="搜索或命令（Ctrl K）">
        <Search size={16} className="flex-none" />
        {!folded && (
          <>
            搜索或命令<span className="ml-auto text-[12px] text-fg-3">Ctrl K</span>
          </>
        )}
      </button>
      {!folded && <div className="px-2 pt-3.5 pb-1 text-[12px] font-medium text-fg-3">视图</div>}
      {views
        .filter((v) => v.sidebar)
        .map((v) => (
          <button
            key={v.id}
            type="button"
            className={item}
            onClick={() => wb.openView(v.id)}
            title={v.title}
          >
            <v.icon size={16} className="flex-none" />
            {!folded && v.title}
          </button>
        ))}
    </nav>
  );
}
