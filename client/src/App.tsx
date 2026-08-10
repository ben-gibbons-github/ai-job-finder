import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import JobTile from './JobTile'
import Pagination from './Pagination'
import SearchTextEntry from './SearchTextEntry'
import LocationDropdown from './LocationDropdown'
import { extractTextFromFile } from './ResumeReader'
import UploadResume from './UploadResume'
import { type ScoreWeights } from './ScoreWeightSliders'
import BulkAuditButton from './AuditAllButton'
import GlobalAIButton from './GlobalAIButton'
import { type JobDistributionMeta } from './JobDistributionGraph'
import SearchLoadingBar from './SearchLoadingBar'
import InsightsHoverPopovers from './InsightsHoverPopovers'
import DailyScoreHud from './DailyScoreHud'
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

const HIDDEN_JOBS_CACHE_KEY = 'hiddenJobsByUrl'
const HIDDEN_COMPANIES_CACHE_KEY = 'hiddenCompaniesByName'
const READ_BONUS_AWARDED_JOBS_CACHE_KEY = 'readBonusAwardedJobsByUrl_v1'

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
  const [auditResults, setAuditResults] = useState<Record<string, { auditScore: number; auditText: string; error?: string }>>({})
  const [auditEnabled, setAuditEnabled] = useState(false)
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
  const [hideApplied, setHideApplied] = useState(false)
  const [hideTagColors, setHideTagColors] = useState<import('./ClientSaveLoad').CompanyTagColor[]>([])
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
      userRatingFilterMode: string
      queryMismatch: number
    }
  } | null>(null)
  const [, setClockTick] = useState(0)
  const [tagCloud, setTagCloud] = useState<TagCloudEntry[]>([])
  const [isResumeLoading, setIsResumeLoading] = useState(false)
  const hasSentInitialSearchRef = useRef(false)
  const initialSearchTimerRef = useRef<number | null>(null)
  const lastAutoSearchSignatureRef = useRef<string | null>(null)
  const hasSearchResultsRef = useRef(false)
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
      if (response?.isInitialResponse && hasSearchResultsRef.current) {
        return
      }

      // Ignore empty result sets — they can arrive out-of-order and would wipe
      // a valid results list that is already displayed.
      if (!response?.results || response.results.length === 0) {
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
    socket.on('server:config', (config: { auditEnabled?: boolean }) => {
      if (typeof config?.auditEnabled === 'boolean') {
        setAuditEnabled(config.auditEnabled)
      }
    })

    return () => {
      socket.off('search:results', onSearchResults)
      socket.off('job:audit:result', onAuditResult)
      socket.off('job:impact:result', onImpactResult)
      socket.off('job:qualityOfLife:result', onQualityOfLifeResult)
      socket.off('server:tagCloud')
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
    saveClientSearchSettings({
      query,
      locationText,
      resumeText,
      uploadedResumeName,
      userRatingMode,
      includeRemoteJobs,
      scoreWeights,
    })
  }, [query, locationText, resumeText, uploadedResumeName, userRatingMode, includeRemoteJobs, scoreWeights])

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
    const emitSearch = (reason: string) => {
      const hasAttachedResume = uploadedResumeName.trim().length > 0 || resumeText.trim().length > 0
      if ((isResumeLoading && !resumeText.trim()) || (hasAttachedResume && !resumeText.trim())) {
        return
      }

      const persistedSettings = !hasSentInitialSearchRef.current && !resumeText.trim()
        ? loadClientSearchSettings()
        : null
      const effectiveResumeText = persistedSettings?.resumeText?.trim()
        ? persistedSettings.resumeText
        : resumeText

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
        includeRemoteJobs,
        userRatingMode,
        ...(userRatingMode !== 'none' ? { userRatings: userRatingsPayload } : {}),
        ...(userRatingFilter ? { userRatingFilter } : {}),
        start: searchStart,
        end: searchEnd,
        scoreWeights,
        hiddenJobUrls,
        hiddenCompanies: derivedHiddenCompanies,
        addedJobs: addedJobsSearchPayload,
      }

      const signature = JSON.stringify(payload)
      if (lastAutoSearchSignatureRef.current === signature) {
        return
      }
      lastAutoSearchSignatureRef.current = signature

      setIsSearching(true)
      logSearchLaunch('search', payload, reason)
      socket.emit('search', payload)
    }

    if (!hasSentInitialSearchRef.current) {
      if (initialSearchTimerRef.current !== null) {
        window.clearTimeout(initialSearchTimerRef.current)
      }

      // Coalesce startup state hydration updates into one initial search.
      initialSearchTimerRef.current = window.setTimeout(() => {
        hasSentInitialSearchRef.current = true
        initialSearchTimerRef.current = null
        emitSearch('initialHydration')
      }, 250)

      return () => {
        if (initialSearchTimerRef.current !== null) {
          window.clearTimeout(initialSearchTimerRef.current)
          initialSearchTimerRef.current = null
        }
      }
    }

    emitSearch('stateChange')
  }, [query, resumeText, uploadedResumeName, isResumeLoading, locationText, includeRemoteJobs, hideApplied, hideTagColors, userRatingMode, userRatingsPayload, userRatingFilter, searchStart, searchEnd, scoreWeights, hiddenJobUrls, hiddenCompanies, addedJobsSearchPayload, jobStatusesByCompany, companyColorTagsByCompany])

  const handleRunAuditAllInSearch = () => {
    const payload: ClientSearchPayload = {
      query,
      resumeText,
      locationText,
      includeRemoteJobs,
      userRatingMode,
      ...(userRatingMode !== 'none' ? { userRatings: userRatingsPayload } : {}),
      ...(userRatingFilter ? { userRatingFilter } : {}),
      start: searchStart,
      end: searchEnd,
      scoreWeights,
      hiddenJobUrls,
      hiddenCompanies,
      addedJobs: addedJobsSearchPayload,
      command: 'AIAuditAllJobsInThisSearch',
    }

    logSearchLaunch('searchWithCommand', payload, 'auditAllInSearch')
    socket.emit('search', payload)
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
  useEffect(() => {
    const timerId = window.setInterval(() => {
      setClockTick((value) => value + 1)
    }, 60_000)

    return () => window.clearInterval(timerId)
  }, [])

  return (
    <main className="app">
      <h1 className={`app-title${isSearching ? ' app-title--searching' : ''}`}>Job Search for Good</h1>
      <InsightsHoverPopovers
        searchMeta={searchMeta}
        scoreWeights={scoreWeights}
        onScoreWeightsChange={setScoreWeights}
        onOpenAiCorpus={() => setOpenAiCorpusSignal((value) => value + 1)}
        onRunAuditAllInSearch={auditEnabled ? handleRunAuditAllInSearch : undefined}
        onAddJob={handleAddJob}
        onExportAllData={handleExportAllData}
        onExportPageAsCsv={handleExportPageAsCsv}
        onImportAllData={handleImportAllData}
        userRatingMode={userRatingMode}
        onUserRatingModeChange={setUserRatingMode}
        includeRemoteJobs={includeRemoteJobs}
        onIncludeRemoteJobsChange={setIncludeRemoteJobs}
        hideApplied={hideApplied}
        onHideAppliedChange={setHideApplied}
        hideTagColors={hideTagColors}
        onHideTagColorsChange={setHideTagColors}
        visibleJobsCount={visibleJobs.length}
        jobsWithUserNotesCount={jobsWithUserNotesCount}
        userNotesCoveragePercent={userNotesCoveragePercent}
        userScoreValues={userScoreValues}
        dailyNoteAddsByDay={dailyNoteAddsByDay}
        dailyScoreBreakdownByDay={dailyScoreBreakdownByDay}
        tagCloud={tagCloud}
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
      </section>

      {!isSearching && (
        <Pagination
          currentPage={currentPage}
          totalItems={totalItems}
          itemsPerPage={itemsPerPage}
          onPageChange={handlePageChange}
        />
      )}

      <SearchLoadingBar isVisible={isSearching} />

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
                    {exc.queryMismatch > 0 && (
                      <span className="search-debug-panel__exclusion" title="Removed: text did not match query terms">
                        query-miss: {exc.queryMismatch}
                      </span>
                    )}
                    {exc.hiddenByUrl === 0 && exc.hiddenByCompany === 0 && exc.remoteJobsFiltered === 0 && exc.userRatingFiltered === 0 && exc.queryMismatch === 0 && (
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

    </main>
  )
}

export default App
