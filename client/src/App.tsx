import React, { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import JobTile from './JobTile'
import Pagination from './Pagination'
import SearchTextEntry from './SearchTextEntry'
import LocationDropdown from './LocationDropdown'
import ScoreWeightSliders, { type ScoreWeights } from './ScoreWeightSliders'
import EmployerCategoryFilter from './EmployerCategoryFilter'
import { EMPLOYER_IMPACT_CATEGORY_LABELS, type EmployerImpactCategory } from './EmployerImpactCategory'
import { extractTextFromFile } from './ResumeReader'
import UploadResume from './UploadResume'
import BulkAuditButton from './AuditAllButton'
import GlobalAIButton from './GlobalAIButton'
import { type JobDistributionMeta } from './JobDistributionGraph'
import SearchLoadingBar from './SearchLoadingBar'
import InsightsHoverPopovers from './InsightsHoverPopovers'
import DailyScoreHud from './DailyScoreHud'
import GenericPopover from './GenericPopover'
import { socket } from './socket'
import { type TagCloudEntry } from './TagCloudPanel'
import {
  loadAddedJobs,
  saveAddedJobs,
  loadAllUserNotes,
  loadJobStatusesByUrl,
  loadJobStatusesByCompany,
  loadUserNotesDailyActivity,
  loadJobsViewedDailyActivity,
  loadCommentsWrittenDailyActivity,
  loadUserCreatedJobsDailyActivity,
  loadDailyScoreBreakdownByDay,
  loadClientSearchSettings,
  exportAllLocalDataAsXml,
  importAllLocalDataFromXml,
  saveClientSearchSettings,
  saveUserNote,
  deleteUserNote,
  saveCompanyNote,
  deleteCompanyNote,
  incrementUserNotesAddedToday,
  incrementJobsViewedToday,
  incrementCommentsWrittenToday,
  incrementUserCreatedJobsToday,
  loadCompanyColorTagsByCompany,
  loadHighlightedJobUrl,
  loadPrioritizedEmployerImpactCategory,
  savePrioritizedEmployerImpactCategory,
  type AddedJobDraft,
  type AddedLocalJob,
  type CompanyTagColor,
  type DailyScoreBreakdownByDay,
  type JobStatus,
  type JobStatusesByCompany,
  type UserJobNote,
  type UserRatingMode,
  saveCompanyColorTags,
  saveHighlightedJobUrl,
  setJobStatusByCompany,
  migrateJobStatusesToCompany,
} from './ClientSaveLoad'

type SearchCommand = 'AIAuditAllJobsInThisSearch'

interface ClientSearchPayload {
  query: string
  resumeText: string
  locationText: string
  promptVersionFilter?: string
  includeRemoteJobs: boolean
  userRatingMode: UserRatingMode
  userRatings?: {
    jobRatingsByUrl: Record<string, number>
    companyRatingsByName: Record<string, number>
  }
  userRatingFilter?: {
    ratedJobUrls: string[]
    ratedCompanies: string[]
  }
  start: number
  end: number
  scoreWeights: ScoreWeights
  hiddenJobUrls: string[]
  hiddenCompanies: string[]
  prioritizedEmployerImpactCategory?: EmployerImpactCategory | null
  addedJobs?: Array<{
    name: string
    company_name: string
    location: string
    remote: string
    type: string
    description: string
    source_url: string
    posted: string
  }>
  command?: SearchCommand
}

interface ServerDebugCoverageStats {
  withAuditScoreCount: number
  withAuditScorePct: number
  withAuditCompanyCount: number
  withAuditCompanyPct: number
  withImpactScoreCount: number
  withImpactScorePct: number
  withImpactCompanyCount: number
  withImpactCompanyPct: number
  withQolScoreCount: number
  withQolScorePct: number
  withQolCompanyCount: number
  withQolCompanyPct: number
  withClassificationCount: number
  withClassificationPct: number
  withClassificationCompanyCount: number
  withClassificationCompanyPct: number
  eligibleForBadgeCount: number
  eligibleForBadgePct: number
  eligibleForBadgeCompanyCount: number
  eligibleForBadgeCompanyPct: number
  missingDescriptionCount: number
  missingDescriptionPct: number
  missingDescriptionSources: Array<{
    label: string
    count: number
    pct: number
  }>
  geocodedCount: number
  geocodedPct: number
  scrapeLoad: {
    jobsFromCacheCount: number
    jobsFromCachePct: number
    jobsFromSourceCount: number
    jobsFromSourcePct: number
    cacheSources: Array<{
      label: string
      count: number
      pct: number
    }>
    sourceSources: Array<{
      label: string
      count: number
      pct: number
    }>
    urlCache: {
      totalLookups: number
      hits: number
      hitPct: number
      misses: number
      missPct: number
      hitSources: Array<{
        label: string
        count: number
        pct: number
      }>
      missSources: Array<{
        label: string
        count: number
        pct: number
      }>
    }
    scraperUrlTraversal: Array<{
      label: string
      plannedUrlCount: number | null
      actualUrlCount: number
      actualVsPlannedPct: number | null
      stopReason: string
    }>
  }
  sourceBreakdown: Array<{
    label: string
    count: number
    pct: number
  }>
  debugStatuses: Array<{
    label: string
    count: number
    pct: number
  }>
  aiOverall: {
    companyReviewsCount: number
    summaryLength: {
      overallAvgChars: number
      overallAvgWords: number
      auditAvgChars: number
      auditAvgWords: number
      impactAvgChars: number
      impactAvgWords: number
      qolAvgChars: number
      qolAvgWords: number
    }
    scores: {
      audit: {
        avg: number
        distribution: Array<{
          label: string
          start: number
          end: number
          count: number
          pct: number
        }>
      }
      impact: {
        avg: number
        distribution: Array<{
          label: string
          start: number
          end: number
          count: number
          pct: number
        }>
      }
      qol: {
        avg: number
        distribution: Array<{
          label: string
          start: number
          end: number
          count: number
          pct: number
        }>
      }
    }
  }
  employerConcentration: {
    totalEmployers: number
    totalJobs: number
    curvePoints: Array<{
      employerPct: number
      employerCount: number
      jobsPct: number
      jobCount: number
    }>
    topEmployers: Array<{
      rank: number
      companyName: string
      jobCount: number
      jobPct: number
      cumulativeJobsPct: number
    }>
  }
  cacheIo: {
    totalReadOps: number
    totalWriteOps: number
    totalCacheReadOps: number
    totalDatabaseReadOps: number
    rows: Array<{
      path: string
      kind: 'cache' | 'database'
      backend: string
      dbSourceFile: string
      readOps: number
      readHits: number
      readMisses: number
      writeOps: number
      hybridFlow: {
        dbReadHits: number
        dbReadMisses: number
        legacyReadHits: number
        dbHydrateWrites: number
        dbDirectWrites: number
      }
    }>
  }
  cacheDatabaseSchema: {
    databaseFile: string
    tables: Array<{
      name: string
      tableType: string
      columns: Array<{
        name: string
        type: string
        notNull: boolean
        defaultValue: string
        primaryKeyOrdinal: number
      }>
      keys: Array<{
        kind: 'primary' | 'unique' | 'index' | 'foreign'
        name: string
        columns: string[]
        references: string
      }>
      rowCount: number | null
    }>
  }
}

interface ServerConfigPayload {
  auditEnabled?: boolean
  totalJobs?: number
  totalEmployers?: number
  totalSources?: number
  searchDebugEnabled?: boolean
  debugCoverage?: ServerDebugCoverageStats
  promptVersions?: string[]
}

const HIDDEN_JOBS_CACHE_KEY = 'hiddenJobsByUrl'
const HIDDEN_COMPANIES_CACHE_KEY = 'hiddenCompaniesByName'
const READ_BONUS_AWARDED_JOBS_CACHE_KEY = 'readBonusAwardedJobsByUrl_v1'
const CLIENT_SEARCH_TRACE_ENABLED = true

function traceClientSearch(message: string, extra?: Record<string, unknown>): void {
  if (!CLIENT_SEARCH_TRACE_ENABLED) {
    return
  }
  if (extra) {
    console.log(`[client][searchTrace] ${message}`, extra)
    return
  }
  console.log(`[client][searchTrace] ${message}`)
}

function normalizeCompanyName(companyName?: string): string {
  return String(companyName ?? '').trim().toLowerCase()
}

function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function hasNoteContent(note?: UserJobNote): boolean {
  if (!note) {
    return false
  }
  return note.userScore !== null || String(note.notes ?? '').trim().length > 0
}

function readStringArrayCache(cacheKey: string): string[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const raw = window.localStorage.getItem(cacheKey)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed
      .map((entry) => String(entry ?? '').trim())
      .filter((entry) => entry.length > 0)
  } catch {
    return []
  }
}

function writeStringArrayCache(cacheKey: string, entries: string[]): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(cacheKey, JSON.stringify(entries))
}

const savedSettings = loadClientSearchSettings()

const hasSavedSearchParameters = Boolean(
  savedSettings.query.trim()
  || savedSettings.locationText.trim()
  || savedSettings.resumeText.trim()
  || savedSettings.uploadedResumeName.trim()
  || savedSettings.userRatingMode !== 'none'
  || !savedSettings.includeRemoteJobs
  || savedSettings.hideApplied
  || savedSettings.hideTagColors.length > 0
  || Object.values(savedSettings.scoreWeights).some((weight) => weight !== 1)
)

// ── ScoreWeightsDropdown ──────────────────────────────────────────────────────
interface ScoreWeightsDropdownProps {
  scoreWeights: ScoreWeights
  onScoreWeightsChange: (w: ScoreWeights) => void
  isEnabled: boolean
}
function ScoreWeightsDropdown({ scoreWeights, onScoreWeightsChange, isEnabled }: ScoreWeightsDropdownProps) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])
  return (
    <div className="search-settings-dropdown" ref={ref}>
      <button type="button" className={`search-settings-trigger${!isEnabled ? ' search-settings-trigger--disabled' : ''}`} onClick={() => isEnabled && setOpen(v => !v)} aria-expanded={open} aria-haspopup="true" disabled={!isEnabled}>
        Score weights {open ? '▲' : '▼'}
      </button>
      {open && (
        <div className="search-settings-panel" role="dialog" aria-label="Score weights">
          <ScoreWeightSliders weights={scoreWeights} onChange={onScoreWeightsChange} />
        </div>
      )}
    </div>
  )
}

// ── EmployerCategoryFilterDropdown ────────────────────────────────────────────
interface EmployerCategoryFilterDropdownProps {
  selectedCategory: EmployerImpactCategory | null
  onChange: (selectedCategory: EmployerImpactCategory | null) => void
  isEnabled: boolean
}
function EmployerCategoryFilterDropdown({ selectedCategory, onChange, isEnabled }: EmployerCategoryFilterDropdownProps) {
  const [open, setOpen] = React.useState(false)
  // Draft edits are applied locally while the popover is open; onChange (which triggers a
  // search) only fires once the popover closes so toggling the badge doesn't spam searches.
  const [draft, setDraft] = React.useState<EmployerImpactCategory | null>(selectedCategory)
  const draftRef = React.useRef(draft)
  draftRef.current = draft
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => { setDraft(selectedCategory) }, [selectedCategory])

  const closeAndCommit = () => {
    setOpen(false)
    onChange(draftRef.current)
  }

  const selectAndClose = (nextCategory: EmployerImpactCategory | null) => {
    draftRef.current = nextCategory
    setDraft(nextCategory)
    setOpen(false)
    onChange(nextCategory)
  }

  React.useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) closeAndCommit()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="search-settings-dropdown" ref={ref}>
      <button
        type="button"
        className={`search-settings-trigger${!isEnabled ? ' search-settings-trigger--disabled' : ''}`}
        onClick={() => isEnabled && (open ? closeAndCommit() : setOpen(true))}
        aria-expanded={open}
        aria-haspopup="true"
        disabled={!isEnabled}
      >
        {draft ? `Prioritizing: ${EMPLOYER_IMPACT_CATEGORY_LABELS[draft]}` : 'Prioritize cause'} {open ? '▲' : '▼'}
      </button>
      {open && (
        <div className="search-settings-panel" role="dialog" aria-label="Prioritize cause">
          <EmployerCategoryFilter selectedCategory={draft} onChange={selectAndClose} />
        </div>
      )}
    </div>
  )
}

function formatDebugTextLines(entries: Array<{ label: string; count: number; pct: number }>, pctSuffix = '%'): string[] {
  return entries.map((entry) => `- ${entry.label}: ${entry.count.toLocaleString()} (${entry.pct.toFixed(1)}${pctSuffix})`)
}

interface SourceStatsRow {
  label: string
  totalCount: number | null
  totalPct: number | null
  missingDescCount: number | null
  missingDescPct: number | null
  cacheLoadCount: number | null
  cacheLoadPct: number | null
  freshLoadCount: number | null
  freshLoadPct: number | null
  urlHitCount: number | null
  urlHitPct: number | null
  urlMissCount: number | null
  urlMissPct: number | null
  traversalPlanned: number | null
  traversalActual: number | null
  traversalPct: number | null
  traversalStopReason: string
}

type SourceStatsSortKey = Exclude<keyof SourceStatsRow, 'label' | 'traversalStopReason'>

