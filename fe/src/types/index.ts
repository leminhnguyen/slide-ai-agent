// API types

export interface SlideSession {
  id: string
  title: string
  markdown: string
  created_at: string
  updated_at: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  slide_updated?: boolean
}

export interface Document {
  id: string
  session_id: string
  filename: string
  chunk_count: number
  created_at: string
}
