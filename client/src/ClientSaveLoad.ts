/**
 * ClientSaveLoad.ts
 * Handles saving and loading user-specific local data (notes, scores, etc.)
 * backed by localStorage. All keys are namespaced to avoid collisions.
 */

export interface UserJobNote {
  notes: string;
  userScore: number | null;
}

export interface UserNotesState {
  perJob: Record<string, UserJobNote>;
  perCompany: Record<string, UserJobNote>;
}

export type UserNotesDailyActivity = Record<string, number>;
export type DailyCountByDay = Record<string, number>;

export interface DailyScoreBreakdown {
  points: number;
  jobsViewed: number;
  commentsWritten: number;
  userCreatedJobs: number;
}

export type DailyScoreBreakdownByDay = Record<string, DailyScoreBreakdown>;

export type UserRatingMode = 'none' | 'sort' | 'ratedOnly' | 'hideRated';

export type CompanyTagColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple';
export type CompanyColorTagsByCompany = Record<string, CompanyTagColor[]>;

export interface ClientSearchSettings {
  query: string;
  locationText: string;
  resumeText: string;
  uploadedResumeName: string;
  userRatingMode: UserRatingMode;
  includeRemoteJobs: boolean;
  scoreWeights: {
    resume: number;
    impact: number;
    location: number;
    fresh: number;
    audit: number;
    qualityOfLife: number;
  };
}

export interface AddedJobDraft {
  name: string;
  companyName: string;
  location: string;
  remote: string;
  type: string;
  description: string;
  sourceUrl: string;
  userScore: number | null;
}

export interface AddedLocalJob extends AddedJobDraft {
  id: string;
  posted: string;
}

export type JobStatus = 'none' | 'applied' | 'interviewing' | 'accepted' | 'rejected';

export interface JobStatusHistoryEntry {
  changedAt: string;
  beforeStatus: JobStatus;
  afterStatus: JobStatus;
}

export interface JobStatusRecord {
  currentStatus: JobStatus;
  history: JobStatusHistoryEntry[];
}

export type JobStatusesByUrl = Record<string, JobStatusRecord>;
export type JobStatusesByCompany = Record<string, JobStatusRecord>;

const LEGACY_USER_NOTES_KEY = 'jobFinder_userNotes_v1';
const USER_JOB_NOTES_KEY = 'jobFinder_userJobNotes_v2';
const USER_COMPANY_NOTES_KEY = 'jobFinder_userCompanyNotes_v1';
const USER_COMPANY_COLOR_TAGS_LOCAL_STORAGE_KEY = 'jobFinder_userCompanyColorTags_v1';
const USER_COMPANY_COLOR_TAGS_COOKIE_KEY = 'jobFinder_userCompanyColorTags_v1';
const CLIENT_SEARCH_SETTINGS_KEY = 'jobFinder_clientSearchSettings_v1';
const USER_NOTES_DAILY_ACTIVITY_COOKIE = 'jobFinder_userNotesDailyActivity_v1';
const USER_NOTES_DAILY_ACTIVITY_MAX_DAYS = 120;
const JOBS_VIEWED_DAILY_ACTIVITY_KEY = 'jobFinder_jobsViewedDailyActivity_v1';
const JOBS_VIEWED_DAILY_URLS_KEY = 'jobFinder_jobsViewedDailyUrls_v1';
const COMMENTS_WRITTEN_DAILY_ACTIVITY_KEY = 'jobFinder_commentsWrittenDailyActivity_v1';
const USER_CREATED_JOBS_DAILY_ACTIVITY_KEY = 'jobFinder_userCreatedJobsDailyActivity_v1';
const DAILY_SCORE_BREAKDOWN_KEY = 'jobFinder_dailyScoreBreakdown_v1';
const ADDED_JOBS_COOKIE_KEY = 'jobFinder_addedJobs_v1';
const ADDED_JOBS_LOCAL_STORAGE_KEY = 'jobFinder_addedJobs_v1';
const ADDED_JOBS_MAX_ITEMS = 24;
const ADDED_JOBS_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const HIGHLIGHTED_JOB_URL_COOKIE_KEY = 'jobFinder_highlightedJobUrl_v1';
const HIGHLIGHTED_JOB_URL_LOCAL_STORAGE_KEY = 'jobFinder_highlightedJobUrl_v1';
const HIGHLIGHTED_JOB_URL_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const JOB_STATUSES_COOKIE_KEY = 'jobFinder_jobStatuses_v1';
const JOB_STATUSES_LOCAL_STORAGE_KEY = 'jobFinder_jobStatuses_v1';
const JOB_STATUSES_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const JOB_STATUSES_BY_COMPANY_LOCAL_STORAGE_KEY = 'jobFinder_companyStatuses_v1';
const JOB_STATUSES_BY_COMPANY_COOKIE_KEY = 'jobFinder_companyStatuses_v1';
const COMPANY_COLOR_TAGS_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const COMPANY_TAG_COLORS: CompanyTagColor[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];

const JOB_STATUS_VALUES: JobStatus[] = ['none', 'applied', 'interviewing', 'accepted', 'rejected'];

const DEFAULT_CLIENT_SEARCH_SETTINGS: ClientSearchSettings = {
  query: '',
  locationText: '',
  resumeText: '',
  uploadedResumeName: '',
  userRatingMode: 'none',
  includeRemoteJobs: true,
  scoreWeights: {
    resume: 1,
    impact: 1,
    location: 1,
    fresh: 1,
    audit: 1,
    qualityOfLife: 1,
  },
};

function normalizeCompanyKey(name: unknown): string {
  return String(name ?? '').trim().toLowerCase();
}

function normalizeCompanyTagColor(value: unknown): CompanyTagColor | null {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (COMPANY_TAG_COLORS.includes(normalized as CompanyTagColor)) {
    return normalized as CompanyTagColor;
  }
  return null;
}

function normalizeCompanyTagColorList(input: unknown): CompanyTagColor[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const unique = new Set<CompanyTagColor>();
  for (const color of input) {
    const normalized = normalizeCompanyTagColor(color);
    if (normalized) {
      unique.add(normalized);
    }
  }

  return COMPANY_TAG_COLORS.filter((color) => unique.has(color));
}

function normalizeCompanyColorTagsByCompany(input: unknown): CompanyColorTagsByCompany {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }

  const normalized: CompanyColorTagsByCompany = {};
  for (const [companyName, colorList] of Object.entries(input as Record<string, unknown>)) {
    const key = normalizeCompanyKey(companyName);
    if (!key) {
      continue;
    }
    const colors = normalizeCompanyTagColorList(colorList);
    if (colors.length > 0) {
      normalized[key] = colors;
    }
  }

  return normalized;
}

function normalizeAddedJobUserScore(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function normalizeAddedLocalJob(value: unknown): AddedLocalJob | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const name = String(raw.name ?? '').trim();
  const companyName = String(raw.companyName ?? '').trim();
  const sourceUrl = String(raw.sourceUrl ?? '').trim();
  if (!name || !companyName || !sourceUrl) {
    return null;
  }

  const id = String(raw.id ?? '').trim() || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const posted = String(raw.posted ?? '').trim() || new Date().toISOString();

  return {
    id,
    name,
    companyName,
    location: String(raw.location ?? 'Unknown').trim() || 'Unknown',
    remote: String(raw.remote ?? 'Unknown').trim() || 'Unknown',
    type: String(raw.type ?? 'Unknown').trim() || 'Unknown',
    description: String(raw.description ?? '').trim(),
    sourceUrl,
    posted,
    userScore: normalizeAddedJobUserScore(raw.userScore),
  };
}

