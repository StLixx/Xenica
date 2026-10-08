import { ArrowDown, ArrowUp, GripVertical, PanelRightOpen, Trash2 } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react';

import type { Node } from '../../api/client';
import { newId } from '../../api/id';
import {
  createChildren,
  deleteNode,
  mdBody,
  patchNode,
  reorderChildren,
  uploadImage,
  useChildren,
  useRefreshGraph,
  useSetChildren,
} from '../../api/queries';
import { useWorkbench } from '../../shell/api';
import { bodyMd, insideOpenBlock, Markdown, needsPreview, splitBlocks } from '../../ui';
import { REVEAL_EVENT, takeReveal } from './graph';

type Block = { id: string; md: string };
type Focus = { id: string; caret: number | 'end' } | null;

const SAVE_DELAY = 500;
/** 正在打 #标记 时先不存（不然会把「数」「数列」这些半截词建成节点），停下很久或离开时再存。 */
const HOLD_DELAY = 8000;

/** 按顺序执行写操作，保证「先建后改」。全部做完时调用 onIdle，出错时调用 onError。 */
function useQueue(handlers: { onError: (e: unknown) => void; onIdle: () => void }) {
  const tail = useRef<Promise<void>>(Promise.resolve());
  const size = useRef(0);
  const h = useRef(handlers);
  useEffect(() => {
    h.current = handlers;
  });
  const [busy, setBusy] = useState(false);
  const run = useCallback((op: () => Promise<unknown>) => {
    size.current++;
    setBusy(true);
    tail.current = tail.current
      .then(op)
      .then(
        () => undefined,
        (e: unknown) => h.current.onError(e),
      )
      .finally(() => {
        size.current--;
        if (size.current === 0) {
          setBusy(false);
          h.current.onIdle();
        }
      });
  }, []);
  return useMemo(() => ({ run, busy }), [run, busy]);
}

/**
 * 一页的正文：每一块都是一个节点。像写 Markdown 一样写：
 * 回车分块、在开头退格合并、粘贴截图变成图片块、粘贴整段笔记按空行分块、`#标记` 连到同名节点。
 */
