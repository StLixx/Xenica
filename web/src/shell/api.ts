/**
 * 外壳对视图开放的全部能力。视图只能 import 这个文件，不能碰外壳的其他部分（dependency-cruiser 检查）。
 */
import type { LucideIcon } from 'lucide-react';
import { createContext, useContext, type FunctionComponent } from 'react';

export type ViewParams = Record<string, string>;

export interface ViewProps<P extends ViewParams = ViewParams> {
  params: P;
  /** 改标签页标题。 */
  setTitle: (title: string) => void;
}

export interface Command {
  id: string;
  title: string;
  /** 额外的搜索词（拼音、英文别名……）。 */
  keywords?: string[];
  run: (wb: Workbench) => void | Promise<void>;
}

/** 一个视图 = 一种看同一份数据的方式。新视图在 src/views/<名字>/ 下定义，再加进 src/views/index.ts。 */
export interface ViewDefinition<P extends ViewParams = ViewParams> {
  id: string;
  title: string;
  icon: LucideIcon;
  component: FunctionComponent<ViewProps<P>>;
  /** 出现在侧栏。 */
  sidebar?: boolean;
  /** 只能开一个（再次打开时切过去）。 */
  singleton?: boolean;
  commands?: Command[];
}

/** 注册表里的视图参数类型各不相同，统一用这个类型存放。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyView = ViewDefinition<any>;

export interface Workbench {
  openView: (viewId: string, params?: ViewParams) => void;
  closeView: (viewId: string, params?: ViewParams) => void;
}

export const WorkbenchContext = createContext<Workbench | null>(null);

export function useWorkbench(): Workbench {
  const wb = useContext(WorkbenchContext);
  if (!wb) throw new Error('useWorkbench must be used inside the workbench');
  return wb;
}

export function defineView<P extends ViewParams>(def: ViewDefinition<P>): ViewDefinition<P> {
  return def;
}
