import { useCallback, useRef, useState } from 'react'

/**
 * Drag-to-resize hook using Pointer Capture API.
 * Pointer capture ensures events keep firing even when the cursor moves
 * over iframes, CodeMirror, or any other element that normally swallows events.
 */
export function useResizePanel(opts: {
  initialSize: number
  min: number
  max: number
  side: 'left' | 'right'
}) {
  const { initialSize, min, max, side } = opts
  const [size, setSize] = useState(initialSize)
  const [isDragging, setIsDragging] = useState(false)
  const startX = useRef(0)
  const startSize = useRef(initialSize)
  // Keep a ref in sync so onPointerDown never captures stale closure state
  const sizeRef = useRef(initialSize)
  sizeRef.current = size

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    startX.current = e.clientX
    startSize.current = sizeRef.current
    setIsDragging(true)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    const delta = e.clientX - startX.current
    const next = side === 'left'
      ? startSize.current + delta
      : startSize.current - delta
    setSize(Math.max(min, Math.min(max, next)))
  }, [min, max, side])

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId)
    setIsDragging(false)
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
  }, [])

  return { size, setSize, isDragging, onPointerDown, onPointerMove, onPointerUp }
}

