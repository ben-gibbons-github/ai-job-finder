import { useMemo, useRef, useState } from 'react'

export type InsightsPopoverKey = 'distribution' | 'weights' | 'actions' | 'userNotes'

export interface PinnedHoverPopoverState {
  containerRef: React.RefObject<HTMLDivElement | null>
  visiblePopover: InsightsPopoverKey | null
  setHoverPopover: (popover: InsightsPopoverKey) => void
  clearHoverPopover: () => void
}

export function usePinnedHoverPopover(): PinnedHoverPopoverState {
  const [hoveredPopover, setHoveredPopover] = useState<InsightsPopoverKey | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const visiblePopover = useMemo(() => hoveredPopover, [hoveredPopover])

  const setHoverPopover = (popover: InsightsPopoverKey) => {
    setHoveredPopover(popover)
  }

  const clearHoverPopover = () => {
    setHoveredPopover(null)
  }

  return {
    containerRef,
    visiblePopover,
    setHoverPopover,
    clearHoverPopover,
  }
}
