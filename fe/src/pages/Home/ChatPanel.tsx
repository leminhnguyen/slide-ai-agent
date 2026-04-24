import { useEffect, useRef, useState } from 'react'
import { Send, Bot, User, Loader2 } from 'lucide-react'
import { streamChat } from '../../api/chatApi'
import { slideApi } from '../../api/slideApi'
import { useAppStore } from '../../store/useAppStore'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import type { ChatMessage, Document } from '../../types'

interface ChatPanelProps {
  onSlideUpdated: () => void
}

const WELCOME: ChatMessage = {
  role: 'assistant',
  content:
    'Hello! I\'m your AI slide assistant. Describe what you want to present and I\'ll build the outline. Upload sources in the Sources tab, select the ones you want in context, or tag a file in chat with @filename.',
}

type MentionQuery = {
  query: string
  start: number
}

function formatTagMention(filename: string) {
  return /\s/.test(filename) ? `@"${filename}"` : `@${filename}`
}

function getMentionQuery(input: string, caret: number): MentionQuery | null {
  const beforeCaret = input.slice(0, caret)
  const quotedMatch = beforeCaret.match(/(?:^|\s)@"([^"]*)$/)
  if (quotedMatch) {
    return {
      query: quotedMatch[1],
      start: beforeCaret.lastIndexOf('@'),
    }
  }

  const plainMatch = beforeCaret.match(/(?:^|\s)@([^\s@"]*)$/)
  if (plainMatch) {
    return {
      query: plainMatch[1],
      start: beforeCaret.lastIndexOf('@'),
    }
  }

  return null
}

function extractTaggedDocuments(input: string, docs: Document[]) {
  const taggedIds = new Set<string>()
  const mentionPattern = /(^|\s)@(?:"([^"]+)"|([^\s]+))/g

  let match: RegExpExecArray | null = null
  while ((match = mentionPattern.exec(input)) !== null) {
    const rawName = match[2] ?? match[3]
    const doc = docs.find((item) => item.filename === rawName)
    if (doc) {
      taggedIds.add(doc.id)
    }
  }

  return Array.from(taggedIds)
}

function stripMentionTokens(input: string) {
  return input
    .replace(/(^|\s)@(?:"([^"]+)"|([^\s]+))/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export default function ChatPanel({ onSlideUpdated }: ChatPanelProps) {
  const { session, documents, selectedDocumentIds } = useAppStore()
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = '0px'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`
  }, [input])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Reset messages when session changes
  useEffect(() => {
    setMessages([WELCOME])
  }, [session?.id])

  const mentionState = getMentionQuery(input, textareaRef.current?.selectionStart ?? input.length)
  const mentionSuggestions = mentionState
    ? documents.filter((doc) =>
        doc.filename.toLowerCase().includes(mentionState.query.toLowerCase()),
      ).slice(0, 6)
    : []
  const taggedDocumentIds = extractTaggedDocuments(input, documents)
  const taggedDocuments = documents.filter((doc) => taggedDocumentIds.includes(doc.id))
  const selectedDocuments = documents.filter((doc) => selectedDocumentIds.includes(doc.id))

  const insertMention = (doc: Document) => {
    const textarea = textareaRef.current
    if (!textarea) return

    const caret = textarea.selectionStart ?? input.length
    const mention = getMentionQuery(input, caret)
    if (!mention) return

    const mentionToken = `${formatTagMention(doc.filename)} `
    textarea.focus()
    textarea.setRangeText(mentionToken, mention.start, caret, 'end')
    setInput(textarea.value)
  }

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || !session || streaming) return
    const cleanedMessage = stripMentionTokens(text)
    const messageForAgent = cleanedMessage || text

    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: text }])
    setStreaming(true)

    // Add placeholder assistant message
    setMessages(prev => [...prev, { role: 'assistant', content: '' }])

    try {
      let accumulated = ''
      const { slide_updated } = await streamChat(
        session.id,
        messageForAgent,
        {
          selectedDocumentIds,
          taggedDocumentIds,
        },
        chunk => {
          accumulated += chunk
          setMessages(prev => {
            const copy = [...prev]
            copy[copy.length - 1] = { role: 'assistant', content: accumulated }
            return copy
          })
        },
      )

      if (slide_updated) {
        onSlideUpdated()
        // Refresh the session markdown from backend
        const updated = await slideApi.get(session.id)
        useAppStore.getState().setSession(updated)
      }
    } catch (e) {
      toast.error('Chat error. Please try again.')
      setMessages(prev => {
        const copy = [...prev]
        copy[copy.length - 1] = {
          role: 'assistant',
          content: 'Sorry, something went wrong. Please try again.',
        }
        return copy
      })
    } finally {
      setStreaming(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={clsx(
              'flex gap-2 items-start',
              msg.role === 'user' ? 'flex-row-reverse' : 'flex-row',
            )}
          >
            {/* Avatar */}
            <div
              className={clsx(
                'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0',
                msg.role === 'user'
                  ? 'bg-primary-600 text-white'
                  : 'bg-primary-100 text-primary-600',
              )}
            >
              {msg.role === 'user' ? (
                <User className="w-3.5 h-3.5" />
              ) : (
                <Bot className="w-3.5 h-3.5" />
              )}
            </div>

            {/* Bubble */}
            <div
              className={clsx(
                'max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed',
                msg.role === 'user'
                  ? 'bg-primary-600 text-white rounded-tr-sm'
                  : 'bg-primary-50 text-gray-800 border border-primary-100 rounded-tl-sm',
                !msg.content && 'min-w-[60px]',
              )}
            >
              {msg.content ? (
                <span className="whitespace-pre-wrap">{msg.content}</span>
              ) : (
                <span className="flex gap-1 items-center py-0.5">
                  <span className="w-1.5 h-1.5 bg-primary-400 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 bg-primary-400 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 bg-primary-400 rounded-full animate-bounce [animation-delay:300ms]" />
                </span>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-primary-100 p-3">
        {(selectedDocuments.length > 0 || taggedDocuments.length > 0) && (
          <div className="mb-2 space-y-1">
            {selectedDocuments.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                <span className="font-medium text-gray-400">Selected:</span>
                {selectedDocuments.map((doc) => (
                  <span key={doc.id} className="rounded-full bg-primary-50 px-2 py-0.5 text-primary-700 border border-primary-100">
                    {doc.filename}
                  </span>
                ))}
              </div>
            )}
            {taggedDocuments.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                <span className="font-medium text-gray-400">Tagged in this message:</span>
                {taggedDocuments.map((doc) => (
                  <span key={doc.id} className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700 border border-amber-100">
                    {formatTagMention(doc.filename)}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="flex items-end">
          <div className="relative flex-1">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder='Ask AI to create or edit slides. Type @ to tag a source.'
              rows={2}
              disabled={!session || streaming}
              className="w-full resize-none border border-primary-200 rounded-xl px-3 py-3 pr-12 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white placeholder:text-gray-400 disabled:opacity-50 overflow-y-auto"
              style={{ minHeight: '72px', maxHeight: '160px' }}
            />
            {mentionState && mentionSuggestions.length > 0 && (
              <div className="absolute bottom-full left-0 mb-2 w-full rounded-xl border border-primary-100 bg-white p-1 shadow-lg">
                {mentionSuggestions.map((doc) => (
                  <button
                    key={doc.id}
                    onClick={() => insertMention(doc)}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-primary-50"
                  >
                    <span className="truncate text-gray-700">{formatTagMention(doc.filename)}</span>
                    <span className="ml-3 shrink-0 text-xs text-gray-400">{doc.chunk_count} chunks</span>
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={sendMessage}
              disabled={!input.trim() || !session || streaming}
              className="absolute bottom-2 right-2 w-9 h-9 bg-primary-600 hover:bg-primary-700 disabled:opacity-40 text-white rounded-xl flex items-center justify-center transition-colors flex-shrink-0"
            >
              {streaming ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-1.5 px-1">
          Enter to send · Shift+Enter for newline · Type <code>@</code> to tag a source file
        </p>
      </div>
    </div>
  )
}
