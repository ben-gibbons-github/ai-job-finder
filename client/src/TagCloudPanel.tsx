import React from 'react'

export interface TagCloudEntry {
  word: string
  count: number
}

interface TagCloudPanelProps {
  entries: TagCloudEntry[]
  onWordClick?: (word: string) => void
}

const TagCloudPanel: React.FC<TagCloudPanelProps> = ({ entries, onWordClick }) => {
  if (entries.length === 0) {
    return (
      <div className="tag-cloud-panel tag-cloud-panel--empty">
        Loading keyword leaderboard…
      </div>
    )
  }

  const maxCount = entries[0]?.count ?? 1

  return (
    <div className="tag-cloud-panel">
      <div className="tag-cloud-panel__header">
        <span className="tag-cloud-panel__col-rank">#</span>
        <span className="tag-cloud-panel__col-word">Keyword</span>
        <span className="tag-cloud-panel__col-bar" />
        <span className="tag-cloud-panel__col-count">Count</span>
      </div>
      <div className="tag-cloud-panel__list" role="list">
        {entries.map(({ word, count }, index) => {
          const barWidth = `${((count / maxCount) * 100).toFixed(1)}%`
          return (
            <button
              key={word}
              type="button"
              role="listitem"
              className="tag-cloud-panel__row"
              onClick={() => onWordClick?.(word)}
              title={`Search for "${word}"`}
            >
              <span className="tag-cloud-panel__col-rank">{index + 1}</span>
              <span className="tag-cloud-panel__col-word">{word}</span>
              <span className="tag-cloud-panel__col-bar">
                <span className="tag-cloud-panel__bar-fill" style={{ width: barWidth }} />
              </span>
              <span className="tag-cloud-panel__col-count">{count.toLocaleString()}</span>
            </button>
          )
        })}
      </div>
      <p className="tag-cloud-panel__hint">Click any row to search for that keyword · {entries.length} terms</p>
    </div>
  )
}

export default TagCloudPanel
