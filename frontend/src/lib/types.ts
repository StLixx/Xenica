// ─── 基础 API 响应 ───

export interface ApiResponse<T> {
  success: boolean
  data: T
}

export interface ApiError {
  success: boolean
  error: string
}

// ─── 数据模型 ───

export interface Conversation {
  id: string
  title?: string
  created_at: string
  model?: string
}

export interface Moment {
  id: string
  raw_input: string
  refined?: string
  trigger?: string
  timestamp: string
  location?: string
  perspectives: string[]
  conversation_id?: string
  extracted: boolean
  weight: number
}

export interface Entity {
  id: string
  name: string
  entity_type: string
  description?: string
  weight: number
}

export interface Message {
  id: string
  conversation_id?: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  moment_id?: string
}

export interface Goal {
  id: string
  title: string
  description?: string
  priority?: number
  created_at: string
}

export interface Relation {
  id: string
  in: string
  out: string
  relation_type: 'semantic' | 'temporal' | 'sensory' | 'evolution'
  description?: string
  strength?: number
}

// ─── Chat ───

export interface ChatInput {
  conversation_id?: string
  message: string
  model?: string
}

export interface ChatOutput {
  reply: string
  conversation_id: string
  moment_id: string
}

// ─── Graph ───

export interface GraphTraverseResult {
  center: Record<string, unknown>
  nodes: GraphNode[]
  edges: GraphEdge[]
  depth: number
}

export interface GraphNode {
  id: string
  type?: 'moment' | 'entity'
  label?: string
  raw_input?: string
  refined?: string
  name?: string
  entity_type?: string
  description?: string
  perspectives?: string[]
  weight?: number
}

export interface GraphEdge {
  id: string
  in: string
  out: string
  relation_type?: string
  description?: string
  strength?: number
}

export interface GraphStats {
  total_moments: number
  total_entities: number
  total_edges: number
  total_conversations: number
  perspectives: Record<string, number>
  top_entities: Array<{ name: string; weight: number }>
}

export interface SearchResult {
  moments: Moment[]
  entities: Entity[]
  total: number
}

export interface Perspective {
  name: string
  count: number
}

// ─── OCR ───

export interface OcrResult {
  text: string
  confidence: number
}

// ─── Theme ───

export type ThemeName = 'amber' | 'indigo' | 'olive'
export type ThemeMode = 'dark' | 'light'

export interface ThemeConfig {
  theme: ThemeName
  mode: ThemeMode
}

// ─── View ───

export type ViewType = 'graph' | 'timeline' | 'list'
