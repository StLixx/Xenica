/** 服务端状态全部走 TanStack Query。新加接口时在这里加 hook，视图只用 hook。 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, unwrap, type NewEdge, type NewNode, type NodePatch } from './client';

export const keys = {
  health: ['health'] as const,
  nodes: ['nodes'] as const,
  node: (id: string) => ['nodes', id] as const,
  traces: (id: string) => ['nodes', id, 'traces'] as const,
  edges: (node?: string) => ['edges', node ?? 'all'] as const,
};

export function useHealth() {
  return useQuery({
    queryKey: keys.health,
    queryFn: async () => unwrap(await api.GET('/api/health')),
    refetchInterval: 15_000,
  });
}

export function useNodes() {
  return useQuery({
    queryKey: keys.nodes,
    queryFn: async () => unwrap(await api.GET('/api/nodes')),
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
      unwrap(await api.GET('/api/edges', { params: { query: node ? { node } : {} } })),
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
