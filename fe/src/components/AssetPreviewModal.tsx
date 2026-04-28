import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ImagePlus, X } from 'lucide-react'
import type { SlideOption } from '../utils/slides'

interface AssetPreviewModalProps {
  asset: {
    url: string
    alt?: string
  } | null
  slideOptions: SlideOption[]
  selectedSlide: number
  onSelectedSlideChange: (slideNumber: number) => void
  onAddToSlide: () => void
  onClose: () => void
  adding?: boolean
}

export default function AssetPreviewModal({
  asset,
  slideOptions,
  selectedSlide,
  onSelectedSlideChange,
  onAddToSlide,
  onClose,
  adding = false,
}: AssetPreviewModalProps) {
  useEffect(() => {
    if (!asset) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [asset, onClose])

  if (!asset) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">
              {asset.alt?.trim() || 'Generated asset'}
            </p>
            <p className="truncate text-xs text-slate-500">{asset.url}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
            title="Close preview"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-4">
          <img
            src={asset.url}
            alt={asset.alt || 'Generated asset'}
            className="mx-auto block max-h-[68vh] w-auto max-w-full rounded-xl bg-white object-contain shadow-sm"
          />
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-1 flex-col gap-1 sm:flex-row sm:items-center">
            <label htmlFor="slide-picker" className="text-sm font-medium text-slate-700">
              Add to slide
            </label>
            <select
              id="slide-picker"
              value={selectedSlide}
              onChange={(event) => onSelectedSlideChange(Number(event.target.value))}
              className="min-w-[220px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
            >
              {slideOptions.map((slide) => (
                <option key={slide.number} value={slide.number}>
                  {slide.number}. {slide.title}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={onAddToSlide}
            disabled={adding || slideOptions.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ImagePlus className="h-4 w-4" />
            {adding ? 'Adding…' : 'Add to slide'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
