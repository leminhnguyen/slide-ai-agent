import axios from 'axios'
import type { SlideSession } from '../types'

const api = axios.create({ baseURL: '/api' })

export const slideApi = {
  create: (title = 'Untitled Presentation') =>
    api.post<SlideSession>('/slides', { title }).then(r => r.data),

  get: (id: string) =>
    api.get<SlideSession>(`/slides/${id}`).then(r => r.data),

  update: (id: string, data: { title?: string; markdown?: string }) =>
    api.put<SlideSession>(`/slides/${id}`, data).then(r => r.data),

  exportUrl: (id: string, format: 'html' | 'pdf' | 'pptx' | 'md') =>
    `/api/slides/${id}/export?format=${format}`,
}
