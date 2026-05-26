// API types

export interface SlideSession {
  id: string
  title: string
  markdown: string
  created_at: string
  updated_at: string
  last_activity_at: string
}

export interface SlideSessionSummary {
  id: string
  title: string
  created_at: string
  updated_at: string
  last_activity_at: string
  message_count: number
  last_message_preview: string
  match_preview?: string | null
}

export interface ChatMessage {
  id?: string
  session_id?: string
  role: 'user' | 'assistant'
  content: string
  slide_updated?: boolean
  created_at?: string
}

export interface Document {
  id: string
  session_id: string
  filename: string
  chunk_count: number
  created_at: string
}