function buildSourceStatsRows(coverage: ServerDebugCoverageStats | null): SourceStatsRow[] {
  if (!coverage) {
    return []
  }
  const rows = new Map<string, SourceStatsRow>()
  const getRow = (label: string): SourceStatsRow => {
    let row = rows.get(label)
    if (!row) {
      row = {
        label,
        totalCount: null,
        totalPct: null,
        missingDescCount: null,
        missingDescPct: null,
        cacheLoadCount: null,
        cacheLoadPct: null,
        freshLoadCount: null,
        freshLoadPct: null,
        urlHitCount: null,
        urlHitPct: null,
        urlMissCount: null,
        urlMissPct: null,
        traversalPlanned: null,
        traversalActual: null,
        traversalPct: null,
        traversalStopReason: '',
      }
      rows.set(label, row)
    }
    return row
  }

  for (const entry of coverage.sourceBreakdown ?? []) {
    const row = getRow(entry.label)
    row.totalCount = entry.count
    row.totalPct = entry.pct
  }
  for (const entry of coverage.missingDescriptionSources ?? []) {
    const row = getRow(entry.label)
    row.missingDescCount = entry.count
    row.missingDescPct = entry.pct
  }
  for (const entry of coverage.scrapeLoad?.cacheSources ?? []) {
    const row = getRow(entry.label)
    row.cacheLoadCount = entry.count
    row.cacheLoadPct = entry.pct
  }
  for (const entry of coverage.scrapeLoad?.sourceSources ?? []) {
    const row = getRow(entry.label)
    row.freshLoadCount = entry.count
    row.freshLoadPct = entry.pct
  }
  for (const entry of coverage.scrapeLoad?.urlCache?.hitSources ?? []) {
    const row = getRow(entry.label)
    row.urlHitCount = entry.count
    row.urlHitPct = entry.pct
  }
  for (const entry of coverage.scrapeLoad?.urlCache?.missSources ?? []) {
    const row = getRow(entry.label)
    row.urlMissCount = entry.count
    row.urlMissPct = entry.pct
  }
  for (const entry of coverage.scrapeLoad?.scraperUrlTraversal ?? []) {
    const row = getRow(entry.label)
    row.traversalPlanned = entry.plannedUrlCount
    row.traversalActual = entry.actualUrlCount
    row.traversalPct = entry.actualVsPlannedPct
    row.traversalStopReason = entry.stopReason
  }

  return Array.from(rows.values())
}

function formatSchemaColumn(column: {
  name: string
  type: string
  notNull: boolean
  defaultValue: string
  primaryKeyOrdinal: number
}): string {
  const parts: string[] = [column.name]
  if (column.type) {
    parts.push(column.type)
  }
  if (column.primaryKeyOrdinal > 0) {
    parts.push(`pk${column.primaryKeyOrdinal}`)
  }
  if (column.notNull) {
    parts.push('not null')
  }
  if (column.defaultValue) {
    parts.push(`default ${column.defaultValue}`)
  }
  return parts.join(' ')
}

function formatSchemaKey(key: {
  kind: 'primary' | 'unique' | 'index' | 'foreign'
  name: string
  columns: string[]
  references: string
}): string {
  const columnsText = key.columns.length > 0 ? key.columns.join(', ') : 'n/a'
  const referencesText = key.references ? ` -> ${key.references}` : ''
  return `${key.kind} ${key.name} (${columnsText})${referencesText}`
}