function normalizeAddedLocalJobs(input: unknown): AddedLocalJob[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const dedupBySourceUrl = new Map<string, AddedLocalJob>();
  for (const row of input) {
    const normalized = normalizeAddedLocalJob(row);
    if (!normalized) {
      continue;
    }
    dedupBySourceUrl.set(normalized.sourceUrl, normalized);
  }

  return Array.from(dedupBySourceUrl.values()).slice(-ADDED_JOBS_MAX_ITEMS);
}

function readAddedJobsFromCookie(): AddedLocalJob[] {
  try {
    const cookieValue = getCookie(ADDED_JOBS_COOKIE_KEY);
    if (!cookieValue) {
      return [];
    }
    return normalizeAddedLocalJobs(JSON.parse(decodeURIComponent(cookieValue)) as unknown);
  } catch {
    return [];
  }
}

function readAddedJobsFromLocalStorage(): AddedLocalJob[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(ADDED_JOBS_LOCAL_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    return normalizeAddedLocalJobs(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

export function loadAddedJobs(): AddedLocalJob[] {
  const fromLocalStorage = readAddedJobsFromLocalStorage();
  if (fromLocalStorage.length > 0) {
    return fromLocalStorage;
  }
  return readAddedJobsFromCookie();
}

export function saveAddedJobs(jobs: AddedLocalJob[]): AddedLocalJob[] {
  const normalized = normalizeAddedLocalJobs(jobs);
  const serialized = JSON.stringify(normalized);

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(ADDED_JOBS_LOCAL_STORAGE_KEY, serialized);
    } catch {
      // Local storage unavailable; continue with cookie attempt.
    }
  }

  try {
    setCookie(ADDED_JOBS_COOKIE_KEY, serialized, ADDED_JOBS_COOKIE_MAX_AGE_SECONDS);
  } catch {
    // Cookie write may fail when payload exceeds browser limits.
  }

  return normalized;
}

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const encodedName = encodeURIComponent(name);
  const allCookies = document.cookie ? document.cookie.split('; ') : [];
  for (const rawCookie of allCookies) {
    if (!rawCookie.startsWith(`${encodedName}=`)) {
      continue;
    }
    return rawCookie.slice(encodedName.length + 1);
  }

  return null;
}

function setCookie(name: string, value: string, maxAgeSeconds: number): void {
  if (typeof document === 'undefined') {
    return;
  }

  const encodedName = encodeURIComponent(name);
  const encodedValue = encodeURIComponent(value);
  document.cookie = `${encodedName}=${encodedValue}; path=/; max-age=${maxAgeSeconds}; samesite=lax`;
}

function normalizeHighlightedJobUrl(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeJobStatus(value: unknown): JobStatus {
  const normalized = String(value ?? '').trim().toLowerCase();
  return JOB_STATUS_VALUES.includes(normalized as JobStatus) ? (normalized as JobStatus) : 'none';
}

function normalizeJobStatusHistoryEntry(value: unknown): JobStatusHistoryEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const changedAt = String(raw.changedAt ?? '').trim();
  const beforeStatus = normalizeJobStatus(raw.beforeStatus);
  const afterStatus = normalizeJobStatus(raw.afterStatus);

  if (!changedAt) {
    return null;
  }

  return {
    changedAt,
    beforeStatus,
    afterStatus,
  };
}

function normalizeJobStatusRecord(value: unknown): JobStatusRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const currentStatus = normalizeJobStatus(raw.currentStatus ?? raw.status);
  const history = Array.isArray(raw.history)
    ? raw.history.map((entry) => normalizeJobStatusHistoryEntry(entry)).filter((entry): entry is JobStatusHistoryEntry => entry !== null)
    : [];

  return {
    currentStatus,
    history,
  };
}

function normalizeJobStatusesByUrl(input: unknown): JobStatusesByUrl {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }

  const normalized: JobStatusesByUrl = {};
  for (const [sourceUrl, value] of Object.entries(input as Record<string, unknown>)) {
    const key = String(sourceUrl ?? '').trim();
    if (!key) {
      continue;
    }

    const record = normalizeJobStatusRecord(value);
    if (!record) {
      continue;
    }

    if (record.currentStatus === 'none' && record.history.length === 0) {
      continue;
    }

    normalized[key] = record;
  }

  return normalized;
}

export function loadHighlightedJobUrl(): string {
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(HIGHLIGHTED_JOB_URL_LOCAL_STORAGE_KEY);
      const fromLocalStorage = normalizeHighlightedJobUrl(raw);
      if (fromLocalStorage) {
        return fromLocalStorage;
      }
    } catch {
      // Fall through to cookie.
    }
  }

  try {
    const cookieValue = getCookie(HIGHLIGHTED_JOB_URL_COOKIE_KEY);
    return normalizeHighlightedJobUrl(cookieValue ? decodeURIComponent(cookieValue) : '');
  } catch {
    return '';
  }
}

export function saveHighlightedJobUrl(sourceUrl?: string | null): string {
  const normalized = normalizeHighlightedJobUrl(sourceUrl);

  if (typeof window !== 'undefined') {
    try {
      if (normalized) {
        window.localStorage.setItem(HIGHLIGHTED_JOB_URL_LOCAL_STORAGE_KEY, normalized);
      } else {
        window.localStorage.removeItem(HIGHLIGHTED_JOB_URL_LOCAL_STORAGE_KEY);
      }
    } catch {
      // Local storage unavailable.
    }
  }

  try {
    if (normalized) {
      setCookie(HIGHLIGHTED_JOB_URL_COOKIE_KEY, normalized, HIGHLIGHTED_JOB_URL_COOKIE_MAX_AGE_SECONDS);
    } else {
      setCookie(HIGHLIGHTED_JOB_URL_COOKIE_KEY, '', 0);
    }
  } catch {
    // Cookie write may fail.
  }

  return normalized;
}

function readJobStatusesFromCookie(): JobStatusesByUrl {
  try {
    const cookieValue = getCookie(JOB_STATUSES_COOKIE_KEY);
    if (!cookieValue) {
      return {}
    }

    return normalizeJobStatusesByUrl(JSON.parse(decodeURIComponent(cookieValue)) as unknown);
  } catch {
    return {};
  }
}

function readJobStatusesFromLocalStorage(): JobStatusesByUrl {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(JOB_STATUSES_LOCAL_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    return normalizeJobStatusesByUrl(JSON.parse(raw) as unknown);
  } catch {
    return {};
  }
}

export function loadJobStatusesByUrl(): JobStatusesByUrl {
  const fromLocalStorage = readJobStatusesFromLocalStorage();
  if (Object.keys(fromLocalStorage).length > 0) {
    return fromLocalStorage;
  }

  return readJobStatusesFromCookie();
}

export function saveJobStatusesByUrl(data: JobStatusesByUrl): JobStatusesByUrl {
  const normalized = normalizeJobStatusesByUrl(data);
  const serialized = JSON.stringify(normalized);

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(JOB_STATUSES_LOCAL_STORAGE_KEY, serialized);
    } catch {
      // Local storage unavailable; continue with cookie attempt.
    }
  }

  try {
    setCookie(JOB_STATUSES_COOKIE_KEY, serialized, JOB_STATUSES_COOKIE_MAX_AGE_SECONDS);
  } catch {
    // Cookie write may fail when payload exceeds browser limits.
  }

  return normalized;
}

