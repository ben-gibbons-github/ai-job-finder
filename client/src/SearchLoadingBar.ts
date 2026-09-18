import { createElement, useEffect, useMemo, useState } from 'react'

interface SearchLoadingBarProps {
  isVisible: boolean
  hasSearchLocation: boolean
  hasSearchResume: boolean
}

function buildSearchStatusLines(hasSearchLocation: boolean, hasSearchResume: boolean): string[] {
  const lines = ['filtering jobs by query']

  if (hasSearchLocation) {
    lines.push(
      'geocoding user coordinates',
      'excluding jobs outside user country',
      'geocoding job coordinates',
    )
  }

  if (hasSearchResume) {
    lines.push('scoring jobs by resume')
  }

  lines.push(
    'auditing jobs with AI',
    'finalizing AI scores',
    'sorting jobs by score',
    'finalizing job rankings',
    'validating final job list',
  )

  return lines
}

export default function SearchLoadingBar({ isVisible, hasSearchLocation, hasSearchResume }: SearchLoadingBarProps) {
  const steps = useMemo(
    () => buildSearchStatusLines(hasSearchLocation, hasSearchResume),
    [hasSearchLocation, hasSearchResume],
  )

  const [visibleStepCount, setVisibleStepCount] = useState(1)
  const [progressPercent, setProgressPercent] = useState(20)

  useEffect(() => {
    if (!isVisible) {
      setVisibleStepCount(1)
      setProgressPercent(20)
      return
    }

    setVisibleStepCount(1)
    setProgressPercent(20)

    const intervalMs = 3000
    const currentInterval = window.setInterval(() => {
      setVisibleStepCount((previous) => Math.min(steps.length, previous + 1))
      setProgressPercent((previous) => Math.min(100, previous + 20))
    }, intervalMs)

    return () => {
      window.clearInterval(currentInterval)
    }
  }, [isVisible, steps.length])

  if (!isVisible) {
    return null
  }

  const visibleSteps = steps.slice(0, visibleStepCount)
  const fillWidth = `${progressPercent}%`

  return createElement(
    'section',
    { className: 'search-loading', 'aria-live': 'polite', 'aria-label': 'Searching jobs' },
    createElement('div', { className: 'search-loading__label' }, 'Searching for the best jobs...'),
    createElement(
      'div',
      { className: 'search-loading__track' },
      createElement('div', { className: 'search-loading__bar', style: { width: fillWidth } }),
    ),
    createElement(
      'div',
      { className: 'search-loading__status-list' },
      visibleSteps.map((status, index) =>
        createElement('div', { key: `${status}-${index}`, className: 'search-loading__status-line' }, status),
      ),
    ),
  )
}
