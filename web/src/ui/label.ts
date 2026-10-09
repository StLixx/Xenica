import { isImageOnly, plainText } from './markdown';

type Labeled = { title: string; body: unknown; created_at: string };

const day = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' });

/** 节点的正文 Markdown（没有就是空串）。 */
export function bodyMd(n: { body: unknown }): string {
  const md = (n.body as { md?: unknown } | null)?.md;
  return typeof md === 'string' ? md : '';
}

function own(n: Labeled): string {
  const t = n.title.trim();
  if (t) return t;
  const md = bodyMd(n);
  if (md && isImageOnly(md)) return '图片';
  const text = plainText(md);
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

/**
 * 节点显示的名字：有标题用标题，没有就用正文第一行；
 * 一页没有标题也没有正文时，用它的第一块（`first`）；都没有就写「无标题 · 日期」。
 */
export function nodeLabel(n: Labeled, first?: Labeled): string {
  return own(n) || (first && own(first)) || `无标题 · ${day.format(new Date(n.created_at))}`;
}
