/**
 * 正文渲染：Markdown + KaTeX 公式 + 提到别的节点（`#标记`、`[[名字]]`）。
 * 提到的规则和后端一致（crates/core/src/refs.rs），渲染成 `<a data-ref="名字">`。
 */
import DOMPurify from 'dompurify';
import katex from 'katex';
import { Marked, type TokenizerAndRendererExtension } from 'marked';

const STOP = ',.;:!?()[]{}"\'<>`$#，。；：！？、（）【】「」《》“”‘’';
const TAG_CHAR = `[^\\s${STOP.replace(/[\]\\^-]/g, '\\$&')}]`;
const TAG = new RegExp(`^#(${TAG_CHAR}+)`);
const TAG_START = new RegExp(`(^|\\s)#${TAG_CHAR}`);

function tex(src: string, displayMode: boolean) {
  return katex.renderToString(src, { displayMode, throwOnError: false, output: 'html' });
}

function escape(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

function ref(name: string, text: string) {
  return `<a href="#" class="x-ref" data-ref="${escape(name)}">${escape(text)}</a>`;
}

const extensions: TokenizerAndRendererExtension[] = [
  {
    name: 'blockMath',
    level: 'block',
    start: (src) => src.match(/^\$\$/m)?.index,
    tokenizer(src) {
      const m = /^\$\$([\s\S]+?)\$\$[ \t]*(?:\n|$)/.exec(src);
      if (m) return { type: 'blockMath', raw: m[0], text: (m[1] ?? '').trim() };
      return undefined;
    },
    renderer: (t) => `<div class="x-math">${tex(t.text as string, true)}</div>`,
  },
  {
    name: 'inlineMath',
    level: 'inline',
    start: (src) => (src.indexOf('$') >= 0 ? src.indexOf('$') : undefined),
    tokenizer(src) {
      const d = /^\$\$((?:\\.|[^\\$])+?)\$\$/.exec(src);
      if (d) return { type: 'inlineMath', raw: d[0], text: (d[1] ?? '').trim(), display: true };
      const m = /^\$((?:\\.|[^\\$\n])+?)\$/.exec(src);
      if (m) return { type: 'inlineMath', raw: m[0], text: m[1], display: false };
      return undefined;
    },
    renderer: (t) =>
      t.display
        ? `<span class="x-math">${tex(t.text as string, true)}</span>`
        : tex(t.text as string, false),
  },
  {
    name: 'wikiLink',
    level: 'inline',
    start: (src) => (src.indexOf('[[') >= 0 ? src.indexOf('[[') : undefined),
    tokenizer(src) {
      const m = /^\[\[([^\]\n]+)\]\]/.exec(src);
      if (m?.[1]?.trim()) return { type: 'wikiLink', raw: m[0], text: m[1].trim() };
      return undefined;
    },
    renderer: (t) => ref(t.text as string, t.text as string),
  },
  {
    name: 'tag',
    level: 'inline',
    start(src) {
      const m = TAG_START.exec(src);
      return m ? m.index + (m[1] ?? '').length : undefined;
    },
    tokenizer(src) {
      const m = TAG.exec(src);
      if (m?.[1] && !/^\d+$/.test(m[1])) return { type: 'tag', raw: m[0], text: m[1] };
      return undefined;
    },
    renderer: (t) => ref(t.text as string, `#${t.text as string}`),
  },
];

const marked = new Marked({ gfm: true, breaks: true, async: false });
marked.use({
  extensions,
  renderer: {
    image({ href, text }) {
      return `<img src="${escape(href)}" alt="${escape(text)}" loading="lazy" />`;
    },
    link({ href, tokens }) {
      return `<a href="${escape(href)}" target="_blank" rel="noopener noreferrer">${this.parser.parseInline(tokens)}</a>`;
    },
  },
});

const cache = new Map<string, string>();

/** Markdown → 安全的 HTML（有缓存）。 */
export function renderMarkdown(md: string): string {
  const hit = cache.get(md);
  if (hit !== undefined) return hit;
  const html = DOMPurify.sanitize(marked.parse(md) as string, { ADD_ATTR: ['target'] });
  if (cache.size > 2000) cache.clear();
  cache.set(md, html);
  return html;
}

/** 去掉 `#标记`（表格、画廊里标记单独显示）。 */
export function stripTags(md: string): string {
  return md.replace(new RegExp(`(^|\\s)#${TAG_CHAR}+`, 'g'), (m, pre: string) =>
    /^#\d+$/.test(m.trim()) ? m : pre,
  );
}

/** 正文里是否有公式或图片（编辑时要在下面显示预览）。 */
export function needsPreview(md: string): boolean {
  return /\$|!\[/.test(md);
}

/** 只含图片的块。 */
export function isImageOnly(md: string): boolean {
  return /^\s*(!\[[^\]]*\]\([^)]+\)\s*)+$/.test(md);
}

/** 一行纯文字摘要：去掉 Markdown 记号和标记，公式保留源码，图片写成「图片」。 */
export function plainText(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '［图片］')
    .replace(/\$\$?([^$]+)\$\$?/g, (_, t: string) => t.trim())
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(new RegExp(`(^|\\s)#${TAG_CHAR}+`, 'g'), '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 一段粘贴的文字按空行切成多块；公式块（$$）和代码块（```）里的空行不切。 */
export function splitBlocks(text: string): string[] {
  const out: string[] = [];
  let cur: string[] = [];
  let fence = false;
  let math = false;
  const flush = () => {
    const s = cur.join('\n').trim();
    if (s) out.push(s);
    cur = [];
  };
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const t = line.trim();
    if (t.startsWith('```')) fence = !fence;
    else if (!fence && (t.match(/\$\$/g)?.length ?? 0) % 2 === 1) math = !math;
    if (!t && !fence && !math) flush();
    else cur.push(line);
  }
  flush();
  return out;
}

/** 光标前的文字是否停在没闭合的公式或代码块里（这时回车只换行）。 */
export function insideOpenBlock(before: string): boolean {
  const fences = before.split('\n').filter((l) => l.trim().startsWith('```')).length;
  const maths = before.match(/\$\$/g)?.length ?? 0;
  return fences % 2 === 1 || maths % 2 === 1;
}