function App() {
  const [resumeText, setResumeText] = useState(savedSettings.resumeText)
  const [uploadedResumeName, setUploadedResumeName] = useState(savedSettings.uploadedResumeName)
  const [locationText, setLocationText] = useState(savedSettings.locationText)
  const [query, setQuery] = useState(savedSettings.query)
  const [jobs, setJobs] = useState<any[]>([])
  const [totalItems, setTotalItems] = useState(0)
  const [searchMeta, setSearchMeta] = useState<JobDistributionMeta | null>(null)
  const [isSearching, setIsSearching] = useState(true)
  const [openAiCorpusSignal, setOpenAiCorpusSignal] = useState(0)
  const [searchStart, setSearchStart] = useState(0)
  const [searchEnd, setSearchEnd] = useState(100)
  const [scoreWeights, setScoreWeights] = useState<ScoreWeights>(savedSettings.scoreWeights)
  const [prioritizedEmployerImpactCategory, setPrioritizedEmployerImpactCategory] = useState<EmployerImpactCategory | null>(() => loadPrioritizedEmployerImpactCategory())
  const [auditResults, setAuditResults] = useState<Record<string, { auditScore: number; auditText: string; error?: string }>>({})
  const [auditEnabled, setAuditEnabled] = useState(false)
  const [totalJobsInDb, setTotalJobsInDb] = useState(0)
  const [totalEmployersInDb, setTotalEmployersInDb] = useState(0)
  const [totalSourcesInDb, setTotalSourcesInDb] = useState(0)
  const [searchDebugEnabled, setSearchDebugEnabled] = useState(false)
  const [promptVersions, setPromptVersions] = useState<string[]>([])
  const [selectedPromptVersion, setSelectedPromptVersion] = useState('')
  const [globalDebugCoverage, setGlobalDebugCoverage] = useState<ServerDebugCoverageStats | null>(null)
  const [impactResults, setImpactResults] = useState<Record<string, { ai_impact_score: number; ai_impact_summary: string; error?: string }>>({})
  const [qualityOfLifeResults, setQualityOfLifeResults] = useState<Record<string, { employeeQualityOfLifeScore: number; employeeQualityOfLifeSummary: string; error?: string }>>({})
  const [hiddenJobUrls, setHiddenJobUrls] = useState<string[]>(() => readStringArrayCache(HIDDEN_JOBS_CACHE_KEY))
  const [hiddenCompanies, setHiddenCompanies] = useState<string[]>(() => readStringArrayCache(HIDDEN_COMPANIES_CACHE_KEY))
  const [highlightedJobUrl, setHighlightedJobUrl] = useState<string>(() => loadHighlightedJobUrl())
  const [readBonusAwardedJobUrls, setReadBonusAwardedJobUrls] = useState<string[]>(() => readStringArrayCache(READ_BONUS_AWARDED_JOBS_CACHE_KEY))
  const [userNotesByJob, setUserNotesByJob] = useState<Record<string, UserJobNote>>(() => loadAllUserNotes().perJob)
  const [userNotesByCompany, setUserNotesByCompany] = useState<Record<string, UserJobNote>>(() => loadAllUserNotes().perCompany)
  const [companyColorTagsByCompany, setCompanyColorTagsByCompany] = useState<Record<string, CompanyTagColor[]>>(() => loadCompanyColorTagsByCompany())
  const [jobStatusesByCompany, setJobStatusesByCompany] = useState<JobStatusesByCompany>(() => loadJobStatusesByCompany())
  const [addedJobs, setAddedJobs] = useState<AddedLocalJob[]>(() => loadAddedJobs())
  const [dailyNoteAddsByDay, setDailyNoteAddsByDay] = useState<Record<string, number>>(() => loadUserNotesDailyActivity())
  const [jobsViewedByDay, setJobsViewedByDay] = useState<Record<string, number>>(() => loadJobsViewedDailyActivity())
  const [commentsWrittenByDay, setCommentsWrittenByDay] = useState<Record<string, number>>(() => loadCommentsWrittenDailyActivity())
  const [userCreatedJobsByDay, setUserCreatedJobsByDay] = useState<Record<string, number>>(() => loadUserCreatedJobsDailyActivity())
  const [dailyScoreBreakdownByDay, setDailyScoreBreakdownByDay] = useState<DailyScoreBreakdownByDay>(() => loadDailyScoreBreakdownByDay())
  const [userRatingMode, setUserRatingMode] = useState<UserRatingMode>(savedSettings.userRatingMode)
  const [includeRemoteJobs, setIncludeRemoteJobs] = useState(savedSettings.includeRemoteJobs)
  const [hideApplied, setHideApplied] = useState(savedSettings.hideApplied)
  const [hideTagColors, setHideTagColors] = useState<import('./ClientSaveLoad').CompanyTagColor[]>(savedSettings.hideTagColors)
  const [searchDebugInfo, setSearchDebugInfo] = useState<{
    cacheHit?: boolean
    userLat: number | null
    userLon: number | null
    locationText: string
    query: string
    totalJobsInput: number
    totalJobsVisible: number
    totalJobsMatched: number
    timings?: {
      filterMs: number
      queryMatchMs: number
      userGeocodeMs: number
      jobGeocodeMs: number
      jobGeoHadCoords: number
      jobGeoNewlyGeocoded: number
      jobGeoSkipped: number
      scoreTotalMs: number
      scoreResumeMs: number
      scoreLocationMs: number
      scoreFreshnessMs: number
      scoreAuditMs: number
      scoreQolMs: number
      scoreImpactMs: number
      scoreSortMs: number
      userRatingSortMs: number
      totalMs: number
    }
    exclusions?: {
      hiddenByUrl: number
      hiddenByCompany: number
      remoteJobsFiltered: number
      userRatingFiltered: number
      promptVersionFiltered?: number
      userRatingFilterMode: string
      queryMismatch: number
    }
  } | null>(null)
  const [, setClockTick] = useState(0)
  const [tagCloud, setTagCloud] = useState<TagCloudEntry[]>([])
  const [isResumeLoading, setIsResumeLoading] = useState(false)
  const [isSocketConnected, setIsSocketConnected] = useState(socket.connected)
  const [isDebugTextPopoverOpen, setIsDebugTextPopoverOpen] = useState(false)
  const [debugTextCopyStatus, setDebugTextCopyStatus] = useState('')
  const [sourceStatsSortKey, setSourceStatsSortKey] = useState<SourceStatsSortKey>('totalCount')
  const [sourceStatsSortDir, setSourceStatsSortDir] = useState<'asc' | 'desc'>('desc')
  const hasSentInitialSearchRef = useRef(false)
  const initialPayloadRequestedRef = useRef(false)
  const skipNextAutoSearchRef = useRef(false)
  const initialSearchResponsePendingRef = useRef(false)
  const initialSearchTimerRef = useRef<number | null>(null)
  const lastAutoSearchSignatureRef = useRef<string | null>(null)
  const lastSearchParametersSignatureRef = useRef<string | null>(null)
  const hasSearchResultsRef = useRef(false)
  const debugTextAreaRef = useRef<HTMLTextAreaElement | null>(null)
  const selectedResumeIds: string[] = []
  const resumeCatalogById = {}

  const itemsPerPage = Math.max(1, searchEnd - searchStart)
  const currentPage = Math.floor(searchStart / itemsPerPage) + 1

  const handlePageChange = (page: number) => {
    const safePage = Math.max(1, page)
    const nextStart = (safePage - 1) * itemsPerPage
    setSearchStart(nextStart)
    setSearchEnd(nextStart + itemsPerPage)
  }

  const handleTextSearch = (nextQuery: string) => {
    setQuery(nextQuery)
  }

  useEffect(() => {
    const onSearchResults = (response: { results: any[]; total: number; meta?: JobDistributionMeta; error?: string; isInitialResponse?: boolean }) => {
      traceClientSearch('search:results received', {
        isInitialResponse: Boolean(response?.isInitialResponse),
        hasError: Boolean(response?.error),
        resultCount: Array.isArray(response?.results) ? response.results.length : -1,
        total: response?.total,
      })

      if (response?.isInitialResponse && !initialPayloadRequestedRef.current) {
        traceClientSearch('ignoring unsolicited initial response')
        return
      }

      if (response?.isInitialResponse && initialSearchResponsePendingRef.current) {
        traceClientSearch('ignoring initial response while client initial search is pending')
        return
      }

      if (response?.isInitialResponse && hasSearchResultsRef.current) {
        traceClientSearch('ignoring initial response because non-initial results already exist')
        return
      }

      if (!response?.isInitialResponse) {
        initialSearchResponsePendingRef.current = false
      }

      // Ignore empty result sets — they can arrive out-of-order and would wipe
      // a valid results list that is already displayed.
      if (!response?.results || response.results.length === 0) {
        traceClientSearch('ignoring empty search result payload')
        setIsSearching(false)
        return
      }

      setIsSearching(false)
      if (response?.results) {
        console.log('Received search results:', response.results)
        hasSearchResultsRef.current = response.results.length > 0
        setJobs(response.results)
        setTotalItems(typeof response.total === 'number' ? response.total : response.results.length)
        setSearchMeta(response.meta ?? null)
        setSearchDebugInfo(response.meta?.debugInfo ?? null)
        // Migrate any legacy per-URL statuses to per-company using this result set
        const legacyByUrl = loadJobStatusesByUrl()
        if (Object.keys(legacyByUrl).length > 0) {
          const urlToCompany: Record<string, string> = {}
          for (const wrapper of response.results) {
            const url = String(wrapper?.job?.source_url ?? '').trim()
            const company = String(wrapper?.job?.company_name ?? '').trim()
            if (url && company) urlToCompany[url] = company
          }
          setJobStatusesByCompany((prev) => migrateJobStatusesToCompany(legacyByUrl, prev, urlToCompany))
        }
      }
    }

    const onConnect = () => {
      setIsSocketConnected(true)
      if (!hasSavedSearchParameters && !initialPayloadRequestedRef.current) {
        initialPayloadRequestedRef.current = true
        hasSentInitialSearchRef.current = true
        skipNextAutoSearchRef.current = true
        socket.emit('search:initial')
        traceClientSearch('requested server initial search results')
      }
      traceClientSearch('socket connected', {
        socketId: socket.id,
        connected: socket.connected,
      })
    }

    const onDisconnect = (reason: string) => {
      setIsSocketConnected(false)
      traceClientSearch('socket disconnected', {
        reason,
        connected: socket.connected,
      })
    }

    const onConnectError = (error: Error) => {
      traceClientSearch('socket connect_error', {
        message: error?.message,
        name: error?.name,
      })
    }

    const onAuditResult = (payload: { source_url?: string; auditScore: number; auditText: string; error?: string }) => {
      if (payload?.source_url) {
        setAuditResults((prev) => ({ ...prev, [payload.source_url!]: payload }))
      }
    }

    const onImpactResult = (payload: { source_url?: string; ai_impact_score?: number; ai_impact_summary?: string; impactScore?: number; impactSummary?: string; error?: string }) => {
      if (payload?.source_url) {
        setImpactResults((prev) => ({
          ...prev,
          [payload.source_url!]: {
            ai_impact_score: Number(payload.ai_impact_score ?? payload.impactScore ?? 0),
            ai_impact_summary: String(payload.ai_impact_summary ?? payload.impactSummary ?? ''),
            error: payload.error,
          },
        }))
      }
    }

    const onQualityOfLifeResult = (payload: {
      source_url?: string
      employeeQualityOfLifeScore?: number
      employeeQualityOfLifeSummary?: string
      error?: string
    }) => {
      if (payload?.source_url) {
        setQualityOfLifeResults((prev) => ({
          ...prev,
          [payload.source_url!]: {
            employeeQualityOfLifeScore: Number(payload.employeeQualityOfLifeScore ?? 0),
            employeeQualityOfLifeSummary: String(payload.employeeQualityOfLifeSummary ?? ''),
            error: payload.error,
          },
        }))
      }
    }

    socket.on('search:results', onSearchResults)
    socket.on('job:audit:result', onAuditResult)
    socket.on('job:impact:result', onImpactResult)
    socket.on('job:qualityOfLife:result', onQualityOfLifeResult)
    socket.on('server:tagCloud', (entries: TagCloudEntry[]) => {
      if (Array.isArray(entries) && entries.length > 0) {
        setTagCloud(entries)
      }
    })
    socket.on('server:scoreDistribution', (meta: JobDistributionMeta) => {
      if (meta && typeof meta === 'object') {
        setSearchMeta((current) => current ?? meta)
      }
    })
    socket.on('server:config', (config: ServerConfigPayload) => {
      traceClientSearch('server:config received', {
        auditEnabled: config?.auditEnabled,
        totalJobs: config?.totalJobs,
        searchDebugEnabled: config?.searchDebugEnabled,
        promptVersions: Array.isArray(config?.promptVersions) ? config.promptVersions.length : 0,
      })
      if (typeof config?.auditEnabled === 'boolean') {
        setAuditEnabled(config.auditEnabled)
      }
      if (typeof config?.totalJobs === 'number' && config.totalJobs > 0) {
        setTotalJobsInDb(config.totalJobs)
      }
      if (typeof config?.totalEmployers === 'number') {
        setTotalEmployersInDb(config.totalEmployers)
      }
      if (typeof config?.totalSources === 'number') {
        setTotalSourcesInDb(config.totalSources)
      }
      const debugEnabled = config?.searchDebugEnabled === true
      setSearchDebugEnabled(debugEnabled)
      setGlobalDebugCoverage(debugEnabled && config?.debugCoverage ? config.debugCoverage : null)
      const nextPromptVersions = debugEnabled && Array.isArray(config?.promptVersions)
        ? config.promptVersions
            .map((value) => String(value ?? '').trim())
            .filter((value) => value.length > 0)
        : []
      setPromptVersions(nextPromptVersions)
      setSelectedPromptVersion((current) => (nextPromptVersions.includes(current) ? current : ''))
    })
    socket.on('server:debugCoverage', (debugCoverage: ServerDebugCoverageStats) => {
      if (debugCoverage && typeof debugCoverage === 'object') {
        setGlobalDebugCoverage(debugCoverage)
      }
    })
    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('connect_error', onConnectError)

    if (socket.connected) {
      onConnect()
    }

    traceClientSearch('search listeners attached', {
      connected: socket.connected,
      socketId: socket.id,
    })

    return () => {
      socket.off('search:results', onSearchResults)
      socket.off('job:audit:result', onAuditResult)
      socket.off('job:impact:result', onImpactResult)
      socket.off('job:qualityOfLife:result', onQualityOfLifeResult)
      socket.off('server:tagCloud')
      socket.off('server:scoreDistribution')
      socket.off('server:config')
      socket.off('server:debugCoverage')
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('connect_error', onConnectError)
      traceClientSearch('search listeners detached')
    }
  }, [])

  useEffect(() => {
    writeStringArrayCache(HIDDEN_JOBS_CACHE_KEY, hiddenJobUrls)
  }, [hiddenJobUrls])

  useEffect(() => {
    writeStringArrayCache(HIDDEN_COMPANIES_CACHE_KEY, hiddenCompanies)
  }, [hiddenCompanies])

  useEffect(() => {
    saveHighlightedJobUrl(highlightedJobUrl)
  }, [highlightedJobUrl])

  useEffect(() => {
    writeStringArrayCache(READ_BONUS_AWARDED_JOBS_CACHE_KEY, readBonusAwardedJobUrls)
  }, [readBonusAwardedJobUrls])

  useEffect(() => {
    if (!searchDebugEnabled && selectedPromptVersion) {
      setSelectedPromptVersion('')
    }
  }, [searchDebugEnabled, selectedPromptVersion])

  useEffect(() => {
    saveClientSearchSettings({
      query,
      locationText,
      resumeText,
      uploadedResumeName,
      userRatingMode,
      includeRemoteJobs,
      hideApplied,
      hideTagColors,
      scoreWeights,
    })
  }, [query, locationText, resumeText, uploadedResumeName, userRatingMode, includeRemoteJobs, hideApplied, hideTagColors, scoreWeights])

  useEffect(() => {
    savePrioritizedEmployerImpactCategory(prioritizedEmployerImpactCategory)
  }, [prioritizedEmployerImpactCategory])

  const userRatingsPayload = useMemo(() => {
    const jobRatingsByUrl = Object.fromEntries(
      Object.entries(userNotesByJob)
        .map(([sourceUrl, note]) => {
          const normalizedSourceUrl = String(sourceUrl ?? '').trim()
          const score = Number(note?.userScore)
          return [normalizedSourceUrl, Number.isFinite(score) ? score : NaN] as const
        })
        .filter(([sourceUrl, score]) => sourceUrl.length > 0 && Number.isFinite(score)),
    )

    const companyRatingsByName = Object.fromEntries(
      Object.entries(userNotesByCompany)
        .map(([companyName, note]) => {
          const normalizedCompanyName = normalizeCompanyName(companyName)
          const score = Number(note?.userScore)
          return [normalizedCompanyName, Number.isFinite(score) ? score : NaN] as const
        })
        .filter(([companyName, score]) => companyName.length > 0 && Number.isFinite(score)),
    )

    return {
      jobRatingsByUrl,
      companyRatingsByName,
    }
  }, [userNotesByCompany, userNotesByJob])

  const ratedJobUrls = useMemo(
    () => Object.keys(userRatingsPayload.jobRatingsByUrl),
    [userRatingsPayload],
  )

  const ratedCompanies = useMemo(
    () => Object.keys(userRatingsPayload.companyRatingsByName),
    [userRatingsPayload],
  )

  const userRatingFilter = useMemo(() => {
    if (userRatingMode !== 'ratedOnly') {
      return null
    }

    return {
      ratedJobUrls,
      ratedCompanies,
    }
  }, [userRatingMode, ratedJobUrls, ratedCompanies])

  const addedJobsSearchPayload = useMemo(
    () =>
      addedJobs.map((job) => ({
        name: job.name,
        company_name: job.companyName,
        location: job.location,
        remote: job.remote,
        type: job.type,
        description: job.description,
        source_url: job.sourceUrl,
        posted: job.posted,
        userScore: job.userScore,
      })),
    [addedJobs],
  )

  const addedJobSourceUrls = useMemo(
    () => new Set(addedJobs.map((job) => String(job.sourceUrl ?? '').trim()).filter((value) => value.length > 0)),
    [addedJobs],
  )

  const logSearchLaunch = (
    launchType: 'search' | 'searchWithCommand',
    payload: Pick<ClientSearchPayload, 'query' | 'locationText' | 'start' | 'end' | 'includeRemoteJobs' | 'userRatingMode'> & {
      command?: SearchCommand
      hiddenJobUrls?: string[]
      hiddenCompanies?: string[]
      addedJobs?: ClientSearchPayload['addedJobs']
    },
    reason: string,
  ) => {
    console.log('[client][search] launch', {
      launchType,
      reason,
      query: payload.query,
      queryLength: payload.query.trim().length,
      locationText: payload.locationText,
      start: payload.start,
      end: payload.end,
      includeRemoteJobs: payload.includeRemoteJobs,
      userRatingMode: payload.userRatingMode,
      hiddenJobCount: payload.hiddenJobUrls?.length ?? 0,
      hiddenCompanyCount: payload.hiddenCompanies?.length ?? 0,
      addedJobsCount: payload.addedJobs?.length ?? 0,
      command: payload.command,
      launchedAt: new Date().toISOString(),
    })
  }

  useEffect(() => {
    const emitSearch = (reason: string): boolean => {
      traceClientSearch('emitSearch called', {
        reason,
        connected: socket.connected,
        socketId: socket.id,
        hasSentInitialSearch: hasSentInitialSearchRef.current,
        isResumeLoading,
      })
      const persistedSettings = !hasSentInitialSearchRef.current
        ? loadClientSearchSettings()
        : null
      const effectiveResumeText = persistedSettings?.resumeText?.trim()
        ? persistedSettings.resumeText
        : resumeText
      const hasAttachedResume = uploadedResumeName.trim().length > 0 || effectiveResumeText.trim().length > 0
      if ((isResumeLoading && !effectiveResumeText.trim()) || (hasAttachedResume && !effectiveResumeText.trim())) {
        traceClientSearch('emitSearch skipped due to resume loading/empty extracted text', {
          hasAttachedResume,
          isResumeLoading,
          resumeTextLength: effectiveResumeText.trim().length,
          uploadedResumeName,
        })
        return false
      }

      // Companies to hide derived from filter options
      const derivedHiddenCompanies = [...hiddenCompanies]
      if (hideApplied) {
        for (const [company, record] of Object.entries(jobStatusesByCompany)) {
          if (record.currentStatus !== 'none' && !derivedHiddenCompanies.includes(company)) {
            derivedHiddenCompanies.push(company)
          }
        }
      }
      if (hideTagColors.length > 0) {
        for (const [company, colors] of Object.entries(companyColorTagsByCompany)) {
          if (hideTagColors.some((c) => colors.includes(c)) && !derivedHiddenCompanies.includes(company)) {
            derivedHiddenCompanies.push(company)
          }
        }
      }

      const payload: ClientSearchPayload = {
        query,
        resumeText: effectiveResumeText,
        locationText,
        ...(searchDebugEnabled && selectedPromptVersion ? { promptVersionFilter: selectedPromptVersion } : {}),
        includeRemoteJobs,
        userRatingMode,
        ...(userRatingMode !== 'none' ? { userRatings: userRatingsPayload } : {}),
        ...(userRatingFilter ? { userRatingFilter } : {}),
        start: searchStart,
        end: searchEnd,
        scoreWeights,
        hiddenJobUrls,
        hiddenCompanies: derivedHiddenCompanies,
        prioritizedEmployerImpactCategory,
        addedJobs: addedJobsSearchPayload,
      }

      const searchParametersSignature = JSON.stringify({
        ...payload,
        start: 0,
        end: 0,
      })
      const searchParametersChanged =
        lastSearchParametersSignatureRef.current !== null
        && lastSearchParametersSignatureRef.current !== searchParametersSignature
      lastSearchParametersSignatureRef.current = searchParametersSignature

      if (searchParametersChanged && searchStart !== 0) {
        traceClientSearch('resetting pagination before emit because search parameters changed', {
          previousStart: searchStart,
          previousEnd: searchEnd,
          itemsPerPage,
        })
        setSearchStart(0)
        setSearchEnd(itemsPerPage)
        return false
      }

      const signature = JSON.stringify(payload)
      if (lastAutoSearchSignatureRef.current === signature) {
        traceClientSearch('emitSearch skipped because signature unchanged', {
          reason,
        })
        return false
      }
      lastAutoSearchSignatureRef.current = signature

      setIsSearching(true)
      logSearchLaunch('search', payload, reason)
      traceClientSearch('emitting search payload', {
        reason,
        query: payload.query,
        queryLength: payload.query.trim().length,
        start: payload.start,
        end: payload.end,
        locationText: payload.locationText,
        includeRemoteJobs: payload.includeRemoteJobs,
        userRatingMode: payload.userRatingMode,
        hiddenJobCount: payload.hiddenJobUrls.length,
        hiddenCompanyCount: payload.hiddenCompanies.length,
        addedJobsCount: payload.addedJobs?.length ?? 0,
      })
      socket.emit('search', payload, (ack: { results?: unknown[]; total?: number; error?: string }) => {
        traceClientSearch('search ack callback invoked', {
          hasError: Boolean(ack?.error),
          error: ack?.error,
          total: ack?.total,
          resultCount: Array.isArray(ack?.results) ? ack.results.length : -1,
        })
      })
      return true
    }

    if (!hasSentInitialSearchRef.current) {
      if (!hasSavedSearchParameters) {
        return
      }

      if (initialSearchTimerRef.current !== null) {
        window.clearTimeout(initialSearchTimerRef.current)
      }

      // Coalesce startup state hydration updates into one initial search.
      initialSearchTimerRef.current = window.setTimeout(() => {
        traceClientSearch('initial search timer fired', {
          delayMs: 250,
        })
        initialSearchTimerRef.current = null
        if (!socket.connected && !hasSentInitialSearchRef.current) {
          traceClientSearch('initial search delayed until socket connects')
          return
        }
        initialSearchResponsePendingRef.current = true
        if (emitSearch('initialHydration')) {
          hasSentInitialSearchRef.current = true
        } else {
          initialSearchResponsePendingRef.current = false
        }
      }, 250)

      return () => {
        if (initialSearchTimerRef.current !== null) {
          window.clearTimeout(initialSearchTimerRef.current)
          initialSearchTimerRef.current = null
          traceClientSearch('initial search timer cleared during cleanup')
        }
      }
    }

    if (skipNextAutoSearchRef.current) {
      skipNextAutoSearchRef.current = false
      traceClientSearch('skipping auto-search after requesting server initial results')
      return
    }

    emitSearch('stateChange')
  }, [query, resumeText, uploadedResumeName, isResumeLoading, isSocketConnected, locationText, searchDebugEnabled, selectedPromptVersion, includeRemoteJobs, hideApplied, hideTagColors, userRatingMode, searchStart, searchEnd, itemsPerPage, scoreWeights, hiddenJobUrls, hiddenCompanies, prioritizedEmployerImpactCategory, addedJobsSearchPayload])

  const handleRunAuditAllInSearch = () => {
    const payload: ClientSearchPayload = {
      query,
      resumeText,
      locationText,
      ...(searchDebugEnabled && selectedPromptVersion ? { promptVersionFilter: selectedPromptVersion } : {}),
      includeRemoteJobs,
      userRatingMode,
      ...(userRatingMode !== 'none' ? { userRatings: userRatingsPayload } : {}),
      ...(userRatingFilter ? { userRatingFilter } : {}),
      start: searchStart,
      end: searchEnd,
      scoreWeights,
      hiddenJobUrls,
      hiddenCompanies,
      prioritizedEmployerImpactCategory,
      addedJobs: addedJobsSearchPayload,
      command: 'AIAuditAllJobsInThisSearch',
    }

    logSearchLaunch('searchWithCommand', payload, 'auditAllInSearch')
    traceClientSearch('emitting command search payload', {
      command: payload.command,
      query: payload.query,
      start: payload.start,
      end: payload.end,
    })
    socket.emit('search', payload, (ack: { results?: unknown[]; total?: number; error?: string }) => {
      traceClientSearch('command search ack callback invoked', {
        command: payload.command,
        hasError: Boolean(ack?.error),
        error: ack?.error,
        total: ack?.total,
      })
    })
  }

  const handleExportAllData = () => {
    const xml = exportAllLocalDataAsXml()
    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' })
    const objectUrl = URL.createObjectURL(blob)

    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = `job_finder_backup_${getLocalDateKey()}.xml`
    anchor.click()

    URL.revokeObjectURL(objectUrl)
  }

  const handleExportPageAsCsv = () => {
    const csvCell = (value: unknown): string => {
      const str = String(value ?? '')
      // Wrap in quotes and escape internal quotes per RFC 4180
      return `"${str.replace(/"/g, '""')}"`
    }

    const headers = [
      'Title', 'Company', 'Location', 'Remote', 'Type', 'Source URL', 'Posted',
      'Job Status', 'Status Changed At',
      'Company Tags',
      'Total Score',
      'Score: Resume', 'Score: Impact', 'Score: Location', 'Score: Freshness', 'Score: Audit', 'Score: Quality of Life',
      'User Rating (Job)', 'User Notes (Job)',
      'Company Rating', 'Company Notes',
      'AI Audit Score', 'AI Audit Red Flag Score', 'AI Audit Summary', 'AI Audit Red Flag Summary',
      'AI Impact Score', 'AI Impact Summary',
      'AI QoL Score', 'AI QoL Summary',
      'Description',
    ]

    const rows = visibleJobs.map((wrapper) => {
      const job = wrapper?.job ?? {}
      const scores = wrapper?.scores ?? {}
      const aiPayload = wrapper?.aiPayload ?? {}
      const sourceUrl = String(job.source_url ?? '').trim()
      const companyKey = normalizeCompanyName(job.company_name)

      const jobNote = sourceUrl ? userNotesByJob[sourceUrl] : undefined
      const companyNote = companyKey ? userNotesByCompany[companyKey] : undefined
      const tagColors = companyKey ? (companyColorTagsByCompany[companyKey] ?? []) : []
      const statusRecord = companyKey ? jobStatusesByCompany[companyKey] : undefined
      const auditOverride = sourceUrl ? auditResults[sourceUrl] : undefined
      const impactOverride = sourceUrl ? impactResults[sourceUrl] : undefined
      const qolOverride = sourceUrl ? qualityOfLifeResults[sourceUrl] : undefined

      const auditScore = auditOverride?.auditScore ?? aiPayload.audit?.score ?? ''
      const auditRedFlagScore = aiPayload.audit?.redFlagScore ?? ''
      const auditSummary = auditOverride?.auditText ?? aiPayload.audit?.summary ?? ''
      const auditRedFlagSummary = aiPayload.audit?.redFlagSummary ?? ''
      const impactScore = impactOverride?.ai_impact_score ?? aiPayload.impact?.score ?? ''
      const impactSummary = impactOverride?.ai_impact_summary ?? aiPayload.impact?.summary ?? ''
      const qolScore = qolOverride?.employeeQualityOfLifeScore ?? aiPayload.qualityOfLife?.score ?? ''
      const qolSummary = qolOverride?.employeeQualityOfLifeSummary ?? aiPayload.qualityOfLife?.summary ?? ''

      const totalScoreDisplay = typeof wrapper.totalScore === 'number' ? wrapper.totalScore.toFixed(4) : ''
      const fmtScore = (v: unknown) => (typeof v === 'number' ? v.toFixed(4) : '')

      return [
        csvCell(job.name),
        csvCell(job.company_name),
        csvCell(job.location),
        csvCell(job.remote),
        csvCell(job.type),
        csvCell(sourceUrl),
        csvCell(job.posted),
        csvCell(statusRecord?.currentStatus ?? 'none'),
        csvCell(statusRecord?.history?.at(-1)?.changedAt ?? ''),
        csvCell(tagColors.join(', ')),
        csvCell(totalScoreDisplay),
        csvCell(fmtScore(scores.resume)),
        csvCell(fmtScore(scores.impact)),
        csvCell(fmtScore(scores.location)),
        csvCell(fmtScore(scores.fresh)),
        csvCell(fmtScore(scores.audit)),
        csvCell(fmtScore(scores.qualityOfLife)),
        csvCell(jobNote?.userScore ?? ''),
        csvCell(jobNote?.notes ?? ''),
        csvCell(companyNote?.userScore ?? ''),
        csvCell(companyNote?.notes ?? ''),
        csvCell(auditScore),
        csvCell(auditRedFlagScore),
        csvCell(auditSummary),
        csvCell(auditRedFlagSummary),
        csvCell(impactScore),
        csvCell(impactSummary),
        csvCell(qolScore),
        csvCell(qolSummary),
        csvCell(job.description),
      ].join(',')
    })

    const csvContent = [headers.map((h) => `"${h}"`).join(','), ...rows].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' })
    const objectUrl = URL.createObjectURL(blob)

    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = `job_finder_page_${getLocalDateKey()}.csv`
    anchor.click()

    URL.revokeObjectURL(objectUrl)
  }

  const handleExportPageAsPythonTestJobs = async () => {
    const pyString = (value: unknown): string => {
      const normalized = String(value ?? '')
      return normalized
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\r\n/g, '\\n')
        .replace(/\n/g, '\\n')
    }

    const pyTripleQuoted = (value: unknown): string => {
      const normalized = String(value ?? '')
      const escaped = normalized
        .replace(/\\/g, '\\\\')
        .replace(/"""/g, '\\"\\"\\"')
      return escaped.length > 0 ? escaped : 'No job description available.'
    }

    const toScore = (value: unknown): number => {
      const parsed = Number(value)
      if (!Number.isFinite(parsed)) {
        return 0
      }
      return Math.max(0, Math.min(100, Math.round(parsed)))
    }

    const hasMeaningfulData = (score: unknown, summary: unknown): boolean => {
      const parsedScore = Number(score)
      if (Number.isFinite(parsedScore)) {
        return true
      }
      return String(summary ?? '').trim().length > 0
    }

    const lines: string[] = []
    let includedCount = 0

    for (const wrapper of visibleJobs) {
      const job = wrapper?.job ?? {}
      const aiPayload = wrapper?.aiPayload ?? {}
      const sourceUrl = String(job.source_url ?? '').trim()

      const auditOverride = sourceUrl ? auditResults[sourceUrl] : undefined
      const impactOverride = sourceUrl ? impactResults[sourceUrl] : undefined
      const qolOverride = sourceUrl ? qualityOfLifeResults[sourceUrl] : undefined

      const auditScoreRaw = auditOverride?.auditScore ?? aiPayload?.audit?.score
      const impactScoreRaw = impactOverride?.ai_impact_score ?? aiPayload?.impact?.score
      const qolScoreRaw = qolOverride?.employeeQualityOfLifeScore ?? aiPayload?.qualityOfLife?.score

      const auditSummaryRaw = auditOverride?.auditText ?? aiPayload?.audit?.summary
      const impactSummaryRaw = impactOverride?.ai_impact_summary ?? aiPayload?.impact?.summary
      const qolSummaryRaw = qolOverride?.employeeQualityOfLifeSummary ?? aiPayload?.qualityOfLife?.summary

      const hasAudit = hasMeaningfulData(auditScoreRaw, auditSummaryRaw)
      const hasImpact = hasMeaningfulData(impactScoreRaw, impactSummaryRaw)
      const hasQol = hasMeaningfulData(qolScoreRaw, qolSummaryRaw)

      if (!hasAudit || !hasImpact || !hasQol) {
        continue
      }

      includedCount += 1
      lines.push(
        '    TestJob(',
        `        company="${pyString(job.company_name)}",`,
        `        impact_score=${toScore(impactScoreRaw)},`,
        `        qol_score=${toScore(qolScoreRaw)},`,
        `        audit_score=${toScore(auditScoreRaw)},`,
        `        title="${pyString(job.name)}",`,
        `        location="${pyString(job.location)}",`,
        `        source_url="${pyString(job.source_url)}",`,
        `        source="${pyString(job.source)}",`,
        '        description=(',
        `            """${pyTripleQuoted(job.description)}"""`,
        '        ),',
        '    ),',
        '',
      )
    }

    if (includedCount === 0) {
      window.alert('No visible page jobs had all AI scoring fields populated.')
      return
    }

    const output = lines.join('\n').trimEnd()

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(output)
      } else {
        throw new Error('Clipboard API unavailable')
      }
      window.alert(`Copied ${includedCount} TestJob block(s) to clipboard.`)
    } catch {
      const textArea = document.createElement('textarea')
      textArea.value = output
      textArea.style.position = 'fixed'
      textArea.style.opacity = '0'
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      window.alert(`Copied ${includedCount} TestJob block(s) to clipboard.`)
    }
  }

  const handleImportAllData = async (xmlText: string) => {
    const result = importAllLocalDataFromXml(xmlText)
    if (!result.ok) {
      window.alert(result.message)
      return
    }

    const importedSettings = loadClientSearchSettings()
    const importedNotes = loadAllUserNotes()

    setQuery(importedSettings.query)
    setLocationText(importedSettings.locationText)
    setResumeText(importedSettings.resumeText)
    setUploadedResumeName(importedSettings.uploadedResumeName)
    setUserRatingMode(importedSettings.userRatingMode)
    setIncludeRemoteJobs(importedSettings.includeRemoteJobs)
    setScoreWeights(importedSettings.scoreWeights)

    setUserNotesByJob(importedNotes.perJob)
    setUserNotesByCompany(importedNotes.perCompany)
    setCompanyColorTagsByCompany(loadCompanyColorTagsByCompany())
    setJobStatusesByCompany(loadJobStatusesByCompany())
    setHighlightedJobUrl(loadHighlightedJobUrl())
    setAddedJobs(loadAddedJobs())
    setDailyNoteAddsByDay(loadUserNotesDailyActivity())
    setJobsViewedByDay(loadJobsViewedDailyActivity())
    setCommentsWrittenByDay(loadCommentsWrittenDailyActivity())
    setUserCreatedJobsByDay(loadUserCreatedJobsDailyActivity())
    setDailyScoreBreakdownByDay(loadDailyScoreBreakdownByDay())

    window.alert(result.message)
  }

  const onResumeUpload = async (file: File) => {
    setUploadedResumeName(file.name)
    setIsResumeLoading(true)

    try {
      const extractedText = await extractTextFromFile(file)
      if (!extractedText.trim()) {
        setUploadedResumeName('')
        setResumeText('')
        return
      }
      setResumeText(extractedText)
    } catch (error) {
      console.error('Failed to parse resume file:', error)
      setUploadedResumeName('')
      setResumeText('')
    } finally {
      setIsResumeLoading(false)
    }
  }

  const handleAddJob = (draft: AddedJobDraft) => {
    const normalizedName = draft.name.trim()
    const normalizedCompany = draft.companyName.trim()
    if (!normalizedName || !normalizedCompany) {
      return
    }

    const normalizedLocation = draft.location.trim() || 'Unknown'
    const normalizedRemote = draft.remote.trim() || 'Unknown'
    const normalizedType = draft.type.trim() || 'Unknown'
    const normalizedDescription = draft.description.trim()
    const generatedId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const normalizedSourceUrl = draft.sourceUrl.trim() || `local://added-job/${generatedId}`
    const userScore = Number.isFinite(Number(draft.userScore))
      ? Math.max(0, Math.min(100, Math.round(Number(draft.userScore))))
      : null

    const nextJob: AddedLocalJob = {
      id: generatedId,
      name: normalizedName,
      companyName: normalizedCompany,
      location: normalizedLocation,
      remote: normalizedRemote,
      type: normalizedType,
      description: normalizedDescription,
      sourceUrl: normalizedSourceUrl,
      posted: new Date().toISOString(),
      userScore,
    }

    const nextAddedJobs = saveAddedJobs([...addedJobs, nextJob])
    setAddedJobs(nextAddedJobs)
    setUserCreatedJobsByDay(incrementUserCreatedJobsToday(1))
    awardDailyScore(100)

    if (userScore !== null) {
      const updatedNotes = saveUserNote(normalizedSourceUrl, { notes: '', userScore })
      setUserNotesByJob(updatedNotes.perJob)
      setUserNotesByCompany(updatedNotes.perCompany)
    }
  }

  const handleSaveUserCreatedJobDetails = (
    sourceUrl: string,
    updates: {
      name: string
      companyName: string
      location: string
      remote: string
      type: string
      description: string
    },
  ) => {
    const normalizedSourceUrl = String(sourceUrl ?? '').trim()
    if (!normalizedSourceUrl) {
      return
    }

    let didUpdate = false
    const next = addedJobs.map((job) => {
      if (String(job.sourceUrl ?? '').trim() !== normalizedSourceUrl) {
        return job
      }

      didUpdate = true
      return {
        ...job,
        name: updates.name.trim() || job.name,
        companyName: updates.companyName.trim() || job.companyName,
        location: updates.location.trim() || 'Unknown',
        remote: updates.remote.trim() || 'Unknown',
        type: updates.type.trim() || 'Unknown',
        description: updates.description.trim(),
      }
    })

    if (!didUpdate) {
      return
    }

    const normalized = saveAddedJobs(next)
    setAddedJobs(normalized)
  }

  const handleAuditRequest = (
    key: { source_url?: string; name?: string; company_name?: string },
    onResult: (result: { auditScore: number; auditText: string; error?: string }) => void,
  ) => {
    socket.emit('job:audit', key, onResult)
  }

  const handleRerollAiRequest = (
    key: { source_url?: string; name?: string; company_name?: string },
    onResult: (result: { auditScore: number; auditText: string; error?: string }) => void,
  ) => {
    socket.emit('job:reroll-ai', key, onResult)
  }

  const handleHideJob = (jobUrl?: string) => {
    const normalized = String(jobUrl ?? '').trim()
    if (!normalized) {
      return
    }

    setHiddenJobUrls((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]))
    setHighlightedJobUrl((prev) => (prev === normalized ? '' : prev))
  }

  const handleHideCompany = (companyName?: string) => {
    const normalized = normalizeCompanyName(companyName)
    if (!normalized) {
      return
    }

    setHiddenCompanies((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]))

    if (highlightedJobUrl) {
      const highlightedWrapper = jobs.find(
        (wrapper) => String(wrapper?.job?.source_url ?? '').trim() === highlightedJobUrl,
      )
      const highlightedCompanyName = normalizeCompanyName(highlightedWrapper?.job?.company_name)
      if (highlightedCompanyName && highlightedCompanyName === normalized) {
        setHighlightedJobUrl('')
      }
    }
  }

  const handleSetJobStatus = (companyName?: string, nextStatus?: JobStatus) => {
    const normalized = String(companyName ?? '').trim()
    if (!normalized || !nextStatus) return
    setJobStatusesByCompany((prev) => setJobStatusByCompany(prev, normalized, nextStatus))
  }

  const handleToggleHighlightJob = (jobUrl?: string) => {
    const normalized = String(jobUrl ?? '').trim()
    if (!normalized) {
      return
    }

    setHighlightedJobUrl((prev) => (prev === normalized ? '' : normalized))
  }

  const awardDailyScore = (points: number) => {
    if (!Number.isFinite(points) || points <= 0) {
      return
    }

    setDailyNoteAddsByDay(incrementUserNotesAddedToday(points))
    setDailyScoreBreakdownByDay(loadDailyScoreBreakdownByDay())
  }

  const handleAwardReadCompletion = (sourceUrl?: string) => {
    const normalizedSourceUrl = String(sourceUrl ?? '').trim()
    if (!normalizedSourceUrl) {
      return
    }

    setJobsViewedByDay(incrementJobsViewedToday(normalizedSourceUrl))
    setDailyScoreBreakdownByDay(loadDailyScoreBreakdownByDay())

    if (readBonusAwardedJobUrls.includes(normalizedSourceUrl)) {
      return
    }

    setReadBonusAwardedJobUrls((prev) => (
      prev.includes(normalizedSourceUrl) ? prev : [...prev, normalizedSourceUrl]
    ))
    awardDailyScore(10)
  }

  const trackCommentWritten = () => {
    setCommentsWrittenByDay(incrementCommentsWrittenToday(1))
    setDailyScoreBreakdownByDay(loadDailyScoreBreakdownByDay())
  }

  const handleSaveUserNote = (sourceUrl: string, note: UserJobNote) => {
    const hadExistingContent = hasNoteContent(userNotesByJob[sourceUrl])
    const hasNextContent = hasNoteContent(note)
    const previousText = String(userNotesByJob[sourceUrl]?.notes ?? '').trim()
    const nextText = String(note.notes ?? '').trim()
    const updated = saveUserNote(sourceUrl, note)
    setUserNotesByJob(updated.perJob)
    setUserNotesByCompany(updated.perCompany)

    if (nextText.length > 0 && nextText !== previousText) {
      trackCommentWritten()
    }

    if (!hadExistingContent && hasNextContent) {
      awardDailyScore(50)
    }
  }

  const handleClearUserNote = (sourceUrl: string) => {
    const updated = deleteUserNote(sourceUrl)
    setUserNotesByJob(updated.perJob)
    setUserNotesByCompany(updated.perCompany)
  }

  const handleSaveCompanyNote = (companyName: string, note: UserJobNote) => {
    const hadExistingContent = hasNoteContent(userNotesByCompany[normalizeCompanyName(companyName)])
    const hasNextContent = hasNoteContent(note)
    const previousText = String(userNotesByCompany[normalizeCompanyName(companyName)]?.notes ?? '').trim()
    const nextText = String(note.notes ?? '').trim()
    const updated = saveCompanyNote(companyName, note)
    setUserNotesByJob(updated.perJob)
    setUserNotesByCompany(updated.perCompany)

    if (nextText.length > 0 && nextText !== previousText) {
      trackCommentWritten()
    }

    if (!hadExistingContent && hasNextContent) {
      awardDailyScore(50)
    }
  }

  const handleClearCompanyNote = (companyName: string) => {
    const updated = deleteCompanyNote(companyName)
    setUserNotesByJob(updated.perJob)
    setUserNotesByCompany(updated.perCompany)
  }

  const handleSetCompanyColorTags = (companyName: string, colors: CompanyTagColor[]) => {
    const updated = saveCompanyColorTags(companyName, colors)
    setCompanyColorTagsByCompany(updated)
  }

  const visibleJobsFiltered = jobs.filter((wrapper) => {
    const jobUrl = String(wrapper?.job?.source_url ?? '').trim()
    const companyName = normalizeCompanyName(wrapper?.job?.company_name)
    if (jobUrl && hiddenJobUrls.includes(jobUrl)) {
      return false
    }
    if (companyName && hiddenCompanies.includes(companyName)) {
      return false
    }
    return true
  })

  const visibleJobs = visibleJobsFiltered

  const hasVisibleResults = visibleJobs.length > 0
  const hasTextQuery = query.trim().length > 0

  const jobsWithUserNotesCount = visibleJobs.reduce((count, wrapper) => {
    const jobUrl = String(wrapper?.job?.source_url ?? '').trim()
    const companyName = normalizeCompanyName(wrapper?.job?.company_name)
    const hasJobNote = jobUrl ? hasNoteContent(userNotesByJob[jobUrl]) : false
    const hasCompanyNote = companyName ? hasNoteContent(userNotesByCompany[companyName]) : false
    return hasJobNote || hasCompanyNote ? count + 1 : count
  }, 0)

  const userNotesCoveragePercent = visibleJobs.length > 0
    ? Math.round((jobsWithUserNotesCount / visibleJobs.length) * 100)
    : 0

  const userScoreValues = visibleJobs
    .map((wrapper) => {
      const jobUrl = String(wrapper?.job?.source_url ?? '').trim()
      const companyName = normalizeCompanyName(wrapper?.job?.company_name)
      const jobScore = jobUrl ? userNotesByJob[jobUrl]?.userScore : null
      if (typeof jobScore === 'number' && Number.isFinite(jobScore)) {
        return jobScore
      }

      const companyScore = companyName ? userNotesByCompany[companyName]?.userScore : null
      if (typeof companyScore === 'number' && Number.isFinite(companyScore)) {
        return companyScore
      }

      return null
    })
    .filter((score): score is number => typeof score === 'number' && Number.isFinite(score))

  const todayScorePoints = dailyNoteAddsByDay[getLocalDateKey()] ?? 0
  const todayJobsViewed = jobsViewedByDay[getLocalDateKey()] ?? 0
  const todayCommentsWritten = commentsWrittenByDay[getLocalDateKey()] ?? 0
  const todayUserCreatedJobs = userCreatedJobsByDay[getLocalDateKey()] ?? 0
  const debugStatusSummary = globalDebugCoverage?.debugStatuses?.length
    ? globalDebugCoverage.debugStatuses
      .map((status) => `${status.label} ${status.count.toLocaleString()} (${status.pct.toFixed(1)}%)`)
      .join(' · ')
    : ''
  const sourceBreakdown = globalDebugCoverage?.sourceBreakdown ?? []
  const missingDescriptionSources = globalDebugCoverage?.missingDescriptionSources ?? []
  const scrapeLoad = globalDebugCoverage?.scrapeLoad
  const cacheLoadSources = scrapeLoad?.cacheSources ?? []
  const sourceLoadSources = scrapeLoad?.sourceSources ?? []
  const urlCache = scrapeLoad?.urlCache
  const scraperUrlTraversal = scrapeLoad?.scraperUrlTraversal ?? []
  const cacheIo = globalDebugCoverage?.cacheIo
  const cacheIoRows = cacheIo?.rows ?? []
  const cacheDatabaseSchema = globalDebugCoverage?.cacheDatabaseSchema
  const cacheDatabaseSchemaTables = cacheDatabaseSchema?.tables ?? []
  const aiSummaryLength = globalDebugCoverage?.aiOverall?.summaryLength
  const aiScores = globalDebugCoverage?.aiOverall?.scores
  const aiCompanyReviewsCount = globalDebugCoverage?.aiOverall?.companyReviewsCount ?? 0
  const employerConcentration = globalDebugCoverage?.employerConcentration
  const employerCurvePoints = employerConcentration?.curvePoints ?? []
  const topEmployers = employerConcentration?.topEmployers ?? []
  const topEmployerSummary = topEmployers.length > 0
    ? topEmployers.slice(0, 10)
    : []
  const sourceStatsRows = useMemo(() => buildSourceStatsRows(globalDebugCoverage), [globalDebugCoverage])
  const sortedSourceStatsRows = useMemo(() => {
    const dirMultiplier = sourceStatsSortDir === 'asc' ? 1 : -1
    return [...sourceStatsRows].sort((a, b) => {
      const aValue = a[sourceStatsSortKey]
      const bValue = b[sourceStatsSortKey]
      if (aValue === null && bValue === null) {
        return a.label.localeCompare(b.label)
      }
      if (aValue === null) return 1
      if (bValue === null) return -1
      if (aValue === bValue) return a.label.localeCompare(b.label)
      return aValue < bValue ? -dirMultiplier : dirMultiplier
    })
  }, [sourceStatsRows, sourceStatsSortKey, sourceStatsSortDir])
  const handleSourceStatsSort = (key: SourceStatsSortKey) => {
    setSourceStatsSortKey((currentKey) => {
      if (currentKey === key) {
        setSourceStatsSortDir((currentDir) => (currentDir === 'desc' ? 'asc' : 'desc'))
        return currentKey
      }
      setSourceStatsSortDir('desc')
      return key
    })
  }
  const renderSourceStatsSortHeader = (key: SourceStatsSortKey, title: string) => (
    <th scope="col">
      <button
        type="button"
        className="app-debug-source-stats__sort-btn"
        onClick={() => handleSourceStatsSort(key)}
      >
        {title}{sourceStatsSortKey === key ? (sourceStatsSortDir === 'desc' ? ' ▼' : ' ▲') : ''}
      </button>
    </th>
  )
  const renderDistribution = (distribution: Array<{ label: string; pct: number }>) => (
    distribution
      .map((bucket) => `${bucket.label}:${bucket.pct.toFixed(1)}%`)
      .join(', ')
  )
  const debugStatsText = useMemo(() => {
    if (!globalDebugCoverage || totalJobsInDb <= 0) {
      return ''
    }

    const lines: string[] = [
      'JOB SEARCH FOR GOOD DEBUG STATS',
      '',
      `Total jobs in database: ${totalJobsInDb.toLocaleString()}`,
      `Coverage: audit ${globalDebugCoverage.withAuditScoreCount.toLocaleString()} (${globalDebugCoverage.withAuditScorePct.toFixed(1)}%), impact ${globalDebugCoverage.withImpactScoreCount.toLocaleString()} (${globalDebugCoverage.withImpactScorePct.toFixed(1)}%), qol ${globalDebugCoverage.withQolScoreCount.toLocaleString()} (${globalDebugCoverage.withQolScorePct.toFixed(1)}%), badge-eligible ${globalDebugCoverage.eligibleForBadgeCount.toLocaleString()} (${globalDebugCoverage.eligibleForBadgePct.toFixed(1)}%), classification ${globalDebugCoverage.withClassificationCount.toLocaleString()} (${globalDebugCoverage.withClassificationPct.toFixed(1)}% of eligible), missing descriptions ${globalDebugCoverage.missingDescriptionCount.toLocaleString()} (${globalDebugCoverage.missingDescriptionPct.toFixed(1)}%), geocoded ${globalDebugCoverage.geocodedCount.toLocaleString()} (${globalDebugCoverage.geocodedPct.toFixed(1)}%)`,
    ]

    if (scrapeLoad) {
      lines.push('')
      lines.push('SCRAPE LOAD ORIGIN')
      lines.push(`Jobs loaded from component cache: ${scrapeLoad.jobsFromCacheCount.toLocaleString()} (${scrapeLoad.jobsFromCachePct.toFixed(1)}%)`)
      lines.push(`Jobs loaded from fresh source fetches: ${scrapeLoad.jobsFromSourceCount.toLocaleString()} (${scrapeLoad.jobsFromSourcePct.toFixed(1)}%)`)
      if (cacheLoadSources.length > 0) {
        lines.push('')
        lines.push('Loaded from component cache by source:')
        lines.push(...formatDebugTextLines(cacheLoadSources))
      }
      if (sourceLoadSources.length > 0) {
        lines.push('')
        lines.push('Loaded from fresh source fetches by source:')
        lines.push(...formatDebugTextLines(sourceLoadSources))
      }
    }

    if (urlCache && urlCache.totalLookups > 0) {
      lines.push('')
      lines.push('URL CACHE LOOKUPS')
      lines.push(`Total lookups: ${urlCache.totalLookups.toLocaleString()}`)
      lines.push(`Hits: ${urlCache.hits.toLocaleString()} (${urlCache.hitPct.toFixed(1)}%)`)
      lines.push(`Misses: ${urlCache.misses.toLocaleString()} (${urlCache.missPct.toFixed(1)}%)`)
      if (urlCache.missSources.length > 0) {
        lines.push('')
        lines.push('Miss-heavy sources:')
        lines.push(...formatDebugTextLines(urlCache.missSources, '% of misses'))
      }
      if (urlCache.hitSources.length > 0) {
        lines.push('')
        lines.push('Hit sources:')
        lines.push(...formatDebugTextLines(urlCache.hitSources, '% of hits'))
      }
    }

    if (cacheIo && cacheIoRows.length > 0) {
      lines.push('')
      lines.push('CACHE AND DATABASE I/O')
      lines.push(
        `Reads: ${cacheIo.totalReadOps.toLocaleString()} (cache ${cacheIo.totalCacheReadOps.toLocaleString()}, database ${cacheIo.totalDatabaseReadOps.toLocaleString()})`,
      )
      lines.push(`Writes: ${cacheIo.totalWriteOps.toLocaleString()}`)
      lines.push('')
      lines.push('Path | Kind | Backend | DB source file | Reads | Hits | Misses | Writes | Hybrid flow')
      lines.push('--- | --- | --- | --- | ---: | ---: | ---: | ---: | ---')
      for (const row of cacheIoRows) {
        const hybrid = `dbHit ${row.hybridFlow.dbReadHits.toLocaleString()}, dbMiss ${row.hybridFlow.dbReadMisses.toLocaleString()}, jsonFallback ${row.hybridFlow.legacyReadHits.toLocaleString()}, hydrateToDb ${row.hybridFlow.dbHydrateWrites.toLocaleString()}, directDbWrite ${row.hybridFlow.dbDirectWrites.toLocaleString()}`
        lines.push(
          `${row.path} | ${row.kind} | ${row.backend} | ${row.dbSourceFile || 'n/a'} | ${row.readOps.toLocaleString()} | ${row.readHits.toLocaleString()} | ${row.readMisses.toLocaleString()} | ${row.writeOps.toLocaleString()} | ${hybrid}`,
        )
      }
    }

    if (cacheDatabaseSchema && cacheDatabaseSchemaTables.length > 0) {
      lines.push('')
      lines.push('CACHE DATABASE SCHEMA')
      lines.push(`Database file: ${cacheDatabaseSchema.databaseFile}`)
      lines.push('')
      lines.push('Table | Type | Rows | Columns | Keys')
      lines.push('--- | --- | ---: | --- | ---')
      for (const table of cacheDatabaseSchemaTables) {
        const columnsText = table.columns.length > 0
          ? table.columns.map((column) => formatSchemaColumn(column)).join('; ')
          : 'n/a'
        const keysText = table.keys.length > 0
          ? table.keys.map((key) => formatSchemaKey(key)).join('; ')
          : 'n/a'
        const rowCountText = table.rowCount === null ? 'n/a' : table.rowCount.toLocaleString()
        lines.push(`${table.name} | ${table.tableType} | ${rowCountText} | ${columnsText} | ${keysText}`)
      }
    }

    if (scraperUrlTraversal.length > 0) {
      lines.push('')
      lines.push('SCRAPER URL TRAVERSAL')
      for (const source of scraperUrlTraversal) {
        const planned = source.plannedUrlCount
        const visited = source.actualUrlCount
        const pctOfPlan = source.actualVsPlannedPct
        const plannedText = planned !== null
          ? planned.toLocaleString()
          : 'unknown'
        const pctText = pctOfPlan !== null
          ? `${pctOfPlan.toFixed(1)}%`
          : 'n/a'
        lines.push(
          `${source.label}: visited ${visited.toLocaleString()} / planned ${plannedText} (${pctText}) · stop ${source.stopReason}`,
        )
      }
    }

    if (sourceBreakdown.length > 0) {
      lines.push('')
      lines.push('TOTAL JOBS BY SOURCE')
      lines.push(...formatDebugTextLines(sourceBreakdown))
    }

    if (missingDescriptionSources.length > 0) {
      lines.push('')
      lines.push('SCRAPERS MISSING DESCRIPTIONS')
      lines.push(...formatDebugTextLines(missingDescriptionSources))
    }

    if (globalDebugCoverage.debugStatuses.length > 0) {
      lines.push('')
      lines.push('DEBUG FLAGS')
      lines.push(...formatDebugTextLines(globalDebugCoverage.debugStatuses))
    }

    if (aiSummaryLength) {
      lines.push('')
      lines.push('AI SUMMARY COVERAGE')
      lines.push(`Company reviews with AI data: ${aiCompanyReviewsCount.toLocaleString()}`)
      lines.push(`Average summary length overall: ${aiSummaryLength.overallAvgWords.toFixed(1)} words / ${aiSummaryLength.overallAvgChars.toFixed(1)} chars`)
      lines.push(`Audit summary avg: ${aiSummaryLength.auditAvgWords.toFixed(1)} words / ${aiSummaryLength.auditAvgChars.toFixed(1)} chars`)
      lines.push(`Impact summary avg: ${aiSummaryLength.impactAvgWords.toFixed(1)} words / ${aiSummaryLength.impactAvgChars.toFixed(1)} chars`)
      lines.push(`QOL summary avg: ${aiSummaryLength.qolAvgWords.toFixed(1)} words / ${aiSummaryLength.qolAvgChars.toFixed(1)} chars`)
    }

    if (aiScores) {
      lines.push('')
      lines.push('AI SCORE DISTRIBUTIONS')
      lines.push(`Average scores: audit ${aiScores.audit.avg.toFixed(1)}, impact ${aiScores.impact.avg.toFixed(1)}, qol ${aiScores.qol.avg.toFixed(1)}`)
      lines.push(`Audit distribution: ${renderDistribution(aiScores.audit.distribution)}`)
      lines.push(`Impact distribution: ${renderDistribution(aiScores.impact.distribution)}`)
      lines.push(`QOL distribution: ${renderDistribution(aiScores.qol.distribution)}`)
    }

    if (employerConcentration) {
      lines.push('')
      lines.push('EMPLOYER CONCENTRATION')
      lines.push(`Unique employers: ${employerConcentration.totalEmployers.toLocaleString()}`)
      for (const point of employerConcentration.curvePoints) {
        lines.push(
          `${point.employerPct.toFixed(1)}% employers (${point.employerCount.toLocaleString()}) -> ${point.jobsPct.toFixed(1)}% jobs (${point.jobCount.toLocaleString()})`,
        )
      }
      if (topEmployerSummary.length > 0) {
        lines.push('')
        lines.push('Top employers by job volume (first 10):')
        for (const employer of topEmployerSummary) {
          lines.push(
            `${employer.rank}. ${employer.companyName}: ${employer.jobCount.toLocaleString()} jobs (${employer.jobPct.toFixed(2)}%), cumulative ${employer.cumulativeJobsPct.toFixed(2)}%`,
          )
        }
      }
    }

    return lines.join('\n')
  }, [
    aiCompanyReviewsCount,
    aiScores,
    aiSummaryLength,
    cacheLoadSources,
    cacheIo,
    cacheIoRows,
    cacheDatabaseSchema,
    cacheDatabaseSchemaTables,
    globalDebugCoverage,
    scrapeLoad,
    sourceBreakdown,
    missingDescriptionSources,
    sourceLoadSources,
    scraperUrlTraversal,
    topEmployerSummary,
    totalJobsInDb,
    urlCache,
    employerConcentration,
  ])
  useEffect(() => {
    const timerId = window.setInterval(() => {
      setClockTick((value) => value + 1)
    }, 60_000)

    return () => window.clearInterval(timerId)
  }, [])

  useEffect(() => {
    if (!isDebugTextPopoverOpen) {
      return
    }

    window.setTimeout(() => {
      debugTextAreaRef.current?.focus()
      debugTextAreaRef.current?.select()
    }, 0)
  }, [isDebugTextPopoverOpen])

  const handleOpenDebugTextPopover = () => {
    setDebugTextCopyStatus('')
    setIsDebugTextPopoverOpen(true)
  }

  const handleCopyDebugText = async () => {
    if (!debugStatsText) {
      return
    }

    try {
      await navigator.clipboard.writeText(debugStatsText)
      setDebugTextCopyStatus('Copied to clipboard.')
    } catch {
      debugTextAreaRef.current?.focus()
      debugTextAreaRef.current?.select()
      setDebugTextCopyStatus('Clipboard blocked. Press Cmd+C to copy.')
    }
  }

  return (
    <main className="app">
      <h1 className={`app-title${isSearching ? ' app-title--searching' : ''}`}>Job Search for Good</h1>
      <p className="app-subtitle"> --- helping to find jobs that matter</p>
      {totalJobsInDb > 0 && (
        <p className="app-db-count">
          {totalJobsInDb.toLocaleString()} jobs in database, {totalEmployersInDb.toLocaleString()} employers, {totalSourcesInDb.toLocaleString()} sources
        </p>
      )}
      {searchDebugEnabled && globalDebugCoverage && totalJobsInDb > 0 && (
        <details className="app-debug-pane">
          <summary className="app-debug-pane__summary">
            <span className="app-debug-pane__summary-title">Debug stats</span>
            <span className="app-debug-pane__summary-meta">
              {sourceBreakdown.length.toLocaleString()} sources · audit {globalDebugCoverage.withAuditScorePct.toFixed(1)}% jobs / {globalDebugCoverage.withAuditCompanyPct.toFixed(1)}% companies · impact {globalDebugCoverage.withImpactScorePct.toFixed(1)}% jobs / {globalDebugCoverage.withImpactCompanyPct.toFixed(1)}% companies · qol {globalDebugCoverage.withQolScorePct.toFixed(1)}% jobs / {globalDebugCoverage.withQolCompanyPct.toFixed(1)}% companies · badge-eligible {globalDebugCoverage.eligibleForBadgePct.toFixed(1)}% jobs / {globalDebugCoverage.eligibleForBadgeCompanyPct.toFixed(1)}% companies · classification {globalDebugCoverage.withClassificationPct.toFixed(1)}% of eligible jobs / {globalDebugCoverage.withClassificationCompanyPct.toFixed(1)}% of eligible companies · missing descriptions {globalDebugCoverage.missingDescriptionPct.toFixed(1)}% · geocoded {globalDebugCoverage.geocodedPct.toFixed(1)}%
            </span>
          </summary>
          <div className="app-debug-pane__content">
            {debugStatsText && (
              <div className="app-debug-pane__actions">
                <button type="button" className="app-debug-pane__export-btn" onClick={handleOpenDebugTextPopover}>
                  Open debug text
                </button>
              </div>
            )}
            <p className="app-debug-counts">
              audit {globalDebugCoverage.withAuditScoreCount.toLocaleString()} ({globalDebugCoverage.withAuditScorePct.toFixed(1)}%) ·
              impact {globalDebugCoverage.withImpactScoreCount.toLocaleString()} ({globalDebugCoverage.withImpactScorePct.toFixed(1)}%) ·
              qol {globalDebugCoverage.withQolScoreCount.toLocaleString()} ({globalDebugCoverage.withQolScorePct.toFixed(1)}%) ·
              badge-eligible {globalDebugCoverage.eligibleForBadgeCount.toLocaleString()} ({globalDebugCoverage.eligibleForBadgePct.toFixed(1)}%) ·
              classification {globalDebugCoverage.withClassificationCount.toLocaleString()} ({globalDebugCoverage.withClassificationPct.toFixed(1)}% of eligible) ·
              missing descriptions {globalDebugCoverage.missingDescriptionCount.toLocaleString()} ({globalDebugCoverage.missingDescriptionPct.toFixed(1)}%) ·
              geocoded {globalDebugCoverage.geocodedCount.toLocaleString()} ({globalDebugCoverage.geocodedPct.toFixed(1)}%)
            </p>
            {scrapeLoad && (
              <p className="app-debug-counts app-debug-counts--secondary">
                job load cache {scrapeLoad.jobsFromCacheCount.toLocaleString()} ({scrapeLoad.jobsFromCachePct.toFixed(1)}%) · source {scrapeLoad.jobsFromSourceCount.toLocaleString()} ({scrapeLoad.jobsFromSourcePct.toFixed(1)}%)
                {urlCache && urlCache.totalLookups > 0 && (
                  <> · url cache hits {urlCache.hits.toLocaleString()} ({urlCache.hitPct.toFixed(1)}%) · misses {urlCache.misses.toLocaleString()} ({urlCache.missPct.toFixed(1)}%) · total lookups {urlCache.totalLookups.toLocaleString()}</>
                )}
              </p>
            )}
            {sourceStatsRows.length > 0 && (
              <div className="app-debug-sources app-debug-source-stats">
                <p className="app-debug-counts app-debug-counts--secondary app-debug-sources__title">
                  per-source stats · {sourceStatsRows.length.toLocaleString()} sources · click a column to sort
                </p>
                <div className="app-debug-cache-io__table-wrap app-debug-source-stats__table-wrap">
                  <table className="app-debug-cache-io__table app-debug-source-stats__table">
                    <thead>
                      <tr>
                        <th scope="col">Source</th>
                        {renderSourceStatsSortHeader('totalCount', 'Jobs')}
                        {renderSourceStatsSortHeader('missingDescCount', 'Missing desc')}
                        {renderSourceStatsSortHeader('cacheLoadCount', 'Loaded: cache')}
                        {renderSourceStatsSortHeader('freshLoadCount', 'Loaded: fresh')}
                        {renderSourceStatsSortHeader('urlHitCount', 'URL cache hits')}
                        {renderSourceStatsSortHeader('urlMissCount', 'URL cache misses')}
                        {renderSourceStatsSortHeader('traversalActual', 'URLs visited')}
                        {renderSourceStatsSortHeader('traversalPlanned', 'URLs planned')}
                        <th scope="col">Traversal stop reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedSourceStatsRows.map((row) => (
                        <tr key={row.label}>
                          <td><strong>{row.label}</strong></td>
                          <td>{row.totalCount === null ? '—' : `${row.totalCount.toLocaleString()} (${row.totalPct?.toFixed(1)}%)`}</td>
                          <td>{row.missingDescCount === null ? '—' : `${row.missingDescCount.toLocaleString()} (${row.missingDescPct?.toFixed(1)}%)`}</td>
                          <td>{row.cacheLoadCount === null ? '—' : `${row.cacheLoadCount.toLocaleString()} (${row.cacheLoadPct?.toFixed(1)}%)`}</td>
                          <td>{row.freshLoadCount === null ? '—' : `${row.freshLoadCount.toLocaleString()} (${row.freshLoadPct?.toFixed(1)}%)`}</td>
                          <td>{row.urlHitCount === null ? '—' : `${row.urlHitCount.toLocaleString()} (${row.urlHitPct?.toFixed(1)}%)`}</td>
                          <td>{row.urlMissCount === null ? '—' : `${row.urlMissCount.toLocaleString()} (${row.urlMissPct?.toFixed(1)}%)`}</td>
                          <td>{row.traversalActual === null ? '—' : row.traversalActual.toLocaleString()}</td>
                          <td>{row.traversalPlanned === null ? 'unknown' : row.traversalPlanned.toLocaleString()}</td>
                          <td>{row.traversalStopReason || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {cacheIo && cacheIoRows.length > 0 && (
              <div className="app-debug-sources app-debug-cache-io">
                <p className="app-debug-counts app-debug-counts--secondary app-debug-sources__title">
                  cache/database reads {cacheIo.totalReadOps.toLocaleString()} (cache {cacheIo.totalCacheReadOps.toLocaleString()} · db {cacheIo.totalDatabaseReadOps.toLocaleString()}) · writes {cacheIo.totalWriteOps.toLocaleString()}
                </p>
                <div className="app-debug-cache-io__table-wrap">
                  <table className="app-debug-cache-io__table">
                    <thead>
                      <tr>
                        <th scope="col">Path</th>
                        <th scope="col">Kind</th>
                        <th scope="col">Backend</th>
                        <th scope="col">DB source file</th>
                        <th scope="col">Reads</th>
                        <th scope="col">Hits</th>
                        <th scope="col">Misses</th>
                        <th scope="col">Writes</th>
                        <th scope="col">Hybrid flow</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cacheIoRows.map((row) => (
                        <tr key={`${row.kind}-${row.path}`}>
                          <td>{row.path}</td>
                          <td>{row.kind}</td>
                          <td>{row.backend}</td>
                          <td>{row.dbSourceFile || 'n/a'}</td>
                          <td>{row.readOps.toLocaleString()}</td>
                          <td>{row.readHits.toLocaleString()}</td>
                          <td>{row.readMisses.toLocaleString()}</td>
                          <td>{row.writeOps.toLocaleString()}</td>
                          <td>
                            db hit {row.hybridFlow.dbReadHits.toLocaleString()} · db miss {row.hybridFlow.dbReadMisses.toLocaleString()} · json fallback {row.hybridFlow.legacyReadHits.toLocaleString()} · hydrate to db {row.hybridFlow.dbHydrateWrites.toLocaleString()} · direct db write {row.hybridFlow.dbDirectWrites.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {cacheDatabaseSchema && cacheDatabaseSchemaTables.length > 0 && (
              <div className="app-debug-sources app-debug-cache-schema">
                <p className="app-debug-counts app-debug-counts--secondary app-debug-sources__title">
                  cache database schema ({cacheDatabaseSchema.databaseFile})
                </p>
                <div className="app-debug-cache-io__table-wrap">
                  <table className="app-debug-cache-io__table app-debug-cache-schema__table">
                    <thead>
                      <tr>
                        <th scope="col">Table</th>
                        <th scope="col">Type</th>
                        <th scope="col">Rows</th>
                        <th scope="col">Columns</th>
                        <th scope="col">Keys</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cacheDatabaseSchemaTables.map((table) => (
                        <tr key={table.name}>
                          <td>{table.name}</td>
                          <td>{table.tableType}</td>
                          <td>{table.rowCount === null ? 'n/a' : table.rowCount.toLocaleString()}</td>
                          <td>
                            <div className="app-debug-cache-schema__cell-list">
                              {table.columns.map((column) => (
                                <div key={`${table.name}-col-${column.name}`} className="app-debug-cache-schema__line">
                                  {formatSchemaColumn(column)}
                                </div>
                              ))}
                            </div>
                          </td>
                          <td>
                            <div className="app-debug-cache-schema__cell-list">
                              {table.keys.length === 0 && (
                                <div className="app-debug-cache-schema__line">n/a</div>
                              )}
                              {table.keys.map((key) => (
                                <div key={`${table.name}-key-${key.name}`} className="app-debug-cache-schema__line">
                                  {formatSchemaKey(key)}
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {debugStatusSummary && (
              <p className="app-debug-counts app-debug-counts--secondary">
                debug {debugStatusSummary}
              </p>
            )}
            {aiSummaryLength && (
              <p className="app-debug-counts app-debug-counts--secondary">
                AI coverage from {aiCompanyReviewsCount.toLocaleString()} company reviews · summary avg overall {aiSummaryLength.overallAvgWords.toFixed(1)} words / {aiSummaryLength.overallAvgChars.toFixed(1)} chars
                {' '}| audit {aiSummaryLength.auditAvgWords.toFixed(1)}w / {aiSummaryLength.auditAvgChars.toFixed(1)}c
                {' '}· impact {aiSummaryLength.impactAvgWords.toFixed(1)}w / {aiSummaryLength.impactAvgChars.toFixed(1)}c
                {' '}· qol {aiSummaryLength.qolAvgWords.toFixed(1)}w / {aiSummaryLength.qolAvgChars.toFixed(1)}c
              </p>
            )}
            {aiScores && (
              <p className="app-debug-counts app-debug-counts--secondary">
                avg score audit {aiScores.audit.avg.toFixed(1)} · impact {aiScores.impact.avg.toFixed(1)} · qol {aiScores.qol.avg.toFixed(1)}
                {' '}| dist audit [{renderDistribution(aiScores.audit.distribution)}]
                {' '}| impact [{renderDistribution(aiScores.impact.distribution)}]
                {' '}| qol [{renderDistribution(aiScores.qol.distribution)}]
              </p>
            )}
            {employerConcentration && employerCurvePoints.length > 0 && (
              <div className="app-debug-employers">
                <p className="app-debug-counts app-debug-counts--secondary app-debug-sources__title">
                  employer concentration · {employerConcentration.totalEmployers.toLocaleString()} unique employers · {employerConcentration.totalJobs.toLocaleString()} total jobs
                </p>
                <div className="app-debug-employers__graph-wrap">
                  <svg
                    className="app-debug-employers__graph"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    role="img"
                    aria-label="Percent of employers versus percent of jobs coverage"
                  >
                    <polyline
                      points="0,100 100,0"
                      className="app-debug-employers__line app-debug-employers__line--baseline"
                    />
                    <polyline
                      points={employerCurvePoints.map((point) => `${point.employerPct.toFixed(2)},${(100 - point.jobsPct).toFixed(2)}`).join(' ')}
                      className="app-debug-employers__line app-debug-employers__line--actual"
                    />
                  </svg>
                </div>
                <div className="app-debug-sources__list app-debug-employers__checkpoints">
                  {employerCurvePoints.map((point) => (
                    <span key={`curve-${point.employerPct}`} className="app-debug-sources__item app-debug-employers__point">
                      <strong>{point.employerPct.toFixed(0)}%</strong> employers ({point.employerCount.toLocaleString()}) {'->'} {point.jobsPct.toFixed(1)}% jobs ({point.jobCount.toLocaleString()})
                    </span>
                  ))}
                </div>
                {topEmployers.length > 0 && (
                  <details className="app-debug-employers__top-list">
                    <summary className="app-debug-employers__top-list-summary">
                      Top {topEmployers.length.toLocaleString()} employers by job volume
                    </summary>
                    <div className="app-debug-employers__table-wrap">
                      <table className="app-debug-employers__table">
                        <thead>
                          <tr>
                            <th scope="col">#</th>
                            <th scope="col">Employer</th>
                            <th scope="col">Jobs</th>
                            <th scope="col">Share</th>
                            <th scope="col">Cumulative</th>
                          </tr>
                        </thead>
                        <tbody>
                          {topEmployers.map((employer) => (
                            <tr key={`${employer.rank}-${employer.companyName}`}>
                              <td>{employer.rank}</td>
                              <td>{employer.companyName}</td>
                              <td>{employer.jobCount.toLocaleString()}</td>
                              <td>{employer.jobPct.toFixed(2)}%</td>
                              <td>{employer.cumulativeJobsPct.toFixed(2)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}
              </div>
            )}
          </div>
        </details>
      )}
      <GenericPopover
        isOpen={isDebugTextPopoverOpen}
        onClose={() => setIsDebugTextPopoverOpen(false)}
        title="Debug text export"
        className="app-debug-text-popover"
        headerActions={(
          <>
            {debugTextCopyStatus && <span className="app-debug-text-popover__status">{debugTextCopyStatus}</span>}
            <button type="button" className="app-debug-text-popover__copy" onClick={handleCopyDebugText}>
              Copy all
            </button>
          </>
        )}
      >
        <textarea
          ref={debugTextAreaRef}
          className="app-debug-text-popover__textarea"
          value={debugStatsText}
          readOnly
          spellCheck={false}
          aria-label="Condensed debug text"
        />
      </GenericPopover>
      <InsightsHoverPopovers
        searchMeta={searchMeta}
        onOpenAiCorpus={() => setOpenAiCorpusSignal((value) => value + 1)}
        onRunAuditAllInSearch={auditEnabled ? handleRunAuditAllInSearch : undefined}
        onAddJob={handleAddJob}
        onExportAllData={handleExportAllData}
        onExportPageAsCsv={handleExportPageAsCsv}
        onExportPageAsPythonTestJobs={handleExportPageAsPythonTestJobs}
        onImportAllData={handleImportAllData}
        userRatingMode={userRatingMode}
        onUserRatingModeChange={setUserRatingMode}
        hideApplied={hideApplied}
        onHideAppliedChange={setHideApplied}
        hideTagColors={hideTagColors}
        onHideTagColorsChange={setHideTagColors}
        showBatchDebugActions={searchDebugEnabled}
        visibleJobsCount={visibleJobs.length}
        jobsWithUserNotesCount={jobsWithUserNotesCount}
        userNotesCoveragePercent={userNotesCoveragePercent}
        userScoreValues={userScoreValues}
        dailyNoteAddsByDay={dailyNoteAddsByDay}
        dailyScoreBreakdownByDay={dailyScoreBreakdownByDay}
        tagCloud={tagCloud}
        onTagCloudOpen={() => socket.emit('tagCloud:request')}
        onScoreDistributionOpen={() => socket.emit('scoreDistribution:request')}
        onTagCloudWordClick={(word) => setQuery(word)}
        isEnabled={hasVisibleResults}
        hasSearched={hasTextQuery}
      />

      <GlobalAIButton
        resumeText={resumeText}
        jobs={jobs}
        auditResults={auditResults}
        impactResults={impactResults}
        showButton={false}
        openSignal={openAiCorpusSignal}
      />
      <BulkAuditButton showButton={false} />

      <section
        className={`compact-search-bar compact-search-bar--expanded${!hasTextQuery ? ' compact-search-bar--needs-text' : ''}`}
        aria-label="Primary search controls"
      >
        <div className="compact-search-bar__text">
          <SearchTextEntry onSearch={handleTextSearch} resultCount={totalItems} highlight={!hasTextQuery} initialQuery={query} />
        </div>

        <div className={[
          'compact-search-bar__location',
          !hasTextQuery ? 'compact-search-bar__location--disabled' : '',
          hasTextQuery && !locationText ? 'compact-search-bar__location--highlight' : '',
        ].filter(Boolean).join(' ')}>
          <LocationDropdown
            onSelectLocation={(location) => setLocationText(location.displayLabel)}
            placeholder={hasTextQuery ? 'Location' : 'Search first...'}
            initialQuery={locationText}
          />
        </div>

        <UploadResume
          uploadedResumeName={uploadedResumeName}
          resumeText={resumeText}
          onResumeUpload={onResumeUpload}
          isEnabled={hasTextQuery}
          highlight={hasTextQuery && !resumeText}
        />

        <div className="search-settings-row">
          <label className={`search-settings-checkbox-row${!hasTextQuery ? ' search-settings-checkbox-row--disabled' : ''}`}>
            <input
              type="checkbox"
              checked={includeRemoteJobs}
              onChange={(event) => setIncludeRemoteJobs(event.target.checked)}
              disabled={!hasTextQuery}
            />
            <span>Include remote jobs</span>
          </label>
          <ScoreWeightsDropdown
            scoreWeights={scoreWeights}
            onScoreWeightsChange={setScoreWeights}
            isEnabled={hasTextQuery}
          />
          <EmployerCategoryFilterDropdown
            selectedCategory={prioritizedEmployerImpactCategory}
            onChange={setPrioritizedEmployerImpactCategory}
            isEnabled={hasTextQuery}
          />
          {searchDebugEnabled && (
            <label className={`search-settings-select-row${!hasTextQuery ? ' search-settings-select-row--disabled' : ''}`}>
              <span>Prompt version</span>
              <select
                value={selectedPromptVersion}
                onChange={(event) => setSelectedPromptVersion(event.target.value)}
                disabled={!hasTextQuery}
              >
                <option value="">All prompt versions</option>
                {promptVersions.map((version) => (
                  <option key={version} value={version}>{version}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      </section>

      {!isSearching && (
        <Pagination
          currentPage={currentPage}
          totalItems={totalItems}
          itemsPerPage={itemsPerPage}
          onPageChange={handlePageChange}
        />
      )}

      <SearchLoadingBar
        isVisible={isSearching}
        hasSearchLocation={Boolean(locationText.trim())}
        hasSearchResume={Boolean(resumeText.trim() || uploadedResumeName)}
      />

      {!isSearching && (
        <>
          {searchDebugInfo !== null && (() => {
            const exc = searchDebugInfo.exclusions
            const t = searchDebugInfo.timings
            return (
              <div className="search-debug-panel" aria-label="Search debug info">
                <span className="search-debug-panel__badge">DEBUG</span>
                {searchDebugInfo.cacheHit && (
                  <span className="search-debug-panel__badge search-debug-panel__badge--cached">⚡ CACHED</span>
                )}
                <span className="search-debug-panel__item">
                  user: {searchDebugInfo.userLat !== null ? `lat ${searchDebugInfo.userLat.toFixed(4)}` : 'lat —'}{', '}
                  {searchDebugInfo.userLon !== null ? `lon ${searchDebugInfo.userLon.toFixed(4)}` : 'lon —'}
                </span>
                <span className="search-debug-panel__sep">|</span>
                <span className="search-debug-panel__item">query: &quot;{searchDebugInfo.query}&quot;</span>
                <span className="search-debug-panel__sep">|</span>
                <span className="search-debug-panel__item">location: &quot;{searchDebugInfo.locationText || '—'}&quot;</span>
                <span className="search-debug-panel__sep">|</span>
                <span className="search-debug-panel__item">input: {searchDebugInfo.totalJobsInput}</span>
                <span className="search-debug-panel__sep">|</span>
                <span className="search-debug-panel__item">visible: {searchDebugInfo.totalJobsVisible}</span>
                <span className="search-debug-panel__sep">|</span>
                <span className="search-debug-panel__item">matched: {searchDebugInfo.totalJobsMatched}</span>
                {t && (
                  <>
                    <span className="search-debug-panel__sep search-debug-panel__sep--section">/</span>
                    <span className="search-debug-panel__section-label">timings (ms):</span>
                    <span className="search-debug-panel__timing" title="Hidden/remote/rating filters">filter: {t.filterMs}</span>
                    <span className="search-debug-panel__timing" title="Text query matching">query: {t.queryMatchMs}</span>
                    <span className="search-debug-panel__timing" title="Geocoding user location">user-geo: {t.userGeocodeMs}</span>
                    <span className="search-debug-panel__timing" title={`Geocoding job locations — had coords: ${t.jobGeoHadCoords}, newly geocoded: ${t.jobGeoNewlyGeocoded}, skipped: ${t.jobGeoSkipped}`}>job-geo: {t.jobGeocodeMs}</span>
                    <span className="search-debug-panel__timing search-debug-panel__timing--geo-detail" title="Jobs that already had valid coordinates">geo-had: {t.jobGeoHadCoords}</span>
                    <span className="search-debug-panel__timing search-debug-panel__timing--geo-detail" title="Jobs that were newly geocoded this search">geo-new: {t.jobGeoNewlyGeocoded}</span>
                    <span className="search-debug-panel__timing search-debug-panel__timing--geo-detail" title="Jobs skipped for geocoding (remote / no location / no user coords)">geo-skip: {t.jobGeoSkipped}</span>
                    <span className="search-debug-panel__timing" title="Total time scoring all jobs (excludes sort)">score: {t.scoreTotalMs}</span>
                    <span className="search-debug-panel__timing search-debug-panel__timing--score-detail" title="Resume match scoring">s-resume: {t.scoreResumeMs}</span>
                    <span className="search-debug-panel__timing search-debug-panel__timing--score-detail" title="Location/distance scoring">s-loc: {t.scoreLocationMs}</span>
                    <span className="search-debug-panel__timing search-debug-panel__timing--score-detail" title="Freshness scoring">s-fresh: {t.scoreFreshnessMs}</span>
                    <span className="search-debug-panel__timing search-debug-panel__timing--score-detail" title="Audit scoring">s-audit: {t.scoreAuditMs}</span>
                    <span className="search-debug-panel__timing search-debug-panel__timing--score-detail" title="Quality of life scoring">s-qol: {t.scoreQolMs}</span>
                    <span className="search-debug-panel__timing search-debug-panel__timing--score-detail" title="Impact scoring">s-impact: {t.scoreImpactMs}</span>
                    <span className="search-debug-panel__timing" title="Sorting scored jobs by total score">score-sort: {t.scoreSortMs}</span>
                    <span className="search-debug-panel__timing" title="Re-sort by user ratings">rating-sort: {t.userRatingSortMs}</span>
                    <span className="search-debug-panel__timing search-debug-panel__timing--total" title="Total search time">total: {t.totalMs}</span>
                  </>
                )}
                {exc && (
                  <>
                    <span className="search-debug-panel__sep search-debug-panel__sep--section">/</span>
                    <span className="search-debug-panel__section-label">excluded:</span>
                    {exc.hiddenByUrl > 0 && (
                      <span className="search-debug-panel__exclusion" title="Removed: job URL is in your hidden list">
                        hidden-url: {exc.hiddenByUrl}
                      </span>
                    )}
                    {exc.hiddenByCompany > 0 && (
                      <span className="search-debug-panel__exclusion" title="Removed: company is in your hidden list">
                        hidden-co: {exc.hiddenByCompany}
                      </span>
                    )}
                    {exc.remoteJobsFiltered > 0 && (
                      <span className="search-debug-panel__exclusion" title="Removed: include-remote-jobs is off">
                        remote-off: {exc.remoteJobsFiltered}
                      </span>
                    )}
                    {exc.userRatingFiltered > 0 && (
                      <span className="search-debug-panel__exclusion" title={`Removed by user-rating mode: ${exc.userRatingFilterMode}`}>
                        rating ({exc.userRatingFilterMode}): {exc.userRatingFiltered}
                      </span>
                    )}
                    {(exc.promptVersionFiltered ?? 0) > 0 && (
                      <span className="search-debug-panel__exclusion" title="Removed by prompt-version filter">
                        prompt-version: {exc.promptVersionFiltered ?? 0}
                      </span>
                    )}
                    {exc.queryMismatch > 0 && (
                      <span className="search-debug-panel__exclusion" title="Removed: text did not match query terms">
                        query-miss: {exc.queryMismatch}
                      </span>
                    )}
                    {exc.hiddenByUrl === 0 && exc.hiddenByCompany === 0 && exc.remoteJobsFiltered === 0 && exc.userRatingFiltered === 0 && (exc.promptVersionFiltered ?? 0) === 0 && exc.queryMismatch === 0 && (
                      <span className="search-debug-panel__item">none</span>
                    )}
                  </>
                )}
              </div>
            )
          })()}
          <div className="job-list">
            {visibleJobs.map((wrapper) => (
              <JobTile
                key={wrapper.job?.name + wrapper.job?.location + wrapper.job?.company_name + wrapper.job?.source_url + resumeText + JSON.stringify(scoreWeights)}
                wrapper={wrapper}
                isUserCreatedJob={Boolean(wrapper.job?.source_url && addedJobSourceUrls.has(String(wrapper.job.source_url).trim()))}
                resumeText={resumeText}
                resumeDisplayName={uploadedResumeName}
                selectedResumeIds={selectedResumeIds}
                resumeCatalogById={resumeCatalogById}
                onAuditRequest={auditEnabled ? handleAuditRequest : undefined}
                onRerollAiRequest={searchDebugEnabled ? handleRerollAiRequest : undefined}
                auditResultOverride={wrapper.job?.source_url ? auditResults[wrapper.job.source_url] : undefined}
                impactResultOverride={wrapper.job?.source_url ? impactResults[wrapper.job.source_url] : undefined}
                scoreWeights={scoreWeights}
                qualityOfLifeResultOverride={wrapper.job?.source_url ? qualityOfLifeResults[wrapper.job.source_url] : undefined}
                onHideJob={handleHideJob}
                onHideCompany={handleHideCompany}
                isHighlighted={Boolean(wrapper.job?.source_url && String(wrapper.job.source_url).trim() === highlightedJobUrl)}
                onToggleHighlightJob={handleToggleHighlightJob}
                jobUserNote={wrapper.job?.source_url ? userNotesByJob[wrapper.job.source_url] : undefined}
                companyUserNote={normalizeCompanyName(wrapper.job?.company_name) ? userNotesByCompany[normalizeCompanyName(wrapper.job?.company_name)] : undefined}
                companyTagColors={normalizeCompanyName(wrapper.job?.company_name) ? companyColorTagsByCompany[normalizeCompanyName(wrapper.job?.company_name)] : undefined}
                onSaveUserNote={wrapper.job?.source_url ? (note) => handleSaveUserNote(wrapper.job!.source_url!, note) : undefined}
                onClearUserNote={wrapper.job?.source_url ? () => handleClearUserNote(wrapper.job!.source_url!) : undefined}
                onSaveCompanyUserNote={normalizeCompanyName(wrapper.job?.company_name) ? (note) => handleSaveCompanyNote(wrapper.job!.company_name!, note) : undefined}
                onClearCompanyUserNote={normalizeCompanyName(wrapper.job?.company_name) ? () => handleClearCompanyNote(wrapper.job!.company_name!) : undefined}
                onSetCompanyTagColors={normalizeCompanyName(wrapper.job?.company_name) ? (colors) => handleSetCompanyColorTags(wrapper.job!.company_name!, colors) : undefined}
                onAwardReadCompletion={wrapper.job?.source_url ? () => handleAwardReadCompletion(wrapper.job!.source_url) : undefined}
                hasReadCompletionAwarded={Boolean(wrapper.job?.source_url && readBonusAwardedJobUrls.includes(wrapper.job.source_url))}
                onSaveUserCreatedJobDetails={handleSaveUserCreatedJobDetails}
                jobStatusRecord={wrapper.job?.company_name ? jobStatusesByCompany[String(wrapper.job.company_name).trim().toLowerCase()] : undefined}
                onSetJobStatus={wrapper.job?.company_name ? (nextStatus) => handleSetJobStatus(wrapper.job!.company_name, nextStatus) : undefined}
                searchDebugEnabled={searchDebugEnabled}
              />
            ))}
          </div>

          <Pagination
            currentPage={currentPage}
            totalItems={totalItems}
            itemsPerPage={itemsPerPage}
            onPageChange={handlePageChange}
          />
        </>
      )}

      <DailyScoreHud
        scorePoints={todayScorePoints}
        jobsViewedToday={todayJobsViewed}
        commentsWrittenToday={todayCommentsWritten}
        userCreatedJobsToday={todayUserCreatedJobs}
      />

      <a
        className="app-github-link"
        href="https://github.com/ben-gibbons-github/ai-job-finder"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Open GitHub repository"
        title="GitHub"
      >
        GitHub
      </a>

      <footer className="app-legal-footer">
        Job postings and company descriptions are aggregated from public sources for informational and analytical purposes. All trademarks and company names belong to their respective owners.
      </footer>

    </main>
  )
}

export default App
