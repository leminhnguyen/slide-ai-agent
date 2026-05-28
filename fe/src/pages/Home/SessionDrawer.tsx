import { useEffect, useMemo, useState } from 'react'
import { Clock3, Loader2, MessageSquare, Search, Trash2, X } from 'lucide-react'
import clsx from 'clsx'
import { slideApi } from '../../api/slideApi'
import { useAppStore } from '../../store/useAppStore'
import type { SlideSessionSummary } from '../../types'

interface SessionDrawerProps {
  open: boolean
  activeSessionId?: string
  onClose: () => void
  onSelectSession: (session: SlideSessionSummary) => void
  onDeleteSession: (session: SlideSessionSummary) => Promise<void>
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return dateFormatter.format(date)
}

export default function SessionDrawer({
  open,
  activeSessionId,
  onClose,
  onSelectSession,
  onDeleteSession,
}: SessionDrawerProps) {
  const { sessions, setSessions, removeSessionSummary } = useAppStore()
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const normalizedQuery = query.trim()
  const title = normalizedQuery ? 'Search history' : 'Recent sessions'

  useEffect(() => {
    if (!open) return

    const timeout = window.setTimeout(async () => {
      setLoading(true)
      setError(false)
      try {
        const list = await slideApi.list({
          q: normalizedQuery || undefined,
          limit: 50,
        })
        setSessions(list)
      } catch {
        setError(true)
      } finally {
        setLoading(false)
      }
    }, 250)

    return () => window.clearTimeout(timeout)
  }, [normalizedQuery, open, setSessions])

  const emptyText = useMemo(() => {
    if (error) return 'Could not load sessions.'
    if (normalizedQuery) return 'No matching history found.'
    return 'No saved sessions yet.'
  }, [error, normalizedQuery])

  const handleDelete = async (item: SlideSessionSummary) => {
    const confirmed = window.confirm(
      `Delete "${item.title}"? This removes the slides, chat history, and uploaded sources for this session.`,
    )
    if (!confirmed) return

    setDeletingId(item.id)
    try {
      await onDeleteSession(item)
      removeSessionSummary(item.id)
    } catch {
      // Parent handler owns the toast; keep the item visible on failure.
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      {open && <div className="absolute inset-0 z-20 bg-black/10" onClick={onClose} />}
      <aside
        className={clsx(
          'absolute inset-y-0 left-0 z-30 flex w-[min(320px,calc(100%-12px))] flex-col border-r border-primary-100 bg-white shadow-xl transition-transform duration-200',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between border-b border-primary-100 px-3 py-2.5">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-primary-800">{title}</h2>
            <p className="text-xs text-gray-400">Slides and chat transcripts</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-primary-50 hover:text-primary-700"
            title="Close sessions"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-primary-100 p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search sessions or chat"
              className="w-full rounded-lg border border-primary-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loading && sessions.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-primary-500">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-gray-400">{emptyText}</div>
          ) : (
            <div className="space-y-1.5">
              {sessions.map((item) => {
                const preview = item.match_preview || item.last_message_preview
                const active = item.id === activeSessionId

                return (
                  <div
                    key={item.id}
                    className={clsx(
                      'flex w-full items-start gap-2 rounded-lg border p-3 text-left transition-colors',
                      active
                        ? 'border-primary-300 bg-primary-50'
                        : 'border-transparent hover:border-primary-100 hover:bg-primary-50/70',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectSession(item)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">
                          {item.title}
                        </span>
                        <span className="flex shrink-0 items-center gap-1 text-[11px] text-gray-400">
                          <Clock3 className="h-3 w-3" />
                          {formatDate(item.last_activity_at)}
                        </span>
                      </div>

                      {preview && (
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500">
                          {preview}
                        </p>
                      )}

                      <div className="mt-2 flex items-center gap-1 text-[11px] text-gray-400">
                        <MessageSquare className="h-3 w-3" />
                        <span>
                          {item.message_count} message{item.message_count === 1 ? '' : 's'}
                        </span>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(item)}
                      disabled={deletingId === item.id}
                      className="mt-0.5 shrink-0 rounded p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                      title="Delete session"
                    >
                      {deletingId === item.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
