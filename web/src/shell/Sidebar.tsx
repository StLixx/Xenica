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
  const item = 'item w-full text-body';

  return (
    <nav
      aria-label="侧栏"
      className={`flex flex-none flex-col gap-0.5 overflow-hidden bg-side px-2 py-2.5 transition-all duration-base ${folded ? 'w-(--x-rail)' : 'w-(--x-sidebar)'}`}
    >
      <div
        className={`flex items-center gap-2 px-1.5 pb-2 font-semibold ${folded ? 'flex-col' : ''}`}
      >
        <span className="grid size-5.5 flex-none place-items-center rounded-sm bg-accent text-ui font-bold text-on-accent">
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
            搜索或命令<span className="ml-auto text-meta text-fg-3">Ctrl K</span>
          </>
        )}
      </button>
      {!folded && <div className="px-2 pt-3.5 pb-1 text-label text-fg-3">视图</div>}
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
