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
  let buffer = ''
  let slideUpdated = false

  // Parse a complete SSE event (one or more "data:" lines terminated by a blank line).
  // Per the SSE spec, multiple "data:" lines inside a single event are joined with '\n'.
  const handleEvent = (eventText: string) => {
    const dataLines: string[] = []
    for (const line of eventText.split('\n')) {
      if (line.startsWith('data: ')) dataLines.push(line.slice(6))
      else if (line.startsWith('data:')) dataLines.push(line.slice(5))
    }
    if (dataLines.length === 0) return
    const data = dataLines.join('\n')
    const normalized = data.trimStart()

    if (normalized.startsWith('__META__:') || normalized.startsWith('META:')) {
      try {
        const prefixLength = normalized.startsWith('__META__:') ? 9 : 5
        const meta = JSON.parse(normalized.slice(prefixLength))
        slideUpdated = meta.slide_updated === true
      } catch (_) {}
      return
    }

    if (!data.trim()) return
    onChunk(data)
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    // Events are separated by a blank line (\n\n)
    let sep: number
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const eventText = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      handleEvent(eventText)
    }
  }
  // Flush any trailing event without a final blank line
  if (buffer.trim()) handleEvent(buffer)

  return { slide_updated: slideUpdated }
}
