/**
 * 唯一和后端说话的地方（由 dependency-cruiser 检查）。
 * 类型来自 schema.d.ts——由后端代码生成，不要手改；后端接口变了就运行 `pnpm api`。
 */
import createClient from 'openapi-fetch';

import type { components, paths } from './schema';

export type Node = components['schemas']['Node'];
export type Edge = components['schemas']['Edge'];
export type Trace = components['schemas']['Trace'];
export type NewNode = components['schemas']['NewNode'];
export type NodePatch = components['schemas']['NodePatch'];
export type NewEdge = components['schemas']['NewEdge'];

export const api = createClient<paths>({ baseUrl: '' });

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** 把 openapi-fetch 的结果变成「成功返回数据，失败抛 ApiError」。 */
export function unwrap<T>(res: { data?: T; error?: unknown; response: Response }): T {
  if (res.error !== undefined || !res.response.ok) {
    const body = (res.error ?? {}) as { error?: string; message?: string };
    throw new ApiError(body.error ?? 'internal', body.message ?? res.response.statusText);
  }
  return res.data as T;
}
