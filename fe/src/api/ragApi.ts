import type { Document } from '../types'
import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

export const ragApi = {
  upload: (sessionId: string, file: File) => {
    const form = new FormData()
    form.append('session_id', sessionId)
    form.append('file', file)
    return api.post<Document>('/rag/upload', form).then(r => r.data)
  },

  listDocuments: (sessionId: string) =>
    api.get<Document[]>(`/rag/documents/${sessionId}`).then(r => r.data),

  deleteDocument: (docId: string) =>
    api.delete(`/rag/documents/${docId}`),
}
