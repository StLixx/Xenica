import type { AnyView, Command, ViewParams } from './api';

/** 所有命令：每个视图的「打开」命令 + 视图自己声明的命令。 */
export function collectCommands(views: AnyView[]): Command[] {
  const open: Command[] = views
    .filter((v) => v.singleton)
    .map((v) => ({
      id: `view.open.${v.id}`,
      title: `打开：${v.title}`,
      run: (wb) => wb.openView(v.id),
    }));
  return [...open, ...views.flatMap((v) => v.commands ?? [])];
}

/** 按输入过滤命令：每个空格分开的词都要命中标题或关键词（不区分大小写）。 */
export function filterCommands(commands: Command[], query: string): Command[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return commands;
  return commands.filter((c) => {
    const hay = [c.title, ...(c.keywords ?? [])].join(' ').toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

export function panelId(view: { id: string; singleton?: boolean }, params?: ViewParams): string {
  if (view.singleton || !params || Object.keys(params).length === 0) return view.id;
  const suffix = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return `${view.id}?${suffix}`;
}
