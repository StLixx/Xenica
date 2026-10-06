import { useEffect, useMemo, useState } from 'react';

import type { Command, Workbench } from './api';
import { filterCommands } from './commands';

/** Ctrl K / ⌘K：所有操作都能从这里找到。 */
export function CommandPalette({
  open,
  onOpenChange,
  commands,
  workbench,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: Command[];
  workbench: Workbench;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  // 每次打开都重新挂载，输入和选中项自然回到初始状态。
  return open ? (
    <Dialog close={() => onOpenChange(false)} commands={commands} workbench={workbench} />
  ) : null;
}

function Dialog({
  close,
  commands,
  workbench,
}: {
  close: () => void;
  commands: Command[];
  workbench: Workbench;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const results = useMemo(() => filterCommands(commands, query), [commands, query]);

  const run = (c: Command | undefined) => {
    if (!c) return;
    close();
    void c.run(workbench);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center bg-black/40 pt-[15vh]"
      onMouseDown={close}
    >
      <div
        role="dialog"
        aria-label="命令面板"
        className="h-max w-[min(560px,92vw)] overflow-hidden rounded-lg bg-pop shadow-pop"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          placeholder="输入命令…"
          aria-label="命令"
          className="h-11 w-full border-b border-line bg-transparent px-4 text-[15px] text-fg outline-none placeholder:text-fg-3 focus-visible:outline-none"
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close();
            if (e.key === 'ArrowDown') setActive((i) => Math.min(i + 1, results.length - 1));
            if (e.key === 'ArrowUp') setActive((i) => Math.max(i - 1, 0));
            if (e.key === 'Enter') run(results[active]);
          }}
        />
        <ul role="listbox" className="max-h-80 overflow-auto p-1.5">
          {results.length === 0 && (
            <li className="px-3 py-2 text-[13px] text-fg-3">没有匹配的命令</li>
          )}
          {results.map((c, i) => (
            <li
              key={c.id}
              role="option"
              aria-selected={i === active}
              className={`flex h-(--x-row) cursor-pointer items-center rounded-sm px-3 text-[14px] ${i === active ? 'bg-press text-fg' : 'text-fg-2'}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => run(c)}
            >
              {c.title}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
