import { useEffect, useRef, useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import clsx from 'clsx'

// We render Marp in an iframe using a blob URL so it's sandboxed
// The rendering is done client-side via a small Marp worker approach:
// we POST the markdown to the backend /api/slides/:id/export?format=html
// and display the result. For instant preview, we use a debounced approach.

interface SlidePreviewProps {
  activeSlide?: number
  refreshKey?: number
}

function preparePreviewHtml(html: string) {
  const historyGuard = `
    <script>
      (function () {
        var methods = ['pushState', 'replaceState'];
        methods.forEach(function (method) {
          var original = history[method];
          if (typeof original !== 'function') return;
          history[method] = function () {
            try {
              return original.apply(history, arguments);
            } catch (error) {
              return null;
            }
          };
        });
      })();
    </script>
  `

  if (html.includes('</head>')) {
    return html.replace('</head>', `${historyGuard}</head>`)
  }

  return `${historyGuard}${html}`
}

export default function SlidePreview({ activeSlide = 1, refreshKey }: SlidePreviewProps) {
  const { session } = useAppStore()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [loading, setLoading] = useState(false)
  const [iframeReady, setIframeReady] = useState(false)
  const [slideCount, setSlideCount] = useState(1)
  const [currentSlide, setCurrentSlide] = useState(1)
  const [htmlContent, setHtmlContent] = useState<string | null>(null)

  const loadPreview = useCallback(async () => {
    if (!session) return
    setLoading(true)
    setIframeReady(false)
    try {
      const res = await fetch(`/api/slides/${session.id}/export?format=html`)
      if (!res.ok) throw new Error('Export failed')
      const html = await res.text()
      setHtmlContent(preparePreviewHtml(html))

      // Count slides: Marp outputs <section> elements
      const matches = html.match(/<section[^>]*>/g)
      const count = matches ? matches.length : 1
      setSlideCount(count)
    } catch (e) {
      console.error('Preview error:', e)
    } finally {
      setLoading(false)
    }
  }, [session])

  useEffect(() => {
    loadPreview()
  }, [loadPreview, session?.updated_at, refreshKey])

  // Render HTML directly in srcDoc so Marp doesn't trip over blob: history APIs.
  useEffect(() => {
    if (!htmlContent || !iframeRef.current) return
    iframeRef.current.srcdoc = htmlContent
  }, [htmlContent])

  const applySlideToIframe = useCallback((slideNumber: number) => {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return false

    const slides = Array.from(doc.querySelectorAll<HTMLElement>('svg.bespoke-marp-slide'))
    if (!slides.length) return false

    slides.forEach((slide, index) => {
      const active = index === slideNumber - 1
      slide.classList.toggle('bespoke-marp-active', active)
      slide.setAttribute('aria-hidden', active ? 'false' : 'true')
    })

    return true
  }, [])

  const goToSlide = useCallback((n: number) => {
    const clamped = Math.max(1, Math.min(n, slideCount))
    setCurrentSlide(clamped)
    applySlideToIframe(clamped)
  }, [applySlideToIframe, slideCount])

  useEffect(() => {
    if (!htmlContent || !iframeReady) return
    goToSlide(activeSlide)
  }, [activeSlide, goToSlide, htmlContent, iframeReady, slideCount])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="panel-header justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-primary-800">Preview</span>
          {slideCount > 1 && (
            <span className="text-xs text-gray-400">
              {currentSlide} / {slideCount}
            </span>
          )}
        </div>
        <button
          onClick={loadPreview}
          disabled={loading}
          className="btn-ghost p-1.5"
          title="Refresh preview"
        >
          <RefreshCw className={clsx('w-4 h-4 text-primary-500', loading && 'animate-spin')} />
        </button>
      </div>

      {/* iframe */}
      <div className="flex-1 overflow-hidden relative bg-gray-100">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
            <RefreshCw className="w-6 h-6 text-primary-400 animate-spin" />
          </div>
        )}
        <iframe
          ref={iframeRef}
          className="w-full h-full border-0"
          onLoad={() => {
            setIframeReady(true)
            window.requestAnimationFrame(() => {
              goToSlide(activeSlide)
            })
          }}
          sandbox="allow-scripts allow-same-origin"
          title="Slide Preview"
        />
      </div>

      {/* Navigation */}
      {slideCount > 1 && (
        <div className="flex items-center justify-center gap-3 py-2 border-t border-primary-100 bg-primary-50/30">
          <button
            onClick={() => goToSlide(currentSlide - 1)}
            disabled={currentSlide <= 1}
            className="btn-ghost p-1.5 disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex gap-1">
            {Array.from({ length: Math.min(slideCount, 10) }, (_, i) => (
              <button
                key={i}
                onClick={() => goToSlide(i + 1)}
                className={clsx(
                  'w-2 h-2 rounded-full transition-colors',
                  i + 1 === currentSlide ? 'bg-primary-600' : 'bg-primary-200 hover:bg-primary-400',
                )}
              />
            ))}
            {slideCount > 10 && <span className="text-xs text-gray-400 ml-1">+{slideCount - 10}</span>}
          </div>
          <button
            onClick={() => goToSlide(currentSlide + 1)}
            disabled={currentSlide >= slideCount}
            className="btn-ghost p-1.5 disabled:opacity-30"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