// ── Company-keyed status (v2) ────────────────────────────────────────────────

function normalizeJobStatusesByCompany(input: unknown): JobStatusesByCompany {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const normalized: JobStatusesByCompany = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const k = normalizeCompanyKey(key);
    if (!k) continue;
    const record = normalizeJobStatusRecord(value);
    if (!record) continue;
    if (record.currentStatus === 'none' && record.history.length === 0) continue;
    normalized[k] = record;
  }
  return normalized;
}

export function loadJobStatusesByCompany(): JobStatusesByCompany {
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(JOB_STATUSES_BY_COMPANY_LOCAL_STORAGE_KEY);
      if (raw) {
        const parsed = normalizeJobStatusesByCompany(JSON.parse(raw) as unknown);
        if (Object.keys(parsed).length > 0) return parsed;
      }
    } catch { /* fall through */ }
  }
  try {
    const cookieValue = getCookie(JOB_STATUSES_BY_COMPANY_COOKIE_KEY);
    if (cookieValue) return normalizeJobStatusesByCompany(JSON.parse(decodeURIComponent(cookieValue)) as unknown);
  } catch { /* ignore */ }
  return {};
}

export function saveJobStatusesByCompany(data: JobStatusesByCompany): JobStatusesByCompany {
  const normalized = normalizeJobStatusesByCompany(data);
  const serialized = JSON.stringify(normalized);
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(JOB_STATUSES_BY_COMPANY_LOCAL_STORAGE_KEY, serialized); } catch { /* ignore */ }
  }
  try { setCookie(JOB_STATUSES_BY_COMPANY_COOKIE_KEY, serialized, JOB_STATUSES_COOKIE_MAX_AGE_SECONDS); } catch { /* ignore */ }
  return normalized;
}

export function setJobStatusByCompany(
  current: JobStatusesByCompany,
  companyName: string,
  nextStatus: JobStatus,
): JobStatusesByCompany {
  const key = normalizeCompanyKey(companyName);
  if (!key) return current;
  const normalized = normalizeJobStatus(nextStatus);
  const existing = current[key] ?? { currentStatus: 'none', history: [] };
  if (existing.currentStatus === normalized) return current;
  const updated = {
    ...current,
    [key]: {
      currentStatus: normalized,
      history: [
        ...existing.history,
        { changedAt: new Date().toISOString(), beforeStatus: existing.currentStatus, afterStatus: normalized },
      ],
    } as JobStatusRecord,
  };
  return saveJobStatusesByCompany(updated);
}

/**
 * Migrate old per-URL status records to per-company.
 * urlToCompany: mapping of job source_url -> company_name (from search results).
 * Only migrates entries not already present in the company store.
 */
export function migrateJobStatusesToCompany(
  byUrl: JobStatusesByUrl,
  byCompany: JobStatusesByCompany,
  urlToCompany: Record<string, string>,
): JobStatusesByCompany {
  let changed = false;
  const result = { ...byCompany };
  for (const [url, record] of Object.entries(byUrl)) {
    const rawCompany = urlToCompany[url];
    if (!rawCompany) continue;
    const key = normalizeCompanyKey(rawCompany);
    if (!key || result[key]) continue; // don't overwrite existing company status
    result[key] = record;
    changed = true;
  }
  if (changed) saveJobStatusesByCompany(result);
  return result;
}

export function setJobStatusByUrl(
  current: JobStatusesByUrl,
  sourceUrl: string,
  nextStatus: JobStatus,
): JobStatusesByUrl {
  const normalizedSourceUrl = String(sourceUrl ?? '').trim();
  if (!normalizedSourceUrl) {
    return current;
  }

  const normalizedNextStatus = normalizeJobStatus(nextStatus);
  const existing = current[normalizedSourceUrl] ?? { currentStatus: 'none', history: [] };
  if (existing.currentStatus === normalizedNextStatus) {
    return current;
  }

  const nextRecord: JobStatusRecord = {
    currentStatus: normalizedNextStatus,
    history: [
      ...existing.history,
      {
        changedAt: new Date().toISOString(),
        beforeStatus: existing.currentStatus,
        afterStatus: normalizedNextStatus,
      },
    ],
  };

  const updated = {
    ...current,
    [normalizedSourceUrl]: nextRecord,
  };

  return saveJobStatusesByUrl(updated);
}

function readCompanyColorTagsFromCookie(): CompanyColorTagsByCompany {
  try {
    const cookieValue = getCookie(USER_COMPANY_COLOR_TAGS_COOKIE_KEY);
    if (!cookieValue) {
      return {};
    }

    return normalizeCompanyColorTagsByCompany(JSON.parse(decodeURIComponent(cookieValue)) as unknown);
  } catch {
    return {};
  }
}

function readCompanyColorTagsFromLocalStorage(): CompanyColorTagsByCompany {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(USER_COMPANY_COLOR_TAGS_LOCAL_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    return normalizeCompanyColorTagsByCompany(JSON.parse(raw) as unknown);
  } catch {
    return {};
  }
}

export function loadCompanyColorTagsByCompany(): CompanyColorTagsByCompany {
  const fromLocalStorage = readCompanyColorTagsFromLocalStorage();
  if (Object.keys(fromLocalStorage).length > 0) {
    return fromLocalStorage;
  }

  return readCompanyColorTagsFromCookie();
}

export function saveCompanyColorTagsByCompany(data: CompanyColorTagsByCompany): CompanyColorTagsByCompany {
  const normalized = normalizeCompanyColorTagsByCompany(data);
  const serialized = JSON.stringify(normalized);

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(USER_COMPANY_COLOR_TAGS_LOCAL_STORAGE_KEY, serialized);
    } catch {
      // Local storage unavailable; continue with cookie attempt.
    }
  }

  try {
    setCookie(USER_COMPANY_COLOR_TAGS_COOKIE_KEY, serialized, COMPANY_COLOR_TAGS_COOKIE_MAX_AGE_SECONDS);
  } catch {
    // Cookie write may fail when payload exceeds browser limits.
  }

  return normalized;
}

export function saveCompanyColorTags(companyName: string, colors: CompanyTagColor[]): CompanyColorTagsByCompany {
  const current = loadCompanyColorTagsByCompany();
  const key = normalizeCompanyKey(companyName);
  if (!key) {
    return current;
  }

  const normalizedColors = normalizeCompanyTagColorList(colors);
  if (normalizedColors.length === 0) {
    const { [key]: _removed, ...rest } = current;
    return saveCompanyColorTagsByCompany(rest);
  }

  return saveCompanyColorTagsByCompany({
    ...current,
    [key]: normalizedColors,
  });
}

function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeDailyActivityEntries(input: unknown): UserNotesDailyActivity {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }

  const entries = Object.entries(input as Record<string, unknown>)
    .map(([rawDay, rawCount]) => {
      const day = String(rawDay ?? '').trim();
      const count = Number(rawCount);
      return [day, Math.max(0, Math.floor(count))] as const;
    })
    .filter(([day, count]) => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(count) && count > 0)
    .sort(([dayA], [dayB]) => dayA.localeCompare(dayB));

  const trimmedEntries = entries.slice(-USER_NOTES_DAILY_ACTIVITY_MAX_DAYS);
  return Object.fromEntries(trimmedEntries);
}