export function BlockEditor({
  parentId,
  names,
  onRef,
  hint = '随手写点什么，或者直接粘贴截图…',
}: {
  /** 空页时的提示。 */
  hint?: string;
  parentId: string;
  /** 已有节点的标题，输入 # 或 [[ 时提示。 */
  names: string[];
  /** 点了正文里的 #标记 / [[名字]]。 */
  onRef: (name: string) => void;
}) {
  const children = useChildren(parentId);
  const refresh = useRefreshGraph();
  const wb = useWorkbench();
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [focus, setFocus] = useState<Focus>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  /** 最新的块列表（事件处理里读它，渲染用 blocks）。两者一起改，见 commit。 */
  const latest = useRef<Block[]>([]);
  const commit = useCallback((fn: (list: Block[]) => Block[]) => {
    latest.current = fn(latest.current);
    setBlocks(latest.current);
  }, []);

  const setCache = useSetChildren(parentId);
  /** 下一次读到服务器数据时用它覆盖本地（第一次打开、保存出错后）。 */
  const resync = useRef(true);
  const queue = useQueue({
    onError: (e) => {
      setError(e instanceof Error ? e.message : String(e));
      resync.current = true;
      void children.refetch();
    },
    // 写完了：把本地内容写回缓存，别的看法（表格、画廊）马上能看到
    onIdle: () =>
      setCache((old) => {
        const byId = new Map(old.map((n) => [n.id, n]));
        const now = new Date().toISOString();
        return latest.current.map((b) => {
          const o = byId.get(b.id);
          return o
            ? { ...o, body: mdBody(b.md) }
            : {
                id: b.id,
                kind: 'note',
                title: '',
                body: mdBody(b.md),
                created_at: now,
                updated_at: now,
              };
        });
      }),
  });

  // 服务器数据 → 本地。只在第一次和出错后同步，免得覆盖正在打的字。
  useEffect(() => {
    const data = children.data;
    if (!data || !resync.current) return;
    resync.current = false;
    setError(null);
    commit(() => data.map((n: Node) => ({ id: n.id, md: bodyMd(n) })));
    // 刚新建的页：直接把光标放进去
    const only = data.length === 1 ? data[0] : undefined;
    if (only && !bodyMd(only) && Date.now() - Date.parse(only.created_at) < 10_000)
      // 服务器数据到了才知道要聚焦哪一块，只能在这里设
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFocus({ id: only.id, caret: 0 });
  }, [children.data, commit]);

  // 从列表、表格里跳过来：滚到那一块并闪一下
  useEffect(() => {
    const go = () => {
      const id = takeReveal(parentId);
      if (!id) return;
      requestAnimationFrame(() => {
        document
          .querySelector(`[data-block-id="${id}"]`)
          ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        setFlash(id);
        setTimeout(() => setFlash(null), 1600);
      });
    };
    go();
    window.addEventListener(REVEAL_EVENT, go);
    return () => window.removeEventListener(REVEAL_EVENT, go);
  }, [parentId, blocks !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useCallback(
    (id: string) => {
      const t = timers.current.get(id);
      if (t) clearTimeout(t);
      timers.current.delete(id);
      const b = latest.current.find((x) => x.id === id);
      if (!b) return;
      const md = b.md;
      queue.run(async () => {
        await patchNode(id, { body: mdBody(md) });
        refresh();
      });
    },
    [queue, refresh],
  );

  // 关掉或切走时，把没来得及保存的字存掉
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const id of [...pending.keys()]) save(id);
    };
  }, [save]);

  const ops = useMemo(() => {
    const index = (id: string) => latest.current.findIndex((b) => b.id === id);
    const set = commit;
    const cancel = (id: string) => {
      const t = timers.current.get(id);
      if (t) clearTimeout(t);
      timers.current.delete(id);
    };
    const insert = (at: number, mds: string[]) => {
      const made = mds.map((md) => ({ id: newId(), md }));
      set((l) => [...l.slice(0, at), ...made, ...l.slice(at)]);
      queue.run(async () => {
        await createChildren(parentId, {
          index: at,
          nodes: made.map((b) => ({ id: b.id, body: mdBody(b.md) })),
        });
        refresh();
      });
      return made;
    };
    return {
      change(id: string, md: string, hold = false) {
        set((l) => l.map((b) => (b.id === id ? { ...b, md } : b)));
        cancel(id);
        timers.current.set(
          id,
          setTimeout(() => save(id), hold ? HOLD_DELAY : SAVE_DELAY),
        );
      },
      /** 立刻保存（失焦、切块时）。 */
      flush(id: string) {
        if (timers.current.has(id)) save(id);
      },
      /** 回车：光标处一分为二。 */
      split(id: string, before: string, after: string) {
        const at = index(id);
        set((l) => l.map((b) => (b.id === id ? { ...b, md: before } : b)));
        cancel(id);
        save(id);
        const [made] = insert(at + 1, [after]);
        if (made) setFocus({ id: made.id, caret: 0 });
      },
      /** 在开头退格：并到上一块。 */
      mergeUp(id: string) {
        const at = index(id);
        if (at <= 0) return;
        const prev = latest.current[at - 1];
        const cur = latest.current[at];
        if (!prev || !cur) return;
        const md = prev.md && cur.md ? `${prev.md}${cur.md}` : prev.md || cur.md;
        cancel(id);
        set((l) => l.filter((b) => b.id !== id).map((b) => (b.id === prev.id ? { ...b, md } : b)));
        save(prev.id);
        queue.run(async () => {
          await deleteNode(id);
          refresh();
        });
        setFocus({ id: prev.id, caret: prev.md.length });
      },
      remove(id: string) {
        const at = index(id);
        cancel(id);
        set((l) => l.filter((b) => b.id !== id));
        queue.run(async () => {
          await deleteNode(id);
          refresh();
        });
        const next = latest.current[at + 1] ?? latest.current[at - 1];
        setFocus(next ? { id: next.id, caret: 'end' } : null);
      },
      move(id: string, delta: -1 | 1) {
        const at = index(id);
        const to = at + delta;
        if (at < 0 || to < 0 || to >= latest.current.length) return;
        const l = [...latest.current];
        const [moved] = l.splice(at, 1);
        if (!moved) return;
        l.splice(to, 0, moved);
        set(() => l);
        const ids = l.map((b) => b.id);
        queue.run(() => reorderChildren(parentId, ids));
      },
      focusSibling(id: string, delta: -1 | 1) {
        const b = latest.current[index(id) + delta];
        if (b) setFocus({ id: b.id, caret: delta < 0 ? 'end' : 0 });
      },
      /** 粘贴多段文字：第一段接在光标处，其余各成一块。 */
      pasteBlocks(id: string, before: string, after: string, parts: string[]) {
        const at = index(id);
        const first = before + (parts[0] ?? '');
        const rest = parts.slice(1);
        rest[rest.length - 1] = (rest[rest.length - 1] ?? '') + after;
        set((l) => l.map((b) => (b.id === id ? { ...b, md: first } : b)));
        save(id);
        const made = insert(at + 1, rest);
        const last = made[made.length - 1];
        if (last) setFocus({ id: last.id, caret: last.md.length - after.length });
      },
      /** 截图：每张图一块，插在 `afterId` 后面（空块就直接用它）。 */
      pasteImages(afterId: string | null, files: File[]) {
        const at = afterId ? index(afterId) : latest.current.length - 1;
        const cur = latest.current[at];
        const reuse = cur && !cur.md.trim();
        const local = files.map((f) => URL.createObjectURL(f));
        const ids: string[] = [];
        files.forEach((_, i) => ids.push(i === 0 && reuse ? cur.id : newId()));
        set((l) => {
          const next = [...l];
          const made = ids.map((id, i) => ({ id, md: `![](${local[i] ?? ''})` }));
          if (reuse) next.splice(at, 1, ...made);
          else next.splice(at + 1, 0, ...made);
          return next;
        });
        files.forEach((file, i) => {
          const id = ids[i] ?? '';
          queue.run(async () => {
            const url = await uploadImage(file);
            const md = `![](${url})`;
            set((l) => l.map((b) => (b.id === id ? { ...b, md } : b)));
            if (i === 0 && reuse) await patchNode(id, { body: mdBody(md) });
            else
              await createChildren(parentId, {
                index: at + (reuse ? 0 : 1) + i,
                nodes: [{ id, body: mdBody(md) }],
              });
            URL.revokeObjectURL(local[i] ?? '');
          });
        });
        const lastId = ids[ids.length - 1];
        const blank = newId();
        // 图片后面留一个空块，接着写
        set((l) => {
          const i = l.findIndex((b) => b.id === lastId);
          return [...l.slice(0, i + 1), { id: blank, md: '' }, ...l.slice(i + 1)];
        });
        queue.run(async () => {
          const i = latest.current.findIndex((b) => b.id === blank);
          await createChildren(parentId, {
            index: i,
            nodes: [{ id: blank, body: mdBody('') }],
          });
        });
        setFocus({ id: blank, caret: 0 });
      },
      /** 点空白处：最后一块是空的就去那里，否则加一块。 */
      appendOrFocusLast() {
        const last = latest.current[latest.current.length - 1];
        if (last && !last.md.trim()) setFocus({ id: last.id, caret: 0 });
        else {
          const [made] = insert(latest.current.length, ['']);
          if (made) setFocus({ id: made.id, caret: 0 });
        }
      },
      open(id: string) {
        wb.openView('node', { id });
      },
      ref: onRef,
    };
  }, [parentId, queue, refresh, save, wb, onRef, commit]);

  if (!blocks) return null;

  const drop = (e: DragEvent) => {
    const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    ops.pasteImages(focus?.id ?? null, files);
  };

  return (
    <div
      aria-label="正文"
      role="region"
      onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
      onDrop={drop}
    >
      {blocks.map((b, i) => (
        <BlockRow
          key={b.id}
          block={b}
          caret={focus?.id === b.id ? focus.caret : null}
          flash={flash === b.id}
          first={i === 0}
          last={i === blocks.length - 1}
          only={blocks.length === 1}
          names={names}
          ops={ops}
          onFocus={(caret) => setFocus({ id: b.id, caret })}
          onBlur={() => {
            ops.flush(b.id);
            setFocus((f) => (f?.id === b.id ? null : f));
          }}
        />
      ))}
      <button
        type="button"
        aria-label="在最后接着写"
        onClick={ops.appendOrFocusLast}
        className={`block w-full cursor-text text-left text-body text-fg-3 ${blocks.length ? 'h-24' : 'h-10 rounded-sm px-1 hover:bg-hover'}`}
      >
        {blocks.length === 0 && hint}
      </button>
      <div className="h-5 text-meta text-fg-3" aria-live="polite">
        {error ? (
          <span className="text-danger">保存失败：{error}（已重新读取）</span>
        ) : queue.busy ? (
          '保存中…'
        ) : null}
      </div>
    </div>
  );
}

