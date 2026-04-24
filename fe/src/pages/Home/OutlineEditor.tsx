import CodeMirror from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { EditorView } from '@codemirror/view'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bold, Italic, Heading1, Heading2, Heading3, Minus, Code2, Loader2, Save, CheckCircle2 } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { slideApi } from '../../api/slideApi'
import toast from 'react-hot-toast'
import clsx from 'clsx'

const DEBOUNCE_MS = 1200
const AUTO_SAVE_STORAGE_KEY = 'slide-ai-agent:auto-save-enabled'

// Light purple CodeMirror theme
const violetTheme = EditorView.theme({
  '&': {
    fontSize: '13px',
    fontFamily: 'JetBrains Mono, Fira Code, Consolas, monospace',
    backgroundColor: '#faf9ff',
    height: '100%',
  },
  '.cm-content': { padding: '16px' },
  '.cm-line': { lineHeight: '1.7' },
  '.cm-gutters': { backgroundColor: '#f5f3ff', borderRight: '1px solid #ede9fe', color: '#a78bfa' },
  '.cm-activeLineGutter': { backgroundColor: '#ede9fe' },
  '.cm-activeLine': { backgroundColor: '#f5f3ff80' },
  '.cm-cursor': { borderLeftColor: '#7c3aed' },
  '.cm-selectionBackground': { backgroundColor: '#ddd6fe !important' },
})

interface OutlineEditorProps {
  onSaved?: (md: string) => void
  onActiveSlideChange?: (slideNumber: number) => void
  /** Bump this to force the editor to remount and pick up external markdown changes. */
  externalRefreshKey?: number
}

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

function getSlideNumberForPosition(markdownContent: string, position: number) {
  const lines = markdownContent.split('\n')
  let frontmatterEnd = -1

  if (lines[0]?.trim() === '---') {
    for (let i = 1; i < lines.length; i += 1) {
      if (lines[i].trim() === '---') {
        frontmatterEnd = i
        break
      }
    }
  }

  let slideNumber = 1
  let offset = 0

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const lineStart = offset
    offset += line.length + 1

    if (lineStart > position) break

    const isFrontmatterSeparator = frontmatterEnd !== -1 && (index === 0 || index === frontmatterEnd)
    if (line.trim() === '---' && !isFrontmatterSeparator) {
      slideNumber += 1
    }
  }

  return slideNumber
}

