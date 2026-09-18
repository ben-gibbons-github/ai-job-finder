import { getCacheDb } from '../database/connection.js'
import { employerImpactCategoryFromLabel, type EmployerImpactCategory } from './EmployerImpactCategory.js'

const CACHE_TTL_MS = 15_000

let cachedMap: Map<string, EmployerImpactCategory[]> = new Map()
let cachedAt = 0

function normalizeEmployerKey(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function parseClassificationCategories(classificationJson: string): EmployerImpactCategory[] {
  try {
    const parsed = JSON.parse(classificationJson) as Record<string, unknown>
    const rawValues = [parsed.primary_category, parsed.secondary_category, parsed.tertiary_category]
    const categories: EmployerImpactCategory[] = []
    for (const raw of rawValues) {
      const category = employerImpactCategoryFromLabel(raw)
      if (category && !categories.includes(category)) {
        categories.push(category)
      }
    }
    return categories
  } catch {
    return []
  }
}

function loadEmployerImpactCategoryMap(): Map<string, EmployerImpactCategory[]> {
  try {
    const db = getCacheDb()
    const rows = db.prepare(
      "SELECT employer_key, classification_json FROM scraped_employer_cache WHERE TRIM(classification_json) != ''",
    ).all() as Array<{ employer_key?: string; classification_json?: string }>

    const map = new Map<string, EmployerImpactCategory[]>()
    for (const row of rows) {
      const key = normalizeEmployerKey(row.employer_key)
      if (!key) {
        continue
      }
      const categories = parseClassificationCategories(String(row.classification_json ?? ''))
      if (categories.length > 0) {
        map.set(key, categories)
      }
    }
    return map
  } catch {
    return new Map()
  }
}

/** Employer classification data is written directly to SQLite by the background worker, so poll with a short TTL. */
function getEmployerImpactCategoryMap(): Map<string, EmployerImpactCategory[]> {
  const now = Date.now()
  if (now - cachedAt > CACHE_TTL_MS) {
    cachedMap = loadEmployerImpactCategoryMap()
    cachedAt = now
  }
  return cachedMap
}

export function getEmployerImpactCategoriesForJob(job: {
  company_name?: string
  scrapedEmployer?: { name?: string }
}): EmployerImpactCategory[] {
  const key = normalizeEmployerKey(job.scrapedEmployer?.name || job.company_name)
  if (!key) {
    return []
  }
  return getEmployerImpactCategoryMap().get(key) ?? []
}
