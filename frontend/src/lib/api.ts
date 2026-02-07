import type {
  ApiResponse,
  Conversation,
  Moment,
  Entity,
  Message,
  Goal,
  ChatInput,
  ChatOutput,
  GraphTraverseResult,
  GraphStats,
  SearchResult,
  Perspective,
  OcrResult,
} from './types'

const BASE = '/api'

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }

  const json: ApiResponse<T> = await res.json()
  return json.data
}

// ─── Health ───

export async function getHealth() {
  return request<{ status: string; service: string; version: string }>('/health')
}

// ─── Conversations ───

export async function createConversation(title?: string, model?: string) {
  return request<Conversation>('/conversations', {
    method: 'POST',
    body: JSON.stringify({ title, model }),
  })
}

export async function listConversations() {
  return request<Conversation[]>('/conversations')
}

export async function getConversationMessages(id: string) {
  return request<Message[]>(`/conversations/${id}/messages`)
}

// ─── Moments ───

export async function listMoments(params?: {
  conversation_id?: string
  perspective?: string
  limit?: number
  offset?: number
}) {
  const searchParams = new URLSearchParams()
  if (params?.conversation_id) searchParams.set('conversation_id', params.conversation_id)
  if (params?.perspective) searchParams.set('perspective', params.perspective)
  if (params?.limit) searchParams.set('limit', String(params.limit))
  if (params?.offset) searchParams.set('offset', String(params.offset))
  const qs = searchParams.toString()
  return request<Moment[]>(`/moments${qs ? `?${qs}` : ''}`)
}

export async function getMoment(id: string) {
  return request<Moment>(`/moments/${id}`)
}

export async function createMoment(input: {
  raw_input: string
  trigger?: string
  location?: string
  perspectives?: string[]
  conversation_id?: string
}) {
  return request<Moment>('/moments', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** 检测后端是否可达 */
export async function checkHealth(): Promise<boolean> {
  try {
    await getHealth()
    return true
  } catch {
    return false
  }
}

// ─── Entities ───

export async function listEntities() {
  return request<Entity[]>('/entities')
}

// ─── Search ───

export async function search(q: string, type?: string, perspective?: string, limit?: number) {
  const searchParams = new URLSearchParams({ q })
  if (type) searchParams.set('type', type)
  if (perspective) searchParams.set('perspective', perspective)
  if (limit) searchParams.set('limit', String(limit))
  return request<SearchResult>(`/search?${searchParams}`)
}

// ─── Chat ───

export async function sendChat(input: ChatInput) {
  return request<ChatOutput>('/chat', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

// ─── Graph ───

export async function graphTraverse(id: string, depth?: number) {
  const qs = depth ? `?depth=${depth}` : ''
  return request<GraphTraverseResult>(`/graph/traverse/${id}${qs}`)
}

export async function graphStats() {
  return request<GraphStats>('/graph/stats')
}

export async function graphTop(limit?: number) {
  const qs = limit ? `?limit=${limit}` : ''
  return request<{ nodes: Array<Record<string, unknown>> }>(`/graph/top${qs}`)
}

// ─── Perspectives ───

export async function listPerspectives() {
  return request<{ perspectives: Perspective[]; total: number }>('/perspectives')
}

// ─── Relations ───

export async function createRelation(from: string, to: string, relation_type: string, description?: string, strength?: number) {
  return request('/relations', {
    method: 'POST',
    body: JSON.stringify({ from, to, relation_type, description, strength }),
  })
}

// ─── Goals ───

export async function listGoals() {
  return request<Goal[]>('/goals')
}

export async function createGoal(title: string, description?: string, priority?: number) {
  return request<Goal>('/goals', {
    method: 'POST',
    body: JSON.stringify({ title, description, priority }),
  })
}

// ─── OCR ───

/** 上传图片进行 OCR 识别（multipart/form-data） */
export async function ocrImage(file: File): Promise<OcrResult> {
  const formData = new FormData()
  formData.append('image', file)

  const res = await fetch(`${BASE}/ocr`, {
    method: 'POST',
    body: formData,
    // 不手动设置 Content-Type — 浏览器会自动添加 boundary
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }

  const json: ApiResponse<OcrResult> = await res.json()
  return json.data
}

// ─── Extract ───

export async function extractMoment(id: string) {
  return request(`/moments/${id}/extract`, { method: 'POST' })
}

export async function extractConversation(id: string) {
  return request(`/conversations/${id}/extract`, { method: 'POST' })
}
