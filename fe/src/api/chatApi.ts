/**
 * Stream a chat message from the backend SSE endpoint.
 * onChunk is called with each text fragment.
 * Returns { slide_updated: boolean } at the end.
 */
export async function streamChat(
  sessionId: string,
  message: string,
  options: {
    selectedDocumentIds?: string[]
    taggedDocumentIds?: string[]
  },
  onChunk: (text: string) => void,
): Promise<{ slide_updated: boolean }> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      message,
      selected_document_ids: options.selectedDocumentIds ?? [],
      tagged_document_ids: options.taggedDocumentIds ?? [],
    }),
  })

  if (!response.ok) {
    throw new Error(`Chat request failed: ${response.status}`)
  }

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let fullText = ''
  let slideUpdated = false

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const raw = decoder.decode(value, { stream: true })
    // Parse SSE lines
    const lines = raw.split('\n')
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6)
        fullText += data + '\n'

        // Detect metadata line
        if (data.startsWith('__META__:')) {
          try {
            const meta = JSON.parse(data.slice(9))
            slideUpdated = meta.slide_updated === true
          } catch (_) {}
        } else {
          onChunk(data)
        }
      }
    }
  }

  return { slide_updated: slideUpdated }
}
