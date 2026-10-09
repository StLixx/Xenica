import { describe, expect, it } from 'vitest';

import type { Node } from '../api/client';
import { emptyScene, fileIdsOf, sceneOf, signature } from './scene';

function node(body: unknown): Node {
  return {
    id: '00000000-0000-7000-8000-000000000000',
    kind: 'sketch',
    title: '验收板',
    body: body as Node['body'],
    created_at: '2026-10-09T00:00:00Z',
    updated_at: '2026-10-09T00:00:00Z',
  };
}

describe('画面的读写', () => {
  it('没有画面的节点当空画面', () => {
    expect(sceneOf(node({ md: '一段笔记' })).elements).toEqual([]);
    expect(sceneOf(node({ scene: { elements: 'nope' } })).elements).toEqual([]);
  });

  it('取回画面里的元素', () => {
    const scene = sceneOf(node({ scene: { type: 'excalidraw', elements: [{ id: 'a' }] } }));
    expect(scene.elements).toHaveLength(1);
  });

  it('列出画面里用到的附件', () => {
    const scene = {
      elements: [
        { id: 'a', fileId: 'f1' },
        { id: 'b', fileIds: { x: 'f2' } },
        { id: 'c', fileId: 'f1' },
        { id: 'd' },
      ],
    };
    expect(fileIdsOf(scene).sort()).toEqual(['f1', 'f2']);
  });

  it('指纹只看元素的版本和文件数', () => {
    const a = signature([{ id: 'a', version: 1 }], 0);
    expect(a).toBe(signature([{ id: 'a', version: 1 }], 0));
    expect(a).not.toBe(signature([{ id: 'a', version: 2 }], 0));
    expect(a).not.toBe(signature([{ id: 'a', version: 1 }], 1));
  });

  it('每次给的都是新画面，不会被改坏', () => {
    expect(emptyScene()).not.toBe(emptyScene());
  });
});