function readDailyActivityFromLocalStorage(cacheKey: string): DailyCountByDay {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(cacheKey);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    return normalizeDailyActivityEntries(parsed);
  } catch {
    return {};
  }
}

function saveDailyActivityToLocalStorage(cacheKey: string, activity: DailyCountByDay): DailyCountByDay {
  const normalized = normalizeDailyActivityEntries(activity);

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(cacheKey, JSON.stringify(normalized));
    } catch {
      // Storage quota exceeded or unavailable; fail silently.
    }
  }

  return normalized;
}

function incrementLocalDailyActivity(cacheKey: string, points = 1): DailyCountByDay {
  const current = readDailyActivityFromLocalStorage(cacheKey);
  const dayKey = getLocalDateKey();
  const next: DailyCountByDay = {
    ...current,
    [dayKey]: Math.max(0, Math.floor(Number(current[dayKey] ?? 0))) + Math.max(0, Math.floor(Number(points ?? 0))),
  };

  return saveDailyActivityToLocalStorage(cacheKey, next);
}

function readDailyUrlEntries(cacheKey: string): Record<string, string[]> {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(cacheKey);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const normalized: Record<string, string[]> = {};
    for (const [day, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        continue;
      }

      const urls = Array.isArray(value)
        ? Array.from(
            new Set(
              value
                .map((entry) => String(entry ?? '').trim())
                .filter((entry) => entry.length > 0),
            ),
          )
        : [];

      if (urls.length > 0) {
        normalized[day] = urls;
      }
    }

    const sortedDays = Object.keys(normalized).sort((a, b) => a.localeCompare(b));
    const keptDays = sortedDays.slice(-USER_NOTES_DAILY_ACTIVITY_MAX_DAYS);
    return Object.fromEntries(keptDays.map((day) => [day, normalized[day]]));
  } catch {
    return {};
  }
}

function saveDailyUrlEntries(cacheKey: string, entries: Record<string, string[]>): Record<string, string[]> {
  const normalized = readDailyUrlEntries(cacheKey);
  const merged = { ...normalized, ...entries };

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(cacheKey, JSON.stringify(merged));
    } catch {
      // Storage quota exceeded or unavailable; fail silently.
    }
  }

  return merged;
}

function normalizeDailyScoreBreakdownEntries(input: unknown): DailyScoreBreakdownByDay {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }

  const normalized: DailyScoreBreakdownByDay = {};

  for (const [day, value] of Object.entries(input as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      continue;
    }

    const pointsRaw = Number((value as DailyScoreBreakdown | undefined)?.points ?? 0);
    const jobsRaw = Number((value as DailyScoreBreakdown | undefined)?.jobsViewed ?? 0);
    const commentsRaw = Number((value as DailyScoreBreakdown | undefined)?.commentsWritten ?? 0);
    const userCreatedJobsRaw = Number((value as DailyScoreBreakdown | undefined)?.userCreatedJobs ?? 0);

    const points = Number.isFinite(pointsRaw) ? Math.max(0, Math.floor(pointsRaw)) : 0;
    const jobsViewed = Number.isFinite(jobsRaw) ? Math.max(0, Math.floor(jobsRaw)) : 0;
    const commentsWritten = Number.isFinite(commentsRaw) ? Math.max(0, Math.floor(commentsRaw)) : 0;
    const userCreatedJobs = Number.isFinite(userCreatedJobsRaw) ? Math.max(0, Math.floor(userCreatedJobsRaw)) : 0;

    if (points > 0 || jobsViewed > 0 || commentsWritten > 0 || userCreatedJobs > 0) {
      normalized[day] = {
        points,
        jobsViewed,
        commentsWritten,
        userCreatedJobs,
      };
    }
  }

  const sortedDays = Object.keys(normalized).sort((a, b) => a.localeCompare(b));
  const keptDays = sortedDays.slice(-USER_NOTES_DAILY_ACTIVITY_MAX_DAYS);
  return Object.fromEntries(keptDays.map((day) => [day, normalized[day]]));
}

function readDailyScoreBreakdown(): DailyScoreBreakdownByDay {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(DAILY_SCORE_BREAKDOWN_KEY);
    if (!raw) {
      return {};
    }

    return normalizeDailyScoreBreakdownEntries(JSON.parse(raw) as unknown);
  } catch {
    return {};
  }
}

function saveDailyScoreBreakdown(entries: DailyScoreBreakdownByDay): DailyScoreBreakdownByDay {
  const normalized = normalizeDailyScoreBreakdownEntries(entries);

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(DAILY_SCORE_BREAKDOWN_KEY, JSON.stringify(normalized));
    } catch {
      // Storage quota exceeded or unavailable; fail silently.
    }
  }

  return normalized;
}

function setDailyScoreBreakdownForDay(dayKey: string, partial: Partial<DailyScoreBreakdown>): DailyScoreBreakdownByDay {
  const current = readDailyScoreBreakdown();
  const existing = current[dayKey] ?? { points: 0, jobsViewed: 0, commentsWritten: 0, userCreatedJobs: 0 };
  const next: DailyScoreBreakdownByDay = {
    ...current,
    [dayKey]: {
      points: Number.isFinite(Number(partial.points))
        ? Math.max(0, Math.floor(Number(partial.points)))
        : existing.points,
      jobsViewed: Number.isFinite(Number(partial.jobsViewed))
        ? Math.max(0, Math.floor(Number(partial.jobsViewed)))
        : existing.jobsViewed,
      commentsWritten: Number.isFinite(Number(partial.commentsWritten))
        ? Math.max(0, Math.floor(Number(partial.commentsWritten)))
        : existing.commentsWritten,
      userCreatedJobs: Number.isFinite(Number(partial.userCreatedJobs))
        ? Math.max(0, Math.floor(Number(partial.userCreatedJobs)))
        : existing.userCreatedJobs,
    },
  };

  return saveDailyScoreBreakdown(next);
}

export function loadUserNotesDailyActivity(): UserNotesDailyActivity {
  const rawValue = getCookie(USER_NOTES_DAILY_ACTIVITY_COOKIE);
  if (!rawValue) {
    return {};
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(rawValue)) as unknown;
    return normalizeDailyActivityEntries(parsed);
  } catch {
    return {};
  }
}

function saveUserNotesDailyActivity(activity: UserNotesDailyActivity): UserNotesDailyActivity {
  const normalized = normalizeDailyActivityEntries(activity);

  try {
    const serialized = JSON.stringify(normalized);
    // Keep this for a year; old entries are pruned on each write.
    setCookie(USER_NOTES_DAILY_ACTIVITY_COOKIE, serialized, 60 * 60 * 24 * 365);
  } catch {
    // Ignore serialization/cookie write failures.
  }

  return normalized;
}

export function incrementUserNotesAddedToday(points = 1): UserNotesDailyActivity {
  const current = loadUserNotesDailyActivity();
  const dayKey = getLocalDateKey();
  const next: UserNotesDailyActivity = {
    ...current,
    [dayKey]: Math.max(0, Math.floor(Number(current[dayKey] ?? 0))) + Math.max(0, Math.floor(Number(points ?? 0))),
  };

  setDailyScoreBreakdownForDay(dayKey, { points: next[dayKey] ?? 0 });

  return saveUserNotesDailyActivity(next);
}

