import React from 'react'
import './EmployerCategoryFilter.css'
import { EMPLOYER_IMPACT_CATEGORIES, EMPLOYER_IMPACT_CATEGORY_ICONS, EMPLOYER_IMPACT_CATEGORY_LABELS, type EmployerImpactCategory } from './EmployerImpactCategory'

interface EmployerCategoryFilterProps {
  selectedCategory: EmployerImpactCategory | null
  onChange: (selectedCategory: EmployerImpactCategory | null) => void
}

const EmployerCategoryFilter: React.FC<EmployerCategoryFilterProps> = ({ selectedCategory, onChange }) => {
  const toggleCategory = (category: EmployerImpactCategory) => {
    onChange(selectedCategory === category ? null : category)
  }

  const handleClear = () => onChange(null)

  return (
    <div className="employer-category-filter">
      <div className="employer-category-filter__grid">
        {EMPLOYER_IMPACT_CATEGORIES.map((category) => {
          const isSelected = selectedCategory === category
          return (
            <button
              key={category}
              type="button"
              className={`employer-category-filter__tile${isSelected ? ' employer-category-filter__tile--active' : ''}`}
              aria-pressed={isSelected}
              title={EMPLOYER_IMPACT_CATEGORY_LABELS[category]}
              onClick={() => toggleCategory(category)}
            >
              <span className="employer-category-filter__tile-icon" aria-hidden="true">{EMPLOYER_IMPACT_CATEGORY_ICONS[category]}</span>
              <span className="employer-category-filter__tile-label">{EMPLOYER_IMPACT_CATEGORY_LABELS[category]}</span>
            </button>
          )
        })}
      </div>

      <div className="employer-category-filter__actions">
        <button type="button" className="employer-category-filter__action-btn" onClick={handleClear} disabled={selectedCategory === null}>
          Clear
        </button>
      </div>
    </div>
  )
}

export default EmployerCategoryFilter
