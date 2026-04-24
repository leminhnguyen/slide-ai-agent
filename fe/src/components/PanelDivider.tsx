interface Props {
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void
  active?: boolean
}

/**
 * Vertical drag handle between panels.
 * Uses pointer events so setPointerCapture works correctly.
 */
export default function PanelDivider({ onPointerDown, onPointerMove, onPointerUp, active = false }: Props) {
  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className="group flex h-full w-4 flex-shrink-0 cursor-col-resize select-none items-center justify-center self-stretch touch-none"
      title="Drag to resize panels"
    >
      <div
        className={[
          'h-full w-full rounded-full transition-colors duration-150',
          active ? 'bg-primary-100/80' : 'bg-transparent group-hover:bg-primary-50',
        ].join(' ')}
      >
        <div
          className={[
            'mx-auto mt-1/2 h-12 w-1 -translate-y-1/2 rounded-full transition-all duration-150',
            active ? 'bg-primary-600 shadow-[0_0_0_4px_rgba(139,92,246,0.12)]' : 'bg-primary-200 group-hover:bg-primary-500 group-active:bg-primary-600',
          ].join(' ')}
        />
      </div>
    </div>
  )
}
