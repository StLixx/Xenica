import { useQueryClient } from '@tanstack/react-query';
import type { DockviewApi } from 'dockview-react';
import { useMemo, useRef, useState } from 'react';

import { keys, logout } from '../api/queries';
import { views } from '../views';
import { WorkbenchContext, type ViewParams, type Workbench as WorkbenchApi } from './api';
import { CommandPalette } from './CommandPalette';
import { collectCommands, panelId } from './commands';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';
import { Workbench } from './Workbench';

export function Shell() {
  const dock = useRef<DockviewApi | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const wb = useMemo<WorkbenchApi>(
    () => ({
      openView(viewId: string, params?: ViewParams) {
        const api = dock.current;
        const view = views.find((v) => v.id === viewId);
        if (!api || !view) return;
        const id = panelId(view, params);
        const existing = api.getPanel(id);
        if (existing) {
          existing.api.setActive();
          return;
        }
        api.addPanel({ id, component: viewId, title: view.title, params: params ?? {} });
      },
      closeView(viewId: string, params?: ViewParams) {
        const view = views.find((v) => v.id === viewId);
        if (!view) return;
        dock.current?.getPanel(panelId(view, params))?.api.close();
      },
    }),
    [],
  );
  const qc = useQueryClient();
  const commands = useMemo(
    () => [
      ...collectCommands(views),
      {
        id: 'auth.logout',
        title: '退出登录',
        keywords: ['logout', '登出', 'tuichu'],
        run: async () => {
          await logout();
          qc.removeQueries({ predicate: (q) => q.queryKey[0] !== keys.session[0] });
          await qc.invalidateQueries({ queryKey: keys.session });
        },
      },
    ],
    [qc],
  );

  return (
    <WorkbenchContext value={wb}>
      <div className="flex h-full">
        <Sidebar views={views} onOpenPalette={() => setPaletteOpen(true)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="min-h-0 flex-1">
            <Workbench views={views} defaultView="nodes" onReady={(api) => (dock.current = api)} />
          </main>
          <StatusBar />
        </div>
      </div>
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        commands={commands}
        workbench={wb}
      />
    </WorkbenchContext>
  );
}
