import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MessageSquare, FileText, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import Topbar from './Topbar'
import OutlineEditor from './OutlineEditor'
import SlidePreview from './SlidePreview'
import ChatPanel from './ChatPanel'
import SourcesPanel from './SourcesPanel'
import PanelDivider from '../../components/PanelDivider'
import { slideApi } from '../../api/slideApi'
import { useAppStore } from '../../store/useAppStore'
import toast from 'react-hot-toast'
import clsx from 'clsx'

type LeftTab = 'chat' | 'sources'
type DividerSide = 'left' | 'right'
type PanelRatios = {
  left: number
  center: number
  right: number
}

const DEFAULT_PANEL_RATIOS: PanelRatios = {
  left: 20,
  center: 40,
  right: 40,
}

const LEFT_MIN = 220
const CENTER_MIN = 360
const RIGHT_MIN = 300
const LEFT_HANDLE_WIDTH = 20
const RIGHT_DIVIDER_WIDTH = 12

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export default function Home() {
  const { setSession } = useAppStore()
  const [bootstrapping, setBootstrapping] = useState(true)
  const [leftTab, setLeftTab] = useState<LeftTab>('chat')
  const [previewKey, setPreviewKey] = useState(0)
  const [activeSlide, setActiveSlide] = useState(1)
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [panelRatios, setPanelRatios] = useState<PanelRatios>(DEFAULT_PANEL_RATIOS)
  const [workspaceWidth, setWorkspaceWidth] = useState(0)
  const [activeDivider, setActiveDivider] = useState<DividerSide | null>(null)

  const workspaceRef = useRef<HTMLDivElement | null>(null)
  const expandedRatiosRef = useRef(DEFAULT_PANEL_RATIOS)
  const dragStateRef = useRef<{
    side: DividerSide
    startX: number
    startRatios: PanelRatios
  } | null>(null)
  const pendingRatiosRef = useRef<PanelRatios | null>(null)
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    const node = workspaceRef.current
    if (!node) return

    const updateWidth = () => {
      setWorkspaceWidth(node.getBoundingClientRect().width)
    }

    updateWidth()

    const observer = new ResizeObserver(updateWidth)
    observer.observe(node)

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!leftCollapsed) {
      expandedRatiosRef.current = panelRatios
    }
  }, [leftCollapsed, panelRatios])

  const availablePanelWidth = Math.max(workspaceWidth - LEFT_HANDLE_WIDTH - RIGHT_DIVIDER_WIDTH, 1)
  const minimumRatios = useMemo(() => {
    const raw = {
      left: (LEFT_MIN / availablePanelWidth) * 100,
      center: (CENTER_MIN / availablePanelWidth) * 100,
      right: (RIGHT_MIN / availablePanelWidth) * 100,
    }
    const total = raw.left + raw.center + raw.right
    const scale = total > 100 ? 100 / total : 1

    return {
      left: raw.left * scale,
      center: raw.center * scale,
      right: raw.right * scale,
    }
  }, [availablePanelWidth])

  const gridTemplateColumns = useMemo(() => {
    const leftTrack = leftCollapsed ? '0px' : `minmax(0, ${panelRatios.left}fr)`

    return `${leftTrack} ${LEFT_HANDLE_WIDTH}px minmax(0, ${panelRatios.center}fr) ${RIGHT_DIVIDER_WIDTH}px minmax(0, ${panelRatios.right}fr)`
  }, [leftCollapsed, panelRatios])

  const handleDividerPointerDown = useCallback((side: DividerSide, e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragStateRef.current = {
      side,
      startX: e.clientX,
      startRatios: panelRatios,
    }
    setActiveDivider(side)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
  }, [panelRatios])

  const handleDividerPointerMove = useCallback((side: DividerSide, e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return

    const dragState = dragStateRef.current
    if (!dragState || dragState.side !== side) return

    const deltaRatio = ((e.clientX - dragState.startX) / availablePanelWidth) * 100

    const nextRatios = (() => {
      if (side === 'left') {
        const nextLeft = clamp(
          dragState.startRatios.left + deltaRatio,
          minimumRatios.left,
          100 - dragState.startRatios.right - minimumRatios.center,
        )

        return {
          left: nextLeft,
          center: 100 - dragState.startRatios.right - nextLeft,
          right: dragState.startRatios.right,
        }
      }

      const nextCenter = clamp(
        dragState.startRatios.center + deltaRatio,
        minimumRatios.center,
        100 - dragState.startRatios.left - minimumRatios.right,
      )

      return {
        left: dragState.startRatios.left,
        center: nextCenter,
        right: 100 - dragState.startRatios.left - nextCenter,
      }
    })()

    pendingRatiosRef.current = nextRatios

    if (frameRef.current !== null) return
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null
      if (pendingRatiosRef.current) {
        setPanelRatios(pendingRatiosRef.current)
      }
    })
  }, [availablePanelWidth, minimumRatios])

  const handleDividerPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    dragStateRef.current = null
    pendingRatiosRef.current = null
    setActiveDivider(null)
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
  }, [])

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
      }
    }
  }, [])

  const toggleLeftPanel = useCallback(() => {
    if (leftCollapsed) {
      setPanelRatios(expandedRatiosRef.current)
      setLeftCollapsed(false)
      return
    }

    setPanelRatios((currentRatios) => {
      expandedRatiosRef.current = currentRatios
      const visibleTotal = currentRatios.center + currentRatios.right

      return {
        left: 0,
        center: (currentRatios.center / visibleTotal) * 100,
        right: (currentRatios.right / visibleTotal) * 100,
      }
    })
    setLeftCollapsed(true)
  }, [leftCollapsed])

  // Initialise: create a default session on first visit
  useEffect(() => {
    const init = async () => {
      try {
        const s = await slideApi.create('New Presentation')
        setSession(s)
      } catch {
        toast.error('Failed to initialise session')
      } finally {
        setBootstrapping(false)
      }
    }
    init()
  }, [])

  const handleNewSession = async () => {
    try {
      const s = await slideApi.create('New Presentation')
      setSession(s)
      setActiveSlide(1)
      setPreviewKey(k => k + 1)
      toast.success('New presentation created')
    } catch {
      toast.error('Failed to create new session')
    }
  }

  const handleSlideUpdated = useCallback(() => {
    setPreviewKey(k => k + 1)
  }, [])

  const handleOutlineSaved = useCallback(() => {
    setPreviewKey(k => k + 1)
  }, [])

  if (bootstrapping) {
    return (
      <div className="flex items-center justify-center h-screen bg-primary-50">
        <div className="flex flex-col items-center gap-3 text-primary-600">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p className="text-sm font-medium">Starting up…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-primary-50">
      <Topbar onNewSession={handleNewSession} />

      {/* Main workspace */}
      <div className="flex flex-1 overflow-hidden p-2">

        <div
          ref={workspaceRef}
          className="grid flex-1 min-w-0 overflow-hidden"
          style={{ gridTemplateColumns }}
        >
          {/* ── Left panel: Chat + Sources ───────────────────────── */}
          <div
            className={clsx(
              'panel flex min-w-0 flex-col overflow-hidden transition-[opacity,transform] duration-200',
              leftCollapsed && 'pointer-events-none -translate-x-2 opacity-0',
            )}
          >
            {/* Tab switcher */}
            <div className="flex border-b border-primary-100 flex-shrink-0">
              {([
                { id: 'chat' as const, label: 'Chat', icon: <MessageSquare className="w-3.5 h-3.5" /> },
                { id: 'sources' as const, label: 'Sources', icon: <FileText className="w-3.5 h-3.5" /> },
              ] as const).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setLeftTab(tab.id)}
                  className={clsx(
                    'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors',
                    leftTab === tab.id
                      ? 'text-primary-700 border-b-2 border-primary-600 bg-white'
                      : 'text-gray-500 hover:text-primary-600 hover:bg-primary-50',
                  )}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-hidden">
              <div className={clsx('h-full', leftTab !== 'chat' && 'hidden')}>
                <ChatPanel onSlideUpdated={handleSlideUpdated} />
              </div>
              <div className={clsx('h-full', leftTab !== 'sources' && 'hidden')}>
                <SourcesPanel />
              </div>
            </div>
          </div>

          {/* Collapse toggle + resize divider for left panel */}
          <div className="relative flex h-full w-full flex-col items-center">
            <button
              onClick={toggleLeftPanel}
              className="absolute top-2 z-10 rounded p-0.5 text-primary-400 transition-colors hover:bg-primary-100 hover:text-primary-600"
              title={leftCollapsed ? 'Expand panel' : 'Collapse panel'}
            >
              {leftCollapsed
                ? <ChevronRight className="h-3.5 w-3.5" />
                : <ChevronLeft className="h-3.5 w-3.5" />}
            </button>

            {!leftCollapsed && (
              <div className="flex h-full w-full items-center justify-center pt-8">
                <PanelDivider
                  onPointerDown={(e) => handleDividerPointerDown('left', e)}
                  onPointerMove={(e) => handleDividerPointerMove('left', e)}
                  onPointerUp={handleDividerPointerUp}
                  active={activeDivider === 'left'}
                />
              </div>
            )}
          </div>

          {/* ── Centre panel: Markdown outline editor ───────────── */}
          <div className="panel flex min-w-0 flex-col overflow-hidden">
            <div className="panel-header">
              <span className="text-sm font-medium text-primary-800">Outline</span>
              <span className="text-xs text-gray-400">Marp Markdown</span>
            </div>
            <div className="flex-1 overflow-hidden">
              <OutlineEditor
                onSaved={handleOutlineSaved}
                onActiveSlideChange={setActiveSlide}
              />
            </div>
          </div>

          {/* Resize divider for right panel */}
          <div className="flex h-full items-center justify-center">
            <PanelDivider
              onPointerDown={(e) => handleDividerPointerDown('right', e)}
              onPointerMove={(e) => handleDividerPointerMove('right', e)}
              onPointerUp={handleDividerPointerUp}
              active={activeDivider === 'right'}
            />
          </div>

          {/* ── Right panel: Slide preview ──────────────────────── */}
          <div className="panel flex min-w-0 flex-col overflow-hidden">
            <SlidePreview activeSlide={activeSlide} refreshKey={previewKey} />
          </div>
        </div>
      </div>
    </div>
  )
}
