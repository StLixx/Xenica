import type { Meta, StoryObj } from '@storybook/react-vite';
import { FileText, Plus, Search } from 'lucide-react';

import { AsideGroup, asideRow, PeekAside } from './PeekAside';

const meta: Meta = {
  title: '底座/可收起侧栏',
};
export default meta;

/** 默认收成一条图标栏；鼠标移上去浮出展开、不挤正文，点图钉固定展开。 */
export const 侧栏: StoryObj = {
  render: () => (
    <div className="flex h-96 w-full items-stretch bg-bg">
      <PeekAside label="侧栏" title="Xenica" badge="X" storageKey="storybook.peek-aside">
        {(open) => (
          <>
            <button type="button" className={asideRow} title="搜索或命令（Ctrl K）">
              <Search size={16} className="flex-none" />
              {open && (
                <>
                  搜索或命令<span className="ml-auto text-meta text-fg-3">Ctrl K</span>
                </>
              )}
            </button>
            <button type="button" className={asideRow} title="新建页">
              <Plus size={16} className="flex-none" />
              {open && '新建页'}
            </button>
            {open && (
              <div className="-mx-2 mt-2 min-h-0 flex-1 overflow-y-auto px-2">
                <AsideGroup title="页面" open={open}>
                  <button type="button" className={asideRow}>
                    <FileText size={15} className="flex-none text-fg-3" />
                    <span className="truncate">高数 · 不定积分（第 3 讲）</span>
                  </button>
                  <button type="button" className={asideRow}>
                    <FileText size={15} className="flex-none text-fg-3" />
                    <span className="truncate">第 5 讲 数列极限</span>
                  </button>
                </AsideGroup>
              </div>
            )}
          </>
        )}
      </PeekAside>
      <div className="min-w-0 flex-1 p-6 text-ui text-fg-3">正文（侧栏展开时浮在它上面）</div>
    </div>
  ),
};
