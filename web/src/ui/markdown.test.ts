import { describe, expect, it } from 'vitest';

import { insideOpenBlock, plainText, renderMarkdown, splitBlocks, stripTags } from './markdown';

describe('markdown', () => {
  it('renders math and refs', () => {
    const html = renderMarkdown('$$\\int x\\,dx$$ #必备 [[积分公式表]] 第#3题');
    expect(html).toContain('katex');
    expect(html).toContain('data-ref="必备"');
    expect(html).toContain('data-ref="积分公式表"');
    expect(html).not.toContain('data-ref="3题"');
  });

  it('sanitizes html', () => {
    expect(renderMarkdown('<img src=x onerror=alert(1)>')).not.toContain('onerror');
  });

  it('splits pasted notes on blank lines, but not inside $$ or code', () => {
    expect(splitBlocks('a\n\n$$\nx\n\ny\n$$\n\n```\n1\n\n2\n```\nb')).toEqual([
      'a',
      '$$\nx\n\ny\n$$',
      '```\n1\n\n2\n```\nb',
    ]);
  });

  it('knows when enter should stay inside a block', () => {
    expect(insideOpenBlock('$$\n\\int')).toBe(true);
    expect(insideOpenBlock('$$x$$ ')).toBe(false);
  });

  it('makes a plain one-line label', () => {
    expect(plainText('## 标题')).toBe('标题');
    expect(plainText('![](/api/files/1) 说明 #标记')).toBe('［图片］ 说明');
    expect(stripTags('公式 #必备 #12').replace(/\s+/g, ' ')).toBe('公式 #12');
  });
});
