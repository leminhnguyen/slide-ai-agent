import axios from 'axios'
import type { SlideSession } from '../types'

const api = axios.create({ baseURL: '/api' })
export type ExportFormat = 'html' | 'pdf' | 'pptx' | 'pptx-editable' | 'md'

function getFilenameFromDisposition(disposition: string | null, fallback: string) {
  if (!disposition) return fallback

  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1])
  }

  const basicMatch = disposition.match(/filename="([^"]+)"/i)
  if (basicMatch?.[1]) {
    return basicMatch[1]
  }

  return fallback
}

export const slideApi = {
  create: (title = 'Untitled Presentation') =>
    api.post<SlideSession>('/slides', { title }).then(r => r.data),

  get: (id: string) =>
    api.get<SlideSession>(`/slides/${id}`).then(r => r.data),

  update: (id: string, data: { title?: string; markdown?: string }) =>
    api.put<SlideSession>(`/slides/${id}`, data).then(r => r.data),

  exportUrl: (id: string, format: ExportFormat) =>
    `/api/slides/${id}/export?format=${format}`,

  exportFile: async (id: string, format: ExportFormat, fallbackFilename: string) => {
    const response = await fetch(`/api/slides/${id}/export?format=${format}`)

    if (!response.ok) {
      let message = `Export failed with status ${response.status}.`

      try {
        const contentType = response.headers.get('content-type') || ''
        if (contentType.includes('application/json')) {
          const payload = await response.json()
          if (typeof payload?.detail === 'string' && payload.detail) {
            message = payload.detail
          }
        } else {
          const text = await response.text()
          if (text.trim()) {
            message = text.trim()
          }
        }
      } catch {
        // Ignore parsing errors and keep fallback message.
      }

      throw new Error(message)
    }

    return {
      blob: await response.blob(),
      filename: getFilenameFromDisposition(
        response.headers.get('content-disposition'),
        fallbackFilename,
      ),
    }
  },
}
