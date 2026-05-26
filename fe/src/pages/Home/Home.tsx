import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { MessageSquare, FileText, Loader2, ChevronLeft, ChevronRight, History } from 'lucide-react'
import Topbar from './Topbar'
import OutlineEditor from './OutlineEditor'
import SlidePreview from './SlidePreview'
import ChatPanel from './ChatPanel'
import SourcesPanel from './SourcesPanel'
import SessionDrawer from './SessionDrawer'
import PanelDivider from '../../components/PanelDivider'
import { slideApi } from '../../api/slideApi'
import { useAppStore } from '../../store/useAppStore'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import type { SlideSessionSummary } from '../../types'

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
const ACTIVE_SESSION_STORAGE_KEY = 'slide-ai-agent.activeSessionId'

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export default function Home() {
  const navigate = useNavigate()
  const { sessionId: routeSessionId } = useParams<{ sessionId: string }>()
  const { session, setSession, setSessions } = useAppStore()
  const [bootstrapping, setBootstrapping] = useState(true)
  const [leftTab, setLeftTab] = useState<LeftTab>('chat')
  const [sessionDrawerOpen, setSessionDrawerOpen] = useState(false)
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
    startPixels: PanelRatios
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
  const minimumPixels = useMemo(() => ({
    left: Math.min(LEFT_MIN, availablePanelWidth * 0.18),
    center: Math.min(CENTER_MIN, availablePanelWidth * 0.28),
    right: Math.min(RIGHT_MIN, availablePanelWidth * 0.25),
  }), [availablePanelWidth])

  const ratiosToPixels = useCallback((ratios: PanelRatios): PanelRatios => {
    const total = Math.max(ratios.left + ratios.center + ratios.right, 1)
    return {
      left: (ratios.left / total) * availablePanelWidth,
      center: (ratios.center / total) * availablePanelWidth,
      right: (ratios.right / total) * availablePanelWidth,
    }
  }, [availablePanelWidth])

  const pixelsToRatios = useCallback((pixels: PanelRatios): PanelRatios => {
    const total = Math.max(pixels.left + pixels.center + pixels.right, 1)
    return {
      left: (pixels.left / total) * 100,
      center: (pixels.center / total) * 100,
      right: (pixels.right / total) * 100,
    }
  }, [])

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
      startPixels: ratiosToPixels(panelRatios),
    }
    setActiveDivider(side)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
  }, [panelRatios, ratiosToPixels])

  const handleDocumentPointerMove = useCallback((e: PointerEvent) => {
    const dragState = dragStateRef.current
    if (!dragState) return

    const deltaPx = e.clientX - dragState.startX

    const nextRatios = (() => {
      if (dragState.side === 'left') {
        const nextLeft = clamp(
          dragState.startPixels.left + deltaPx,
          minimumPixels.left,
          availablePanelWidth - dragState.startPixels.right - minimumPixels.center,
        )

        return pixelsToRatios({
          left: nextLeft,
          center: availablePanelWidth - dragState.startPixels.right - nextLeft,
          right: dragState.startPixels.right,
        })
      }

      const nextCenter = clamp(
        dragState.startPixels.center + deltaPx,
        minimumPixels.center,
        availablePanelWidth - dragState.startPixels.left - minimumPixels.right,
      )

      return pixelsToRatios({
        left: dragState.startPixels.left,
        center: nextCenter,
        right: availablePanelWidth - dragState.startPixels.left - nextCenter,
      })
    })()

    pendingRatiosRef.current = nextRatios

    if (frameRef.current !== null) return
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null
      if (pendingRatiosRef.current) {
        setPanelRatios(pendingRatiosRef.current)
      }
    })
  }, [availablePanelWidth, minimumPixels, pixelsToRatios])

  const handleDividerPointerMove = useCallback((_side: DividerSide, _e: React.PointerEvent<HTMLDivElement>) => {
    // Dragging is handled at document level so movement continues across
    // iframes and editor surfaces.
  }, [])

  const endDividerDrag = useCallback(() => {
    dragStateRef.current = null
    pendingRatiosRef.current = null
    setActiveDivider(null)
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
  }, [])

  const handleDividerPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    endDividerDrag()
  }, [endDividerDrag])

  useEffect(() => {
    if (!activeDivider) return

    document.addEventListener('pointermove', handleDocumentPointerMove)
    document.addEventListener('pointerup', endDividerDrag)
    document.addEventListener('pointercancel', endDividerDrag)

    return () => {
      document.removeEventListener('pointermove', handleDocumentPointerMove)
      document.removeEventListener('pointerup', endDividerDrag)
      document.removeEventListener('pointercancel', endDividerDrag)
    }
  }, [activeDivider, endDividerDrag, handleDocumentPointerMove])

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

  const activateSession = useCallback((
    nextSession: Awaited<ReturnType<typeof slideApi.get>>,
    options: { replaceUrl?: boolean } = {},
  ) => {
    window.localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, nextSession.id)
    setSession(nextSession)
    setActiveSlide(1)
    setPreviewKey(k => k + 1)
    if (routeSessionId !== nextSession.id) {
      navigate(`/sessions/${encodeURIComponent(nextSession.id)}`, {
        replace: options.replaceUrl ?? false,
      })
    }
  }, [navigate, routeSessionId, setSession])

  const refreshSessions = useCallback(async () => {
    const list = await slideApi.list({ limit: 50 })
    setSessions(list)
    return list
  }, [setSessions])

  // Initialise: prefer the URL session, then the stored/latest session, then create one.
  useEffect(() => {
    let cancelled = false

    const init = async () => {
      try {
        if (routeSessionId) {
          try {
            const s = await slideApi.get(routeSessionId)
            if (!cancelled) {
              activateSession(s, { replaceUrl: true })
              await refreshSessions()
            }
            return
          } catch {
            if (window.localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY) === routeSessionId) {
              window.localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY)
            }
          }
        }

        const storedSessionId = window.localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY)
        if (storedSessionId) {
          try {
            const s = await slideApi.get(storedSessionId)
            if (!cancelled) {
              activateSession(s, { replaceUrl: true })
              await refreshSessions()
            }
            return
          } catch {
            window.localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY)
          }
        }

        const list = await refreshSessions()
        if (cancelled) return

        if (list.length > 0) {
          const s = await slideApi.get(list[0].id)
          if (!cancelled) {
            activateSession(s, { replaceUrl: true })
          }
          return
        }

        const s = await slideApi.create('New Presentation')
        if (!cancelled) {
          activateSession(s, { replaceUrl: true })
        }
        await refreshSessions()
      } catch {
        toast.error('Failed to initialise session')
      } finally {
        if (!cancelled) {
          setBootstrapping(false)
        }
      }
    }
    init()

    return () => {
      cancelled = true
    }
  }, [activateSession, refreshSessions, routeSessionId])

  const handleNewSession = async () => {
    try {
      const s = await slideApi.create('New Presentation')
      activateSession(s)
      await refreshSessions()
      toast.success('New presentation created')
    } catch {
      toast.error('Failed to create new session')
    }
  }

  const handleSelectSession = async (item: SlideSessionSummary) => {
    if (session?.id === item.id) {
      activateSession(session)
      setSessionDrawerOpen(false)
      return
    }

    try {
      const s = await slideApi.get(item.id)
      activateSession(s)
      setSessionDrawerOpen(false)
    } catch {
      toast.error('Failed to open session')
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
              'panel relative flex min-w-0 flex-col overflow-hidden transition-[opacity,transform] duration-200',
              leftCollapsed && 'pointer-events-none -translate-x-2 opacity-0',
            )}
          >
            <SessionDrawer
              open={sessionDrawerOpen}
              activeSessionId={session?.id}
              onClose={() => setSessionDrawerOpen(false)}
              onSelectSession={handleSelectSession}
            />

            {/* Tab switcher */}
            <div className="flex border-b border-primary-100 flex-shrink-0">
              <button
                onClick={() => setSessionDrawerOpen(true)}
                className={clsx(
                  'flex items-center justify-center border-r border-primary-100 px-3 text-xs font-medium transition-colors',
                  sessionDrawerOpen
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-500 hover:bg-primary-50 hover:text-primary-600',
                )}
                title="Sessions and history"
              >
                <History className="h-3.5 w-3.5" />
              </button>
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
                <ChatPanel
                  onSlideUpdated={handleSlideUpdated}
                  activeSlide={activeSlide}
                  onSlideFocused={setActiveSlide}
                />
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
                externalRefreshKey={previewKey}
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