export function loadJobsViewedDailyActivity(): DailyCountByDay {
  return readDailyActivityFromLocalStorage(JOBS_VIEWED_DAILY_ACTIVITY_KEY);
}

export function incrementJobsViewedToday(sourceUrl?: string): DailyCountByDay {
  const normalizedUrl = String(sourceUrl ?? '').trim();
  const dayKey = getLocalDateKey();

  if (!normalizedUrl) {
    const updated = incrementLocalDailyActivity(JOBS_VIEWED_DAILY_ACTIVITY_KEY, 1);
    setDailyScoreBreakdownForDay(dayKey, { jobsViewed: updated[dayKey] ?? 0 });
    return updated;
  }

  const urlEntries = readDailyUrlEntries(JOBS_VIEWED_DAILY_URLS_KEY);
  const urlsForDay = urlEntries[dayKey] ?? [];
  if (urlsForDay.includes(normalizedUrl)) {
    const current = loadJobsViewedDailyActivity();
    setDailyScoreBreakdownForDay(dayKey, { jobsViewed: current[dayKey] ?? 0 });
    return current;
  }

  saveDailyUrlEntries(JOBS_VIEWED_DAILY_URLS_KEY, {
    ...urlEntries,
    [dayKey]: [...urlsForDay, normalizedUrl],
  });

  const updated = incrementLocalDailyActivity(JOBS_VIEWED_DAILY_ACTIVITY_KEY, 1);
  setDailyScoreBreakdownForDay(dayKey, { jobsViewed: updated[dayKey] ?? 0 });
  return updated;
}

export function loadCommentsWrittenDailyActivity(): DailyCountByDay {
  return readDailyActivityFromLocalStorage(COMMENTS_WRITTEN_DAILY_ACTIVITY_KEY);
}

export function loadUserCreatedJobsDailyActivity(): DailyCountByDay {
  return readDailyActivityFromLocalStorage(USER_CREATED_JOBS_DAILY_ACTIVITY_KEY);
}

export function incrementCommentsWrittenToday(points = 1): DailyCountByDay {
  const dayKey = getLocalDateKey();
  const updated = incrementLocalDailyActivity(COMMENTS_WRITTEN_DAILY_ACTIVITY_KEY, points);
  setDailyScoreBreakdownForDay(dayKey, { commentsWritten: updated[dayKey] ?? 0 });
  return updated;
}

export function incrementUserCreatedJobsToday(points = 1): DailyCountByDay {
  const dayKey = getLocalDateKey();
  const updated = incrementLocalDailyActivity(USER_CREATED_JOBS_DAILY_ACTIVITY_KEY, points);
  setDailyScoreBreakdownForDay(dayKey, { userCreatedJobs: updated[dayKey] ?? 0 });
  return updated;
}

export function loadDailyScoreBreakdownByDay(): DailyScoreBreakdownByDay {
  const breakdown = readDailyScoreBreakdown();
  const pointsByDay = loadUserNotesDailyActivity();
  const jobsViewedByDay = loadJobsViewedDailyActivity();
  const commentsWrittenByDay = loadCommentsWrittenDailyActivity();
  const userCreatedJobsByDay = loadUserCreatedJobsDailyActivity();

  const allDays = new Set<string>([
    ...Object.keys(breakdown),
    ...Object.keys(pointsByDay),
    ...Object.keys(jobsViewedByDay),
    ...Object.keys(commentsWrittenByDay),
    ...Object.keys(userCreatedJobsByDay),
  ]);

  const merged: DailyScoreBreakdownByDay = {};
  for (const dayKey of allDays) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
      continue;
    }

    const existing = breakdown[dayKey] ?? { points: 0, jobsViewed: 0, commentsWritten: 0, userCreatedJobs: 0 };
    const points = Number.isFinite(Number(pointsByDay[dayKey]))
      ? Math.max(0, Math.floor(Number(pointsByDay[dayKey])))
      : existing.points;
    const jobsViewed = Number.isFinite(Number(jobsViewedByDay[dayKey]))
      ? Math.max(0, Math.floor(Number(jobsViewedByDay[dayKey])))
      : existing.jobsViewed;
    const commentsWritten = Number.isFinite(Number(commentsWrittenByDay[dayKey]))
      ? Math.max(0, Math.floor(Number(commentsWrittenByDay[dayKey])))
      : existing.commentsWritten;
    const userCreatedJobs = Number.isFinite(Number(userCreatedJobsByDay[dayKey]))
      ? Math.max(0, Math.floor(Number(userCreatedJobsByDay[dayKey])))
      : existing.userCreatedJobs;

    if (points > 0 || jobsViewed > 0 || commentsWritten > 0 || userCreatedJobs > 0) {
      merged[dayKey] = { points, jobsViewed, commentsWritten, userCreatedJobs };
    }
  }

  return saveDailyScoreBreakdown(merged);
}

function readNoteMap(cacheKey: string): Record<string, UserJobNote> {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(cacheKey);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const entries = Object.entries(parsed as Record<string, UserJobNote>);
    const normalized: Record<string, UserJobNote> = {};
    for (const [key, value] of entries) {
      const noteText = String(value?.notes ?? '');
      const scoreRaw = value?.userScore;
      const score = Number.isFinite(Number(scoreRaw)) ? Number(scoreRaw) : null;
      const normalizedKey = String(key ?? '').trim();
      if (!normalizedKey) {
        continue;
      }
      normalized[normalizedKey] = {
        notes: noteText,
        userScore: score,
      };
    }

    return normalized;
  } catch {
    return {};
  }
}

function writeNoteMap(cacheKey: string, data: Record<string, UserJobNote>): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(cacheKey, JSON.stringify(data));
  } catch {
    // Storage quota exceeded or unavailable; fail silently.
  }
}

function migrateLegacyJobNotesIfNeeded(): void {
  if (typeof window === 'undefined') {
    return;
  }

  const existingJobNotes = window.localStorage.getItem(USER_JOB_NOTES_KEY);
  if (existingJobNotes) {
    return;
  }

  const legacy = readNoteMap(LEGACY_USER_NOTES_KEY);
  if (Object.keys(legacy).length > 0) {
    writeNoteMap(USER_JOB_NOTES_KEY, legacy);
  }
}

/** Load all saved user notes from localStorage. */
export function loadAllUserNotes(): UserNotesState {
  migrateLegacyJobNotesIfNeeded();
  return {
    perJob: readNoteMap(USER_JOB_NOTES_KEY),
    perCompany: readNoteMap(USER_COMPANY_NOTES_KEY),
  };
}

/**
 * Save (or overwrite) the note for a single job identified by source_url.
 * Returns the updated full notes state.
 */
export function saveUserNote(
  sourceUrl: string,
  note: UserJobNote,
): UserNotesState {
  const all = loadAllUserNotes();
  const key = String(sourceUrl ?? '').trim();
  if (!key) {
    return all;
  }
  const updatedPerJob = { ...all.perJob, [key]: note };
  writeNoteMap(USER_JOB_NOTES_KEY, updatedPerJob);
  return {
    perJob: updatedPerJob,
    perCompany: all.perCompany,
  };
}

/**
 * Remove the note for a single job.
 * Returns the updated full notes state.
 */
