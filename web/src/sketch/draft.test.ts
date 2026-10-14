import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearDraft, readDraft, writeDraft, type CanvasDraft } from './draft';

const draft: CanvasDraft = {
  schema: 1,
  revision: '2026-10-13T00:00:00Z',
  scene: { elements: [{ id: 'text', version: 2, text: '待保存文字' }] },
  files: {
    image: {
      id: 'image',
      mimeType: 'image/png',
      dataURL: 'data:image/png;base64,AA==',
      created: 1,
    },
  },
};

describe('画布恢复草稿', () => {
  beforeEach(() => sessionStorage.clear());

  it('刷新后可恢复未保存的文字、原图和用于冲突检查的版本', () => {
    expect(writeDraft('board', draft)).toBe(true);
    expect(readDraft('board')).toEqual(draft);
    expect(readDraft('another-board')).toBeNull();
    expect(clearDraft('board')).toBe(true);
    expect(readDraft('board')).toBeNull();
  });

  it('存储已满或不可用时明确返回失败', () => {
    const blocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    expect(writeDraft('board', draft)).toBe(false);
    blocked.mockRestore();
  });

  it('损坏或不兼容的恢复副本不阻止打开服务器画布', () => {
    sessionStorage.setItem('xenica.sketch.draft.board', '{');
    expect(readDraft('board')).toBeNull();
    sessionStorage.setItem(
      'xenica.sketch.draft.board',
      JSON.stringify({ ...draft, files: { bad: null } }),
    );
    expect(readDraft('board')).toBeNull();
    sessionStorage.setItem(
      'xenica.sketch.draft.board',
      JSON.stringify({ ...draft, scene: { elements: [null] } }),
    );
    expect(readDraft('board')).toBeNull();
  });
});
