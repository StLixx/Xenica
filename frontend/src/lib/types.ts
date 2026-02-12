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

// ─── Review (X6) ───

export interface ReviewSchedule {
  id: string
  moment_id: string
  next_review: string
  interval: number
  ease_factor: number
  review_count: number
  created_at: string
}

export interface ReviewDueItem {
  id: string
  moment_id: string
  next_review: string
  interval: number
  ease_factor: number
  review_count: number
  created_at: string
  moment_text?: string
}

export type ReviewResponse = 'again' | 'hard' | 'good' | 'easy'

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
  /** X7: 生成的文章（仅当用户要求生成时有值） */
  generated_article?: GeneratedArticle
}

/** X7: 生成的结构化文章 */
export interface GeneratedArticle {
  title: string
  content: string // Markdown
  source_nodes: string[]
}

/** X7: 从选中节点生成的请求 */
export interface GenerateFromNodesInput {
  node_ids: string[]
  format: 'article' | 'outline' | 'summary'
}

/** X7: 从选中节点生成的响应 */
export interface GenerateFromNodesOutput {
  title: string
  content: string
  source_nodes: string[]
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
  id?: string
  in?: string
  out?: string
  source?: string
  target?: string
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

// ─── Video Import ───

export interface VideoImportResult {
  title: string
  transcript: string
  source_url: string
}

// ─── Markdown Import (X5D) ───

export interface MarkdownImportResult {
  moment_id: string
  entities_extracted: number
  edges_created: number
  dangling_links: string[]
}

// ─── Commander Log Import (X8) ───

export interface CommanderLogEntry {
  date: string
  entries: string[]
}

export interface CommanderLogResult {
  date: string
  moments_created: number
}

// ─── Goal Setup Check (X8) ───

export interface GoalSetupStatus {
  setup_completed: boolean
}

// ─── PDF Import (X5E) ───

export interface PdfImportResult {
  pages_processed: number
  moments_created: number
  entities_extracted: number
  mode_used: string
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