export function deleteUserNote(
  sourceUrl: string,
): UserNotesState {
  const all = loadAllUserNotes();
  const key = String(sourceUrl ?? '').trim();
  if (!key) {
    return all;
  }
  const { [key]: _removed, ...updatedPerJob } = all.perJob;
  writeNoteMap(USER_JOB_NOTES_KEY, updatedPerJob);
  return {
    perJob: updatedPerJob,
    perCompany: all.perCompany,
  };
}

/**
 * Save (or overwrite) the note for a company name.
 * Returns the updated full notes state.
 */
export function saveCompanyNote(
  companyName: string,
  note: UserJobNote,
): UserNotesState {
  const all = loadAllUserNotes();
  const key = normalizeCompanyKey(companyName);
  if (!key) {
    return all;
  }
  const updatedPerCompany = { ...all.perCompany, [key]: note };
  writeNoteMap(USER_COMPANY_NOTES_KEY, updatedPerCompany);
  return {
    perJob: all.perJob,
    perCompany: updatedPerCompany,
  };
}

/**
 * Remove the note for a single company.
 * Returns the updated full notes state.
 */
export function deleteCompanyNote(
  companyName: string,
): UserNotesState {
  const all = loadAllUserNotes();
  const key = normalizeCompanyKey(companyName);
  if (!key) {
    return all;
  }
  const { [key]: _removed, ...updatedPerCompany } = all.perCompany;
  writeNoteMap(USER_COMPANY_NOTES_KEY, updatedPerCompany);
  return {
    perJob: all.perJob,
    perCompany: updatedPerCompany,
  };
}

function toFiniteOrFallback(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toUserRatingMode(value: unknown, legacySortByUserRating: unknown): UserRatingMode {
  if (value === 'none' || value === 'sort' || value === 'ratedOnly' || value === 'hideRated') {
    return value;
  }

  return Boolean(legacySortByUserRating) ? 'sort' : 'none';
}

export function loadClientSearchSettings(): ClientSearchSettings {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_CLIENT_SEARCH_SETTINGS };
  }

  try {
    const raw = window.localStorage.getItem(CLIENT_SEARCH_SETTINGS_KEY);
    if (!raw) {
      return { ...DEFAULT_CLIENT_SEARCH_SETTINGS };
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...DEFAULT_CLIENT_SEARCH_SETTINGS };
    }

    const data = parsed as Partial<ClientSearchSettings>;
    const parsedWeights = (data.scoreWeights && typeof data.scoreWeights === 'object')
      ? data.scoreWeights
      : DEFAULT_CLIENT_SEARCH_SETTINGS.scoreWeights;

    return {
      query: String(data.query ?? ''),
      locationText: String(data.locationText ?? ''),
      resumeText: String(data.resumeText ?? ''),
      uploadedResumeName: String(data.uploadedResumeName ?? ''),
      userRatingMode: toUserRatingMode((data as Record<string, unknown>).userRatingMode, (data as Record<string, unknown>).sortByUserRating),
      includeRemoteJobs: data.includeRemoteJobs === undefined ? true : Boolean(data.includeRemoteJobs),
      scoreWeights: {
        resume: toFiniteOrFallback((parsedWeights as Record<string, unknown>).resume, 1),
        impact: toFiniteOrFallback((parsedWeights as Record<string, unknown>).impact, 1),
        location: toFiniteOrFallback((parsedWeights as Record<string, unknown>).location, 1),
        fresh: toFiniteOrFallback((parsedWeights as Record<string, unknown>).fresh, 1),
        audit: toFiniteOrFallback((parsedWeights as Record<string, unknown>).audit, 1),
        qualityOfLife: toFiniteOrFallback((parsedWeights as Record<string, unknown>).qualityOfLife, 1),
      },
    };
  } catch {
    return { ...DEFAULT_CLIENT_SEARCH_SETTINGS };
  }
}

export function saveClientSearchSettings(settings: ClientSearchSettings): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(CLIENT_SEARCH_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage quota exceeded or unavailable; fail silently.
  }
}

