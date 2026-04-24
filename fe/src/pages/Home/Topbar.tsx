import { useState, useRef } from 'react'
import { PresentationIcon, Plus, Download, ChevronDown, Pencil, CircleHelp } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { slideApi } from '../../api/slideApi'
import toast from 'react-hot-toast'

interface TopbarProps {
  onNewSession: () => void
}

export default function Topbar({ onNewSession }: TopbarProps) {
  const { session, updateTitle } = useAppStore()
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [exportOpen, setExportOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)

  const startEditTitle = () => {
    setTitleDraft(session?.title ?? '')
    setEditingTitle(true)
    setTimeout(() => titleInputRef.current?.focus(), 50)
  }

  const commitTitle = async () => {
    if (!session || !titleDraft.trim()) return
    setEditingTitle(false)
    updateTitle(titleDraft.trim())
    try {
      await slideApi.update(session.id, { title: titleDraft.trim() })
    } catch {
      toast.error('Failed to save title')
    }
  }

  const handleExport = (format: 'html' | 'pdf' | 'pptx' | 'md') => {
    if (!session) return
    setExportOpen(false)
    const url = slideApi.exportUrl(session.id, format)
    const a = document.createElement('a')
    a.href = url
    a.download = `${session.title}.${format}`
    a.click()
  }

  const guideSections = [
    {
      title: 'Getting started',
      items: [
        'Create a new presentation with the `New` button in the top bar.',
        'Rename the presentation by clicking the current title.',
      ],
    },
    {
      title: 'Writing slides',
      items: [
        'Create a new slide with a `---` separator line between slides.',
        'Add headings with `#`, `##`, `###` or by using the `H1`, `H2`, `H3` toolbar buttons.',
        'Click inside the content of any slide in the editor to jump the preview to that slide.',
      ],
    },
    {
      title: 'Saving and rendering',
      items: [
        'When `Auto-save` is on, the outline saves automatically after a short delay and the preview re-renders.',
        'When `Auto-save` is off, content is saved and re-rendered only after pressing `Ctrl+Shift+S`.',
      ],
    },
    {
      title: 'Layout',
      items: [
        'Drag the two dividers between panels to resize the left, center, and right layout areas.',
        'Use the arrow button beside the left panel to collapse or reopen chat and sources.',
      ],
    },
  ]

  return (
    <header className="h-14 bg-white border-b border-primary-100 flex items-center px-4 gap-3 flex-shrink-0 z-10">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-2">
        <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-700 rounded-lg flex items-center justify-center">
          <PresentationIcon className="w-4 h-4 text-white" />
        </div>
        <span className="font-semibold text-primary-800 text-sm hidden sm:block">Slide AI</span>
      </div>

      <div className="w-px h-6 bg-primary-100" />

      {/* Session title */}
      {session && (
        <div className="flex items-center gap-1 min-w-0">
          {editingTitle ? (
            <input
              ref={titleInputRef}
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={e => { if (e.key === 'Enter') commitTitle() }}
              className="border border-primary-300 rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 min-w-0 max-w-[200px]"
            />
          ) : (
            <button
              onClick={startEditTitle}
              className="flex items-center gap-1 text-sm font-medium text-gray-800 hover:text-primary-700 truncate max-w-[200px] group"
            >
              <span className="truncate">{session.title}</span>
              <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-60 flex-shrink-0" />
            </button>
          )}
        </div>
      )}

      <div className="flex-1" />

      {/* Actions */}
      <div className="relative">
        <button
          onClick={() => setGuideOpen((open) => !open)}
          className="btn-ghost flex items-center gap-1.5"
          title="Quick guide"
        >
          <CircleHelp className="w-4 h-4" />
          <span className="hidden md:inline">Guide</span>
        </button>
        {guideOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setGuideOpen(false)} />
            <div className="absolute right-0 top-full z-20 mt-1 w-[360px] max-w-[calc(100vw-24px)] rounded-2xl border border-primary-100 bg-white p-4 shadow-lg">
              <h3 className="text-sm font-semibold text-primary-800">Quick guide</h3>
              <div className="mt-3 space-y-3">
                {guideSections.map((section) => (
                  <section key={section.title} className="rounded-xl border border-primary-100 bg-primary-50/40 p-3">
                    <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-primary-700">
                      {section.title}
                    </h4>
                    <div className="mt-2 space-y-1.5 text-sm leading-5 text-gray-600">
                      {section.items.map((item) => (
                        <p key={item}>{item}</p>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <button onClick={onNewSession} className="btn-secondary flex items-center gap-1.5">
        <Plus className="w-4 h-4" />
        <span className="hidden sm:inline">New</span>
      </button>

      {/* Export dropdown */}
      <div className="relative">
        <button
          onClick={() => setExportOpen(o => !o)}
          disabled={!session}
          className="btn-primary flex items-center gap-1.5 disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          <span className="hidden sm:inline">Export</span>
          <ChevronDown className="w-3 h-3" />
        </button>
        {exportOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)} />
            <div className="absolute right-0 top-full mt-1 bg-white border border-primary-100 rounded-xl shadow-lg z-20 min-w-[140px] py-1">
              {(['html', 'pdf', 'pptx', 'md'] as const).map(fmt => (
                <button
                  key={fmt}
                  onClick={() => handleExport(fmt)}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-primary-50 text-gray-700 hover:text-primary-700"
                >
                  {fmt.toUpperCase()}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </header>
  )
}