export default function OutlineEditor({ onSaved, onActiveSlideChange, externalRefreshKey = 0 }: OutlineEditorProps) {
  const { session, setSession, updateMarkdown } = useAppStore()
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draftMarkdownRef = useRef(session?.markdown ?? '')
  const lastSavedMarkdownRef = useRef(session?.markdown ?? '')
  const sessionRef = useRef(session)
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(() => {
    const stored = window.localStorage.getItem(AUTO_SAVE_STORAGE_KEY)
    return stored === null ? true : stored === 'true'
  })
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const cursorSlideSync = useMemo(() => EditorView.updateListener.of((update) => {
    if (!onActiveSlideChange) return
    if (!update.selectionSet && !update.docChanged) return

    onActiveSlideChange(
      getSlideNumberForPosition(
        update.state.doc.toString(),
        update.state.selection.main.head,
      ),
    )
  }), [onActiveSlideChange])

  useEffect(() => {
    sessionRef.current = session
    draftMarkdownRef.current = session?.markdown ?? ''
    lastSavedMarkdownRef.current = session?.markdown ?? ''
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setSaveState('idle')
  }, [session?.id, session?.markdown])

  useEffect(() => {
    if (!onActiveSlideChange) return
    onActiveSlideChange(1)
  }, [onActiveSlideChange, session?.id])

  const saveOutline = useCallback(async (source: 'auto' | 'manual') => {
    const currentSession = sessionRef.current
    const markdown = draftMarkdownRef.current

    if (!currentSession) return
    if (saveState === 'saving') return
    if (source === 'auto' && markdown === lastSavedMarkdownRef.current) return

    setSaveState('saving')
    try {
      const updatedSession = await slideApi.update(currentSession.id, { markdown })
      lastSavedMarkdownRef.current = updatedSession.markdown
      setSession(updatedSession)
      setSaveState('saved')
      onSaved?.(updatedSession.markdown)
    } catch {
      setSaveState('error')
      toast.error('Failed to save outline')
    }
  }, [onSaved, saveState, setSession])

  const scheduleAutoSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      void saveOutline('auto')
    }, DEBOUNCE_MS)
  }, [saveOutline])

  const handleChange = useCallback(
    (value: string) => {
      draftMarkdownRef.current = value
      updateMarkdown(value)
      setSaveState('dirty')

      if (autoSaveEnabled) {
        scheduleAutoSave()
      } else if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
      }
    },
    [autoSaveEnabled, scheduleAutoSave, updateMarkdown],
  )

  const insertText = (before: string, after = '', placeholder = 'text') => {
    // Simplified insertion — just appends to end for now
    const current = session?.markdown ?? ''
    const newMd = current + '\n' + before + placeholder + after
    handleChange(newMd)
  }

  const toolbarActions = [
    { icon: <Bold className="w-4 h-4" />, title: 'Bold', onClick: () => insertText('**', '**', 'bold text') },
    { icon: <Italic className="w-4 h-4" />, title: 'Italic', onClick: () => insertText('_', '_', 'italic text') },
    { icon: <Heading1 className="w-4 h-4" />, title: 'H1', onClick: () => insertText('\n# ', '', 'Heading 1') },
    { icon: <Heading2 className="w-4 h-4" />, title: 'H2', onClick: () => insertText('\n## ', '', 'Heading 2') },
    { icon: <Heading3 className="w-4 h-4" />, title: 'H3', onClick: () => insertText('\n### ', '', 'Heading 3') },
    { icon: <Minus className="w-4 h-4" />, title: 'Slide separator', onClick: () => handleChange((session?.markdown ?? '') + '\n\n---\n\n') },
    { icon: <Code2 className="w-4 h-4" />, title: 'Code block', onClick: () => insertText('\n```\n', '\n```', 'code here') },
  ]

  useEffect(() => {
    window.localStorage.setItem(AUTO_SAVE_STORAGE_KEY, String(autoSaveEnabled))

    if (autoSaveEnabled && draftMarkdownRef.current !== lastSavedMarkdownRef.current) {
      scheduleAutoSave()
    }
  }, [autoSaveEnabled, scheduleAutoSave])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isSaveShortcut = (event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 's'
      if (!isSaveShortcut) return

      event.preventDefault()
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      void saveOutline('manual')
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [saveOutline])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  const saveStatusLabel = (() => {
    switch (saveState) {
      case 'dirty':
        return autoSaveEnabled ? 'Waiting to auto-save…' : 'Unsaved changes'
      case 'saving':
        return 'Saving…'
      case 'saved':
        return autoSaveEnabled ? 'Saved automatically' : 'Saved'
      case 'error':
        return 'Save failed'
      default:
        return autoSaveEnabled ? 'Auto-save enabled' : 'Manual save mode'
    }
  })()

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-primary-100 bg-primary-50/50 flex-wrap">
        {toolbarActions.map((action, i) => (
          <button
            key={i}
            onClick={action.onClick}
            title={action.title}
            className="p-1.5 rounded hover:bg-primary-100 text-primary-600 hover:text-primary-800 transition-colors"
          >
            {action.icon}
          </button>
        ))}
        <div className="ml-auto flex w-full items-center justify-end gap-2 pt-2 sm:w-auto sm:flex-nowrap sm:pt-0">
          <span className="hidden 2xl:inline max-w-[220px] text-right text-xs text-gray-400">
            {autoSaveEnabled ? 'Drag divider to resize. Auto-render after save.' : 'Press Ctrl+Shift+S to save and refresh preview.'}
          </span>

          <button
            type="button"
            role="switch"
            aria-checked={autoSaveEnabled}
            onClick={() => setAutoSaveEnabled((enabled) => !enabled)}
            className={clsx(
              'inline-flex min-w-[112px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full border px-2 py-1 text-xs font-medium transition-colors',
              autoSaveEnabled
                ? 'border-primary-200 bg-primary-100 text-primary-700'
                : 'border-amber-200 bg-amber-50 text-amber-700',
            )}
            title={autoSaveEnabled ? 'Disable auto-save' : 'Enable auto-save'}
          >
            <span
              className={clsx(
                'relative h-4 w-7 shrink-0 rounded-full transition-colors',
                autoSaveEnabled ? 'bg-primary-500' : 'bg-amber-400',
              )}
            >
              <span
                className={clsx(
                  'absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform',
                  autoSaveEnabled ? 'translate-x-3.5' : 'translate-x-0.5',
                )}
              />
            </span>
            {autoSaveEnabled ? 'Auto-save on' : 'Auto-save off'}
          </button>

          <div
            className={clsx(
              'flex min-w-[118px] shrink-0 items-center gap-1.5 whitespace-nowrap text-xs',
              saveState === 'error' ? 'text-red-500' : 'text-gray-500',
            )}
          >
            {saveState === 'saving' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {saveState === 'saved' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
            {!autoSaveEnabled && saveState !== 'saving' && (
              <Save className="h-3.5 w-3.5 text-amber-500" />
            )}
            <span>{saveStatusLabel}</span>
          </div>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        <CodeMirror
          key={`${session?.id ?? 'none'}-${externalRefreshKey}`}
          value={session?.markdown ?? ''}
          height="100%"
          extensions={[markdown(), violetTheme, cursorSlideSync]}
          onChange={handleChange}
          basicSetup={{
            lineNumbers: true,
            foldGutter: false,
            dropCursor: true,
            allowMultipleSelections: false,
            indentOnInput: true,
          }}
          style={{ height: '100%' }}
        />
      </div>
    </div>
  )
}