type Ops = {
  change: (id: string, md: string, hold?: boolean) => void;
  split: (id: string, before: string, after: string) => void;
  mergeUp: (id: string) => void;
  remove: (id: string) => void;
  move: (id: string, delta: -1 | 1) => void;
  focusSibling: (id: string, delta: -1 | 1) => void;
  pasteBlocks: (id: string, before: string, after: string, parts: string[]) => void;
  pasteImages: (afterId: string | null, files: File[]) => void;
  open: (id: string) => void;
  ref: (name: string) => void;
};

/** 正在输入的 `#标记` 或 `[[名字`。 */
function typingRef(before: string): { kind: '#' | '[['; query: string } | null {
  const w = /\[\[([^\]\n]*)$/.exec(before);
  if (w) return { kind: '[[', query: w[1] ?? '' };
  const t = /(?:^|\s)#([^\s#$`，。；：！？、,.;:!?()[\]{}"'<>（）【】「」《》]*)$/.exec(before);
  if (t) return { kind: '#', query: t[1] ?? '' };
  return null;
}

function BlockRow({
  block,
  caret,
  flash,
  first,
  last,
  only,
  names,
  ops,
  onFocus,
  onBlur,
}: {
  block: Block;
  caret: number | 'end' | null;
  flash: boolean;
  first: boolean;
  last: boolean;
  only: boolean;
  names: string[];
  ops: Ops;
  onFocus: (caret: number | 'end') => void;
  onBlur: () => void;
}) {
  const editing = caret !== null;
  const ref = useRef<HTMLTextAreaElement>(null);
  const [menu, setMenu] = useState(false);
  const [sel, setSel] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [dismissed, setDismissed] = useState<number | null>(null);

  // 进入编辑：聚焦并把光标放到指定位置
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || caret === null) return;
    if (document.activeElement !== el) el.focus({ preventScroll: false });
    const pos = caret === 'end' ? el.value.length : Math.min(caret, el.value.length);
    el.setSelectionRange(pos, pos);
    setCursor(pos);
  }, [caret]);

  /** 程序改了内容之后光标要去的位置（在同一次渲染里放好，免得快速打字时错位）。 */
  const pendingCaret = useRef<number | null>(null);

  // 高度跟着内容走
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
    if (pendingCaret.current !== null) {
      el.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }
  }, [block.md, editing]);

  const typing = editing ? typingRef(block.md.slice(0, cursor)) : null;
  const suggestions = useMemo(() => {
    if (!typing || dismissed === cursor) return [];
    const q = typing.query.toLowerCase();
    return names.filter((n) => n.toLowerCase().includes(q) && n !== typing.query).slice(0, 8);
  }, [typing?.query, typing?.kind, names, dismissed, cursor]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (name: string) => {
    const el = ref.current;
    if (!el || !typing) return;
    const start = cursor - typing.query.length - (typing.kind === '[[' ? 2 : 1);
    const useLink = typing.kind === '[[' || /[\s#$`]/.test(name);
    const text = useLink ? `[[${name}]] ` : `#${name} `;
    const md = block.md.slice(0, start) + text + block.md.slice(cursor).replace(/^\]\]/, '');
    const pos = start + text.length;
    pendingCaret.current = pos;
    ops.change(block.id, md);
    setCursor(pos);
    setSel(0);
  };

  const key = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    const el = e.currentTarget;
    const { selectionStart: s, selectionEnd: t, value } = el;
    if (suggestions.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const d = e.key === 'ArrowDown' ? 1 : -1;
        setSel((i) => (i + d + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pick(suggestions[Math.min(sel, suggestions.length - 1)] ?? '');
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setDismissed(cursor);
        return;
      }
    }
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      ops.move(block.id, e.key === 'ArrowUp' ? -1 : 1);
      requestAnimationFrame(() => ref.current?.focus());
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      if (insideOpenBlock(value.slice(0, s))) return;
      e.preventDefault();
      ops.split(block.id, value.slice(0, s), value.slice(t));
      return;
    }
    if (e.key === 'Backspace' && s === 0 && t === 0) {
      if (!first) {
        e.preventDefault();
        ops.mergeUp(block.id);
      } else if (!value && !only) {
        e.preventDefault();
        ops.remove(block.id);
      }
      return;
    }
    if (e.key === 'ArrowUp' && !value.slice(0, s).includes('\n') && !first) {
      e.preventDefault();
      ops.focusSibling(block.id, -1);
      return;
    }
    if (e.key === 'ArrowDown' && !value.slice(t).includes('\n') && !last) {
      e.preventDefault();
      ops.focusSibling(block.id, 1);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      el.blur();
    }
  };

  const paste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'));
    if (files.length) {
      e.preventDefault();
      ops.pasteImages(block.id, files);
      return;
    }
    const text = e.clipboardData.getData('text/plain');
    const parts = splitBlocks(text);
    if (parts.length > 1) {
      e.preventDefault();
      const el = e.currentTarget;
      ops.pasteBlocks(
        block.id,
        el.value.slice(0, el.selectionStart),
        el.value.slice(el.selectionEnd),
        parts,
      );
    }
  };

  return (
    <div
      data-block-id={block.id}
      data-flash={flash || undefined}
      className="group relative -mx-2 rounded-sm px-2 py-0.5 transition-colors duration-slow data-flash:bg-selected"
    >
      <div className="absolute top-1 -left-7 opacity-0 transition-opacity group-hover:opacity-100 has-[button[aria-expanded=true]]:opacity-100">
        <button
          type="button"
          aria-label="这一块"
          aria-expanded={menu}
          onClick={() => setMenu((m) => !m)}
          onBlur={(e) => {
            if (!e.currentTarget.parentElement?.contains(e.relatedTarget)) setMenu(false);
          }}
          className="grid size-6 cursor-pointer place-items-center rounded-sm text-fg-3 hover:bg-hover hover:text-fg"
        >
          <GripVertical size={14} />
        </button>
        {menu && (
          <div
            role="menu"
            className="absolute top-7 left-0 z-20 w-40 rounded-md bg-pop p-1 shadow-pop"
            onMouseDown={(e) => e.preventDefault()}
          >
            {[
              { label: '单独打开', icon: PanelRightOpen, run: () => ops.open(block.id) },
              { label: '上移', icon: ArrowUp, run: () => ops.move(block.id, -1), off: first },
              { label: '下移', icon: ArrowDown, run: () => ops.move(block.id, 1), off: last },
              { label: '删除', icon: Trash2, run: () => ops.remove(block.id) },
            ].map((m) => (
              <button
                key={m.label}
                type="button"
                role="menuitem"
                disabled={m.off}
                className="item w-full text-ui"
                onClick={() => {
                  setMenu(false);
                  m.run();
                }}
              >
                <m.icon size={14} />
                {m.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {editing ? (
        <div className="relative">
          <textarea
            ref={ref}
            aria-label="块"
            value={block.md}
            rows={1}
            spellCheck={false}
            placeholder={only ? '随手写，# 加标记，粘贴截图…' : ''}
            onChange={(e) => {
              const v = e.target.value;
              const c = e.target.selectionStart;
              ops.change(block.id, v, typingRef(v.slice(0, c)) !== null);
              setCursor(c);
              setSel(0);
            }}
            onSelect={(e) => setCursor(e.currentTarget.selectionStart)}
            onKeyDown={key}
            onPaste={paste}
            onBlur={onBlur}
            className="block w-full resize-none overflow-hidden bg-transparent text-body leading-relaxed text-fg outline-none placeholder:text-fg-3 focus-visible:outline-none"
          />
          {needsPreview(block.md) && (
            <div className="mt-1 mb-1 rounded-sm bg-hover px-2 py-1">
              <Markdown md={block.md} className="x-md-compact" />
            </div>
          )}
          {suggestions.length > 0 && (
            <div
              role="listbox"
              aria-label="提到"
              className="absolute top-full left-0 z-20 mt-1 w-64 rounded-md bg-pop p-1 shadow-pop"
              onMouseDown={(e) => e.preventDefault()}
            >
              {suggestions.map((n, i) => (
                <button
                  key={n}
                  type="button"
                  role="option"
                  aria-selected={i === sel}
                  className="item w-full text-ui"
                  onClick={() => pick(n)}
                >
                  <span className="text-fg-3">{typing?.kind === '[[' ? '[[' : '#'}</span>
                  <span className="truncate">{n}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          aria-label="编辑这一块"
          onClick={() => onFocus('end')}
          onKeyDown={(e) => e.key === 'Enter' && onFocus('end')}
          className="min-h-(--x-row) cursor-text py-0.5 outline-none"
        >
          {block.md.trim() ? (
            <Markdown md={block.md} onRef={ops.ref} />
          ) : (
            <span className="text-fg-3">{only ? '随手写，# 加标记，粘贴截图…' : '\u00a0'}</span>
          )}
        </div>
      )}
    </div>
  );
}
