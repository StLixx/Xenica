import {
  DockviewReact,
  type DockviewApi,
  type DockviewTheme,
  type IDockviewPanelProps,
} from 'dockview-react';
import { useMemo, type FunctionComponent } from 'react';

import type { AnyView, ViewParams } from './api';

const LAYOUT_KEY = 'xenica.layout.v1';

const theme: DockviewTheme = {
  name: 'xenica',
  className: 'dockview-theme-dark dockview-theme-xenica',
  colorScheme: 'dark',
};

/** 编辑器区：标签页、分屏、拖拽停靠。布局存在 localStorage，刷新后还原。 */
export function Workbench({
  views,
  defaultView,
  onReady,
}: {
  views: AnyView[];
  defaultView: string;
  onReady: (api: DockviewApi) => void;
}) {
  const components = useMemo(() => {
    const map: Record<string, FunctionComponent<IDockviewPanelProps<ViewParams>>> = {};
    for (const v of views) {
      const View = v.component;
      map[v.id] = ({ params, api }) => <View params={params} setTitle={(t) => api.setTitle(t)} />;
    }
    return map;
  }, [views]);

  return (
    <DockviewReact
      className="h-full"
      theme={theme}
      components={components}
      onReady={({ api }) => {
        if (!restore(api))
          api.addPanel({
            id: defaultView,
            component: defaultView,
            title: title(views, defaultView),
          });
        api.onDidLayoutChange(() => {
          localStorage.setItem(LAYOUT_KEY, JSON.stringify(api.toJSON()));
        });
        onReady(api);
      }}
    />
  );
}

function restore(api: DockviewApi): boolean {
  const saved = localStorage.getItem(LAYOUT_KEY);
  if (!saved) return false;
  try {
    api.fromJSON(JSON.parse(saved));
    return api.panels.length > 0;
  } catch {
    localStorage.removeItem(LAYOUT_KEY);
    return false;
  }
}

function title(views: AnyView[], id: string) {
  return views.find((v) => v.id === id)?.title ?? id;
}
