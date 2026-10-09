/** 服务端状态全部走 TanStack Query。新加接口时在这里加 hook，视图只用 hook。 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import {
  api,
  unwrap,
  type NewChildren,
  type NewEdge,
  type NewNode,
  type Node,
  type NodePatch,
  type ShareMode,
} from './client';

export const keys = {
  health: ['health'] as const,
  session: ['session'] as const,
  nodes: ['nodes'] as const,
  node: (id: string) => ['nodes', id] as const,
  traces: (id: string) => ['nodes', id, 'traces'] as const,
  children: (id: string) => ['children', id] as const,
  edges: (node?: string) => ['edges', node ?? 'all'] as const,
  shares: (node: string) => ['shares', node] as const,
};

export function useHealth() {
  return useQuery({
    queryKey: keys.health,
    queryFn: async () => unwrap(await api.GET('/api/health')),
    refetchInterval: 15_000,
  });
}

/** 是否登录、是否需要首次设置。任何接口返回 401 时 App 会让它重新查询。 */
export function useSession() {
  return useQuery({
    queryKey: keys.session,
    queryFn: async () => unwrap(await api.GET('/api/auth/session')),
    retry: false,
  });
}

/** 登录、首次设置成功后：清掉旧缓存，重新查会话（界面随之切到工作台）。 */
function useSignIn<T>(fn: (input: T) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'session' });
      await qc.invalidateQueries({ queryKey: keys.session });
    },
  });
}

export function useLogin() {
  return useSignIn(async (body: { name: string; password: string }) =>
    unwrap(await api.POST('/api/auth/login', { body })),
  );
}

export function useSetup() {
  return useSignIn(async (body: { code: string; name: string; password: string }) =>
    unwrap(await api.POST('/api/auth/setup', { body })),
  );
}

export async function logout() {
  unwrap(await api.POST('/api/auth/logout'));
}

export function useNodes() {
  return useQuery({
    queryKey: keys.nodes,
    queryFn: async () =>
      unwrap(await api.GET('/api/nodes', { params: { query: { limit: 1000 } } })),
  });
}

export function useNode(id: string) {
  return useQuery({
    queryKey: keys.node(id),
    queryFn: async () => unwrap(await api.GET('/api/nodes/{id}', { params: { path: { id } } })),
  });
}

export function useTraces(id: string) {
  return useQuery({
    queryKey: keys.traces(id),
    queryFn: async () =>
      unwrap(await api.GET('/api/nodes/{id}/traces', { params: { path: { id } } })),
  });
}

export function useEdges(node?: string) {
  return useQuery({
    queryKey: keys.edges(node),
    queryFn: async () =>
      unwrap(await api.GET('/api/edges', { params: { query: node ? { node } : { limit: 5000 } } })),
  });
}

export async function createNode(input: NewNode) {
  return unwrap(await api.POST('/api/nodes', { body: input }));
}

export function useCreateNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createNode,
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.nodes }),
  });
}

export function useUpdateNode(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: NodePatch) =>
      unwrap(await api.PATCH('/api/nodes/{id}', { params: { path: { id } }, body: patch })),
    onSuccess: (node) => {
      qc.setQueryData(keys.node(id), node);
      void qc.invalidateQueries({ queryKey: keys.nodes });
    },
  });
}

export function useDeleteNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/api/nodes/{id}', { params: { path: { id } } })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.nodes });
      void qc.invalidateQueries({ queryKey: ['edges'] });
    },
  });
}

export function useCreateEdge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewEdge) => unwrap(await api.POST('/api/edges', { body: input })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['edges'] }),
  });
}

export function useDeleteEdge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/api/edges/{id}', { params: { path: { id } } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['edges'] }),
  });
}

/** 一个节点按顺序包含的子节点（一页里的各块）。 */
export function useChildren(id: string) {
  return useQuery({
    queryKey: keys.children(id),
    queryFn: async () =>
      unwrap(await api.GET('/api/nodes/{id}/children', { params: { path: { id } } })),
  });
}

export async function createChildren(id: string, input: NewChildren) {
  return unwrap(
    await api.POST('/api/nodes/{id}/children', { params: { path: { id } }, body: input }),
  );
}

export async function reorderChildren(id: string, ids: string[]) {
  return unwrap(await api.PUT('/api/nodes/{id}/children', { params: { path: { id } }, body: ids }));
}

export async function patchNode(id: string, patch: NodePatch) {
  return unwrap(await api.PATCH('/api/nodes/{id}', { params: { path: { id } }, body: patch }));
}

export async function deleteNode(id: string) {
  return unwrap(await api.DELETE('/api/nodes/{id}', { params: { path: { id } } }));
}

/** 上传图片，返回可以写进 Markdown 的地址。 */
export async function uploadImage(file: Blob): Promise<string> {
  const res = await fetch('/api/files', {
    method: 'POST',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  const body = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
  if (!res.ok || !body.url) throw new Error(body.message ?? res.statusText);
  return body.url;
}

/** 块的增删改之后：刷新节点列表和关系（正文里的 #标记 会新建节点、改关系）。 */
export function useRefreshGraph() {
  const qc = useQueryClient();
  return useCallback(() => {
    void qc.invalidateQueries({ queryKey: keys.nodes, exact: true });
    void qc.invalidateQueries({ queryKey: ['edges'] });
  }, [qc]);
}

/** 直接改缓存里的子节点列表（编辑器做乐观更新用）。 */
export function useSetChildren(id: string) {
  const qc = useQueryClient();
  return useCallback(
    (fn: (list: Node[]) => Node[]) =>
      qc.setQueryData<Node[]>(keys.children(id), (old) => fn(old ?? [])),
    [qc, id],
  );
}

/** 正文 `{ md }`。（生成的类型把任意对象写成了 Record<string, never>，这里统一转一下。） */
export function mdBody(md: string) {
  return { md } as unknown as Record<string, never>;
}

/** 草图的正文：画面数据 + 整张图的图片（文件 id）。 */
export function sketchBody(scene: unknown, image?: string) {
  return { scene, ...(image ? { image } : {}) } as unknown as Record<string, never>;
}

/** 一个节点上的分享链接（含已作废的）。 */
export function useShares(node: string) {
  return useQuery({
    queryKey: keys.shares(node),
    queryFn: async () =>
      unwrap(await api.GET('/api/nodes/{id}/shares', { params: { path: { id: node } } })),
  });
}

/** 开一条分享链接：`read` 给 AI 读，`write` 给 AI 改。 */
export function useCreateShare(node: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (mode: ShareMode) =>
      unwrap(
        await api.POST('/api/nodes/{id}/shares', {
          params: { path: { id: node } },
          body: { mode },
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.shares(node) }),
  });
}

/** 作废一条分享链接。 */
export function useRevokeShare(node: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/api/shares/{id}', { params: { path: { id } } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.shares(node) }),
  });
}