function xmlEscape(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function parseXmlBoolean(value: string | null | undefined, fallback: boolean): boolean {
  if (value == null) {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }

  return fallback;
}

function normalizeDayKey(value: string | null | undefined): string {
  const day = String(value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : '';
}

export function exportAllLocalDataAsXml(): string {
  const settings = loadClientSearchSettings();
  const highlightedJobUrl = loadHighlightedJobUrl();
  const jobStatusesByUrl = loadJobStatusesByUrl();
  const notes = loadAllUserNotes();
  const companyColorTagsByCompany = loadCompanyColorTagsByCompany();
  const dailyPointsByDay = loadUserNotesDailyActivity();
  const jobsViewedByDay = loadJobsViewedDailyActivity();
  const commentsWrittenByDay = loadCommentsWrittenDailyActivity();
  const userCreatedJobsByDay = loadUserCreatedJobsDailyActivity();
  const dailyScoreBreakdownByDay = loadDailyScoreBreakdownByDay();
  const addedJobs = loadAddedJobs();

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(`<jobFinderBackup version="1" exportedAt="${xmlEscape(new Date().toISOString())}">`);
  lines.push(`  <searchSettings includeRemoteJobs="${settings.includeRemoteJobs ? 'true' : 'false'}" userRatingMode="${xmlEscape(settings.userRatingMode)}">`);
  lines.push(`    <query>${xmlEscape(settings.query)}</query>`);
  lines.push(`    <locationText>${xmlEscape(settings.locationText)}</locationText>`);
  lines.push(`    <resumeText>${xmlEscape(settings.resumeText)}</resumeText>`);
  lines.push(`    <uploadedResumeName>${xmlEscape(settings.uploadedResumeName)}</uploadedResumeName>`);
  lines.push(
    `    <scoreWeights resume="${settings.scoreWeights.resume}" impact="${settings.scoreWeights.impact}" location="${settings.scoreWeights.location}" fresh="${settings.scoreWeights.fresh}" audit="${settings.scoreWeights.audit}" qualityOfLife="${settings.scoreWeights.qualityOfLife}" />`,
  );
  lines.push('  </searchSettings>');

  lines.push(`  <highlightedJob sourceUrl="${xmlEscape(highlightedJobUrl)}" />`);

  lines.push('  <jobStatuses>');
  for (const [sourceUrl, record] of Object.entries(jobStatusesByUrl)) {
    lines.push(
      `    <job sourceUrl="${xmlEscape(sourceUrl)}" currentStatus="${xmlEscape(record.currentStatus)}">`,
    );
    for (const entry of record.history) {
      lines.push(
        `      <entry changedAt="${xmlEscape(entry.changedAt)}" beforeStatus="${xmlEscape(entry.beforeStatus)}" afterStatus="${xmlEscape(entry.afterStatus)}" />`,
      );
    }
    lines.push('    </job>');
  }
  lines.push('  </jobStatuses>');

  lines.push('  <userNotes>');
  lines.push('    <jobNotes>');
  for (const [sourceUrl, note] of Object.entries(notes.perJob)) {
    const scoreAttr = note.userScore === null || !Number.isFinite(note.userScore)
      ? ''
      : String(note.userScore);
    lines.push(
      `      <note sourceUrl="${xmlEscape(sourceUrl)}" userScore="${xmlEscape(scoreAttr)}">${xmlEscape(String(note.notes ?? ''))}</note>`,
    );
  }
  lines.push('    </jobNotes>');

  lines.push('    <companyNotes>');
  for (const [companyName, note] of Object.entries(notes.perCompany)) {
    const scoreAttr = note.userScore === null || !Number.isFinite(note.userScore)
      ? ''
      : String(note.userScore);
    lines.push(
      `      <note companyName="${xmlEscape(companyName)}" userScore="${xmlEscape(scoreAttr)}">${xmlEscape(String(note.notes ?? ''))}</note>`,
    );
  }
  lines.push('    </companyNotes>');
  lines.push('  </userNotes>');

  lines.push('  <companyColorTags>');
  for (const [companyName, colors] of Object.entries(companyColorTagsByCompany)) {
    lines.push(
      `    <company name="${xmlEscape(companyName)}" colors="${xmlEscape(colors.join(','))}" />`,
    );
  }
  lines.push('  </companyColorTags>');

  lines.push('  <addedJobs>');
  for (const addedJob of addedJobs) {
    const scoreAttr = addedJob.userScore === null || !Number.isFinite(addedJob.userScore)
      ? ''
      : String(addedJob.userScore);
    lines.push(
      `    <job id="${xmlEscape(addedJob.id)}" name="${xmlEscape(addedJob.name)}" companyName="${xmlEscape(addedJob.companyName)}" location="${xmlEscape(addedJob.location)}" remote="${xmlEscape(addedJob.remote)}" type="${xmlEscape(addedJob.type)}" sourceUrl="${xmlEscape(addedJob.sourceUrl)}" posted="${xmlEscape(addedJob.posted)}" userScore="${xmlEscape(scoreAttr)}">${xmlEscape(addedJob.description)}</job>`,
    );
  }
  lines.push('  </addedJobs>');

  lines.push('  <dailyScores>');
  lines.push('    <scorePoints>');
  for (const [day, value] of Object.entries(dailyPointsByDay)) {
    lines.push(`      <day date="${xmlEscape(day)}" value="${Math.max(0, Math.floor(Number(value ?? 0)))}" />`);
  }
  lines.push('    </scorePoints>');

  lines.push('    <jobsViewed>');
  for (const [day, value] of Object.entries(jobsViewedByDay)) {
    lines.push(`      <day date="${xmlEscape(day)}" value="${Math.max(0, Math.floor(Number(value ?? 0)))}" />`);
  }
  lines.push('    </jobsViewed>');

  lines.push('    <commentsWritten>');
  for (const [day, value] of Object.entries(commentsWrittenByDay)) {
    lines.push(`      <day date="${xmlEscape(day)}" value="${Math.max(0, Math.floor(Number(value ?? 0)))}" />`);
  }
  lines.push('    </commentsWritten>');

  lines.push('    <userCreatedJobs>');
  for (const [day, value] of Object.entries(userCreatedJobsByDay)) {
    lines.push(`      <day date="${xmlEscape(day)}" value="${Math.max(0, Math.floor(Number(value ?? 0)))}" />`);
  }
  lines.push('    </userCreatedJobs>');

  lines.push('    <scoreBreakdown>');
  for (const [day, value] of Object.entries(dailyScoreBreakdownByDay)) {
    lines.push(
      `      <day date="${xmlEscape(day)}" points="${Math.max(0, Math.floor(Number(value.points ?? 0)))}" jobsViewed="${Math.max(0, Math.floor(Number(value.jobsViewed ?? 0)))}" commentsWritten="${Math.max(0, Math.floor(Number(value.commentsWritten ?? 0)))}" userCreatedJobs="${Math.max(0, Math.floor(Number(value.userCreatedJobs ?? 0)))}" />`,
    );
  }
  lines.push('    </scoreBreakdown>');
  lines.push('  </dailyScores>');
  lines.push('</jobFinderBackup>');

  return `${lines.join('\n')}\n`;
}

export function importAllLocalDataFromXml(xmlText: string): { ok: boolean; message: string } {
  if (typeof window === 'undefined') {
    return { ok: false, message: 'Import is only available in the browser.' };
  }

  try {
    const parser = new DOMParser();
    const documentXml = parser.parseFromString(String(xmlText ?? ''), 'application/xml');
    if (documentXml.querySelector('parsererror')) {
      return { ok: false, message: 'Invalid XML file format.' };
    }

    const root = documentXml.documentElement;
    if (!root || root.nodeName !== 'jobFinderBackup') {
      return { ok: false, message: 'Unsupported backup XML. Missing jobFinderBackup root.' };
    }

    const searchSettingsNode = root.querySelector('searchSettings');
    const scoreWeightsNode = searchSettingsNode?.querySelector('scoreWeights');
    const currentSettings = loadClientSearchSettings();
    const importedSettings: ClientSearchSettings = {
      query: String(searchSettingsNode?.querySelector('query')?.textContent ?? currentSettings.query),
      locationText: String(searchSettingsNode?.querySelector('locationText')?.textContent ?? currentSettings.locationText),
      resumeText: String(searchSettingsNode?.querySelector('resumeText')?.textContent ?? currentSettings.resumeText),
      uploadedResumeName: String(searchSettingsNode?.querySelector('uploadedResumeName')?.textContent ?? currentSettings.uploadedResumeName),
      userRatingMode: toUserRatingMode(searchSettingsNode?.getAttribute('userRatingMode'), currentSettings.userRatingMode === 'sort'),
      includeRemoteJobs: parseXmlBoolean(searchSettingsNode?.getAttribute('includeRemoteJobs'), currentSettings.includeRemoteJobs),
      scoreWeights: {
        resume: toFiniteOrFallback(scoreWeightsNode?.getAttribute('resume'), currentSettings.scoreWeights.resume),
        impact: toFiniteOrFallback(scoreWeightsNode?.getAttribute('impact'), currentSettings.scoreWeights.impact),
        location: toFiniteOrFallback(scoreWeightsNode?.getAttribute('location'), currentSettings.scoreWeights.location),
        fresh: toFiniteOrFallback(scoreWeightsNode?.getAttribute('fresh'), currentSettings.scoreWeights.fresh),
        audit: toFiniteOrFallback(scoreWeightsNode?.getAttribute('audit'), currentSettings.scoreWeights.audit),
        qualityOfLife: toFiniteOrFallback(scoreWeightsNode?.getAttribute('qualityOfLife'), currentSettings.scoreWeights.qualityOfLife),
      },
    };

    const highlightedJobNode = root.querySelector('highlightedJob');
    const importedHighlightedJobUrl = normalizeHighlightedJobUrl(highlightedJobNode?.getAttribute('sourceUrl'));

    const importedJobStatusesByUrl: JobStatusesByUrl = {};
    for (const jobNode of Array.from(root.querySelectorAll('jobStatuses > job'))) {
      const sourceUrl = String(jobNode.getAttribute('sourceUrl') ?? '').trim();
      if (!sourceUrl) {
        continue;
      }

      const currentStatus = normalizeJobStatus(jobNode.getAttribute('currentStatus'));
      const history = Array.from(jobNode.querySelectorAll('entry'))
        .map((entryNode) => normalizeJobStatusHistoryEntry({
          changedAt: entryNode.getAttribute('changedAt'),
          beforeStatus: entryNode.getAttribute('beforeStatus'),
          afterStatus: entryNode.getAttribute('afterStatus'),
        }))
        .filter((entry): entry is JobStatusHistoryEntry => entry !== null);

      if (currentStatus === 'none' && history.length === 0) {
        continue;
      }

      importedJobStatusesByUrl[sourceUrl] = {
        currentStatus,
        history,
      };
    }

    const importedJobNotes: Record<string, UserJobNote> = {};
    for (const noteNode of Array.from(root.querySelectorAll('userNotes > jobNotes > note'))) {
      const sourceUrl = String(noteNode.getAttribute('sourceUrl') ?? '').trim();
      if (!sourceUrl) {
        continue;
      }

      const scoreValue = Number(noteNode.getAttribute('userScore'));
      importedJobNotes[sourceUrl] = {
        notes: String(noteNode.textContent ?? ''),
        userScore: Number.isFinite(scoreValue) ? scoreValue : null,
      };
    }

    const importedCompanyNotes: Record<string, UserJobNote> = {};
    for (const noteNode of Array.from(root.querySelectorAll('userNotes > companyNotes > note'))) {
      const companyName = normalizeCompanyKey(String(noteNode.getAttribute('companyName') ?? ''));
      if (!companyName) {
        continue;
      }

      const scoreValue = Number(noteNode.getAttribute('userScore'));
      importedCompanyNotes[companyName] = {
        notes: String(noteNode.textContent ?? ''),
        userScore: Number.isFinite(scoreValue) ? scoreValue : null,
      };
    }

    const importedCompanyColorTagsByCompany: CompanyColorTagsByCompany = {};
    for (const companyNode of Array.from(root.querySelectorAll('companyColorTags > company'))) {
      const companyName = normalizeCompanyKey(String(companyNode.getAttribute('name') ?? ''));
      if (!companyName) {
        continue;
      }

      const rawColors = String(companyNode.getAttribute('colors') ?? '');
      const colors = normalizeCompanyTagColorList(
        rawColors
          .split(',')
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0),
      );

      if (colors.length > 0) {
        importedCompanyColorTagsByCompany[companyName] = colors;
      }
    }

    const importedDailyPointsByDay: DailyCountByDay = {};
    for (const dayNode of Array.from(root.querySelectorAll('dailyScores > scorePoints > day'))) {
      const dayKey = normalizeDayKey(dayNode.getAttribute('date'));
      if (!dayKey) {
        continue;
      }
      importedDailyPointsByDay[dayKey] = Math.max(0, Math.floor(Number(dayNode.getAttribute('value') ?? 0)));
    }

    const importedJobsViewedByDay: DailyCountByDay = {};
    for (const dayNode of Array.from(root.querySelectorAll('dailyScores > jobsViewed > day'))) {
      const dayKey = normalizeDayKey(dayNode.getAttribute('date'));
      if (!dayKey) {
        continue;
      }
      importedJobsViewedByDay[dayKey] = Math.max(0, Math.floor(Number(dayNode.getAttribute('value') ?? 0)));
    }

    const importedCommentsWrittenByDay: DailyCountByDay = {};
    for (const dayNode of Array.from(root.querySelectorAll('dailyScores > commentsWritten > day'))) {
      const dayKey = normalizeDayKey(dayNode.getAttribute('date'));
      if (!dayKey) {
        continue;
      }
      importedCommentsWrittenByDay[dayKey] = Math.max(0, Math.floor(Number(dayNode.getAttribute('value') ?? 0)));
    }

    const importedUserCreatedJobsByDay: DailyCountByDay = {};
    for (const dayNode of Array.from(root.querySelectorAll('dailyScores > userCreatedJobs > day'))) {
      const dayKey = normalizeDayKey(dayNode.getAttribute('date'));
      if (!dayKey) {
        continue;
      }
      importedUserCreatedJobsByDay[dayKey] = Math.max(0, Math.floor(Number(dayNode.getAttribute('value') ?? 0)));
    }

    const importedBreakdownByDay: DailyScoreBreakdownByDay = {};
    for (const dayNode of Array.from(root.querySelectorAll('dailyScores > scoreBreakdown > day'))) {
      const dayKey = normalizeDayKey(dayNode.getAttribute('date'));
      if (!dayKey) {
        continue;
      }

      importedBreakdownByDay[dayKey] = {
        points: Math.max(0, Math.floor(Number(dayNode.getAttribute('points') ?? 0))),
        jobsViewed: Math.max(0, Math.floor(Number(dayNode.getAttribute('jobsViewed') ?? 0))),
        commentsWritten: Math.max(0, Math.floor(Number(dayNode.getAttribute('commentsWritten') ?? 0))),
        userCreatedJobs: Math.max(0, Math.floor(Number(dayNode.getAttribute('userCreatedJobs') ?? 0))),
      };
    }

    const importedAddedJobs: AddedLocalJob[] = [];
    for (const jobNode of Array.from(root.querySelectorAll('addedJobs > job'))) {
      const sourceUrl = String(jobNode.getAttribute('sourceUrl') ?? '').trim();
      const name = String(jobNode.getAttribute('name') ?? '').trim();
      const companyName = String(jobNode.getAttribute('companyName') ?? '').trim();
      if (!sourceUrl || !name || !companyName) {
        continue;
      }

      importedAddedJobs.push({
        id: String(jobNode.getAttribute('id') ?? '').trim() || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        name,
        companyName,
        location: String(jobNode.getAttribute('location') ?? 'Unknown').trim() || 'Unknown',
        remote: String(jobNode.getAttribute('remote') ?? 'Unknown').trim() || 'Unknown',
        type: String(jobNode.getAttribute('type') ?? 'Unknown').trim() || 'Unknown',
        sourceUrl,
        posted: String(jobNode.getAttribute('posted') ?? '').trim() || new Date().toISOString(),
        description: String(jobNode.textContent ?? '').trim(),
        userScore: normalizeAddedJobUserScore(jobNode.getAttribute('userScore')),
      });
    }

    saveClientSearchSettings(importedSettings);
    writeNoteMap(USER_JOB_NOTES_KEY, importedJobNotes);
    writeNoteMap(USER_COMPANY_NOTES_KEY, importedCompanyNotes);
    saveCompanyColorTagsByCompany(importedCompanyColorTagsByCompany);
    saveUserNotesDailyActivity(importedDailyPointsByDay);
    saveDailyActivityToLocalStorage(JOBS_VIEWED_DAILY_ACTIVITY_KEY, importedJobsViewedByDay);
    saveDailyActivityToLocalStorage(COMMENTS_WRITTEN_DAILY_ACTIVITY_KEY, importedCommentsWrittenByDay);
    saveDailyActivityToLocalStorage(USER_CREATED_JOBS_DAILY_ACTIVITY_KEY, importedUserCreatedJobsByDay);
    saveDailyScoreBreakdown(importedBreakdownByDay);
    saveAddedJobs(importedAddedJobs);
    saveHighlightedJobUrl(importedHighlightedJobUrl);
    saveJobStatusesByUrl(importedJobStatusesByUrl);

    return {
      ok: true,
      message: `Imported XML backup successfully (${Object.keys(importedJobNotes).length} job notes, ${Object.keys(importedCompanyNotes).length} company notes, ${Object.keys(importedCompanyColorTagsByCompany).length} tagged companies, ${importedAddedJobs.length} added jobs, ${Object.keys(importedJobStatusesByUrl).length} job statuses).`,
    };
  } catch (error) {
    return {
      ok: false,
      message: `Failed to import XML backup: ${String(error)}`,
    };
  }
}
