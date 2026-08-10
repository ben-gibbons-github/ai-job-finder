import { geocodeUserLocation, geocodeJobLocations, isRemoteJob } from './SearchDistance.js';
import { calculateIndividualScores, jobMatchesQuery } from './SearchUtils.js';
const SERVER_HIDDEN_EXCLUSIONS_ENABLED = true;
function normalizeExactUrl(value) {
    return String(value ?? '').trim();
}
function normalizeExactCompanyName(value) {
    return String(value ?? '').trim().toLowerCase();
}
function parseUserRatingMode(value) {
    if (value === 'none' || value === 'sort' || value === 'ratedOnly' || value === 'hideRated') {
        return value;
    }
    return 'none';
}
function normalizeUserScore(value) {
    const score = Number(value);
    if (!Number.isFinite(score)) {
        return null;
    }
    return Math.max(0, Math.min(100, score));
}
function buildUserRatingMap(raw, normalizeKey) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return new Map();
    }
    const entries = Object.entries(raw)
        .map(([key, value]) => {
        const normalizedKey = normalizeKey(key);
        const normalizedScore = normalizeUserScore(value);
        return [normalizedKey, normalizedScore];
    })
        .filter(([key, score]) => key.length > 0 && score !== null);
    return new Map(entries);
}
function getRatedCompanyKeys(job) {
    const keys = [
        normalizeExactCompanyName(job.company_name),
        normalizeExactCompanyName(job.scrapedEmployer?.name),
    ].filter((value) => value.length > 0);
    return Array.from(new Set(keys));
}
function getEffectiveUserRating(job, jobRatingMap, companyRatingMap) {
    const sourceUrl = normalizeExactUrl(job.source_url);
    if (sourceUrl.length > 0) {
        const jobRating = jobRatingMap.get(sourceUrl);
        if (typeof jobRating === 'number') {
            return jobRating;
        }
    }
    const companyKeys = getRatedCompanyKeys(job);
    for (const companyKey of companyKeys) {
        const companyRating = companyRatingMap.get(companyKey);
        if (typeof companyRating === 'number') {
            return companyRating;
        }
    }
    return null;
}
function hasAnyUserRating(job, ratedJobUrls, ratedCompanies) {
    const sourceUrl = normalizeExactUrl(job.source_url);
    if (sourceUrl.length > 0 && ratedJobUrls.has(sourceUrl)) {
        return true;
    }
    const companyKeys = getRatedCompanyKeys(job);
    return companyKeys.some((companyKey) => ratedCompanies.has(companyKey));
}
function sanitizeAddedJobs(raw) {
    if (!Array.isArray(raw) || raw.length === 0) {
        return [];
    }
    const jobs = [];
    const nowIso = new Date().toISOString();
    for (let index = 0; index < raw.length; index += 1) {
        const row = raw[index];
        if (!row || typeof row !== 'object' || Array.isArray(row)) {
            continue;
        }
        const obj = row;
        const name = String(obj.name ?? '').trim();
        const companyName = String(obj.company_name ?? '').trim();
        if (!name || !companyName) {
            continue;
        }
        const sourceUrlRaw = String(obj.source_url ?? '').trim();
        const sourceUrl = sourceUrlRaw || `local://added-job/${Date.now()}-${index}`;
        const userScore = normalizeUserScore(obj.userScore);
        const ratingBoost = typeof userScore === 'number' ? Math.max(0.45, userScore / 100) : 0.25;
        jobs.push({
            name,
            company_name: companyName,
            location: String(obj.location ?? 'Unknown').trim() || 'Unknown',
            remote: String(obj.remote ?? 'Unknown').trim() || 'Unknown',
            location_lon: 0,
            location_lat: 0,
            description: String(obj.description ?? '').trim(),
            type: String(obj.type ?? 'Unknown').trim() || 'Unknown',
            source: 'AddedByUser',
            source_url: sourceUrl,
            posted: String(obj.posted ?? '').trim() || nowIso,
            impact_number: 0,
            audit_number: Math.round(ratingBoost * 100),
            audit_text: '',
            tags: ['User Added'],
        });
    }
    return jobs;
}
function mergeAddedJobs(baseJobs, addedJobs) {
    if (addedJobs.length === 0) {
        return baseJobs;
    }
    const dedup = new Map();
    for (const job of addedJobs) {
        const sourceUrl = normalizeExactUrl(job.source_url);
        if (!sourceUrl) {
            continue;
        }
        dedup.set(sourceUrl, job);
    }
    for (const job of baseJobs) {
        const sourceUrl = normalizeExactUrl(job.source_url);
        if (!sourceUrl || dedup.has(sourceUrl)) {
            continue;
        }
        dedup.set(sourceUrl, job);
    }
    return Array.from(dedup.values());
}
function buildJobAiPayload(job) {
    const employer = job.scrapedEmployer;
    if (!employer) {
        return undefined;
    }
    const auditSummary = String(employer.ai_summary ?? '').trim();
    const auditRedFlagSummary = String(employer.ai_red_flag_summary ?? '').trim();
    const impactSummary = String(employer.ai_impact_summary ?? '').trim();
    const qualityOfLifeSummary = String(employer.employeeQualityOfLifeSummary ?? '').trim();
    const auditScore = Number(employer.ai_score ?? 0);
    const redFlagScore = Number(employer.ai_red_flag_score ?? 0);
    const impactScore = Number(employer.ai_impact_score ?? 0);
    const qualityOfLifeScore = Number(employer.employeeQualityOfLifeScore ?? 0);
    return {
        audit: {
            hasData: auditSummary.length > 0 ||
                auditRedFlagSummary.length > 0 ||
                Number.isFinite(auditScore) && auditScore > 0 ||
                Number.isFinite(redFlagScore) && redFlagScore > 0,
            score: Number.isFinite(auditScore) ? auditScore : 0,
            redFlagScore: Number.isFinite(redFlagScore) ? redFlagScore : 0,
            summary: auditSummary,
            redFlagSummary: auditRedFlagSummary,
        },
        impact: {
            hasData: impactSummary.length > 0 || (Number.isFinite(impactScore) && impactScore > 0),
            score: Number.isFinite(impactScore) ? impactScore : 0,
            summary: impactSummary,
        },
        qualityOfLife: {
            hasData: qualityOfLifeSummary.length > 0 || (Number.isFinite(qualityOfLifeScore) && qualityOfLifeScore > 0),
            score: Number.isFinite(qualityOfLifeScore) ? qualityOfLifeScore : 0,
            summary: qualityOfLifeSummary,
        },
    };
}
function toPercent(part, total) {
    if (total <= 0) {
        return 0;
    }
    return Number(((part / total) * 100).toFixed(1));
}
function buildSearchAiCoverage(wrappers) {
    const totalMatched = wrappers.length;
    const auditCount = wrappers.filter((wrapper) => wrapper.aiPayload?.audit?.hasData === true).length;
    const impactCount = wrappers.filter((wrapper) => wrapper.aiPayload?.impact?.hasData === true).length;
    const qualityOfLifeCount = wrappers.filter((wrapper) => wrapper.aiPayload?.qualityOfLife?.hasData === true).length;
    const geocodedCount = wrappers.filter((wrapper) => {
        const lat = Number(wrapper.job.location_lat);
        const lon = Number(wrapper.job.location_lon);
        return Number.isFinite(lat) && Number.isFinite(lon);
    }).length;
    return {
        auditPercent: toPercent(auditCount, totalMatched),
        impactPercent: toPercent(impactCount, totalMatched),
        qualityOfLifePercent: toPercent(qualityOfLifeCount, totalMatched),
        geocodedPercent: toPercent(geocodedCount, totalMatched),
        totalMatched,
    };
}
function buildScoreDistribution(wrappers) {
    const buckets = new Map();
    for (const wrapper of wrappers) {
        const scorePercent = Number(wrapper.totalScore ?? 0) * 100;
        if (!Number.isFinite(scorePercent)) {
            continue;
        }
        const bucketStart = Math.max(0, Math.floor(scorePercent / 10) * 10);
        buckets.set(bucketStart, (buckets.get(bucketStart) ?? 0) + 1);
    }
    return Array.from(buckets.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([start, count]) => ({
        start,
        end: start + 9,
        count,
    }));
}
class SearchMain {
    async search(jobs, searchPayload) {
        const logFlags = searchPayload.searchLogFlags ?? {};
        const logSearchMain = logFlags.searchMain === true;
        const hiddenExclusionsEnabled = SERVER_HIDDEN_EXCLUSIONS_ENABLED;
        const logSearchStage = (stageName, startedAt, details) => {
            if (!logSearchMain) {
                return;
            }
            const elapsedMs = Date.now() - startedAt;
            console.log(`[SearchMain] ${stageName} took ${elapsedMs}ms${details ? ` (${details})` : ''}`);
        };
        const searchStartedAt = Date.now();
        const rawQueryValue = searchPayload.query;
        const rawQuery = typeof rawQueryValue === 'string' ? rawQueryValue : '';
        const parseInputsStartedAt = Date.now();
        const queryTerms = rawQuery
            .trim()
            .toLowerCase()
            .split(/\s+/)
            .map((term) => term.trim())
            .filter((term) => term.length > 0);
        const hiddenJobUrls = hiddenExclusionsEnabled && Array.isArray(searchPayload.hiddenJobUrls)
            ? new Set(searchPayload.hiddenJobUrls
                .map((value) => normalizeExactUrl(value))
                .filter((value) => value.length > 0))
            : new Set();
        const hiddenCompanies = hiddenExclusionsEnabled && Array.isArray(searchPayload.hiddenCompanies)
            ? new Set(searchPayload.hiddenCompanies
                .map((value) => normalizeExactCompanyName(value))
                .filter((value) => value.length > 0))
            : new Set();
        const addedJobs = sanitizeAddedJobs(searchPayload.addedJobs);
        const jobsForSearch = mergeAddedJobs(jobs, addedJobs);
        logSearchStage('input normalization', parseInputsStartedAt, `queryTerms=${queryTerms.length}, jobs=${jobsForSearch.length}, addedJobs=${addedJobs.length}`);
        const hiddenFilterStartedAt = Date.now();
        const visibleJobs = jobsForSearch.filter((job) => {
            const sourceUrl = normalizeExactUrl(job.source_url);
            const companyName = normalizeExactCompanyName(job.company_name);
            if (sourceUrl && hiddenJobUrls.has(sourceUrl)) {
                return false;
            }
            if (companyName && hiddenCompanies.has(companyName)) {
                return false;
            }
            return true;
        });
        logSearchStage('hidden exclusion filtering', hiddenFilterStartedAt, `visibleJobs=${visibleJobs.length}`);
        const includeRemoteJobs = searchPayload.includeRemoteJobs !== false;
        const remoteFilterStartedAt = Date.now();
        const remoteFilteredJobs = includeRemoteJobs
            ? visibleJobs
            : visibleJobs.filter((job) => !isRemoteJob(job));
        logSearchStage('remote filtering', remoteFilterStartedAt, `jobs=${remoteFilteredJobs.length}`);
        const userRatingMode = parseUserRatingMode(searchPayload.userRatingMode);
        const ratingFilterStartedAt = Date.now();
        const jobRatingMap = userRatingMode !== 'none'
            ? buildUserRatingMap(searchPayload.userRatings?.jobRatingsByUrl, normalizeExactUrl)
            : new Map();
        const companyRatingMap = userRatingMode !== 'none'
            ? buildUserRatingMap(searchPayload.userRatings?.companyRatingsByName, normalizeExactCompanyName)
            : new Map();
        const ratedJobUrls = userRatingMode === 'ratedOnly' || userRatingMode === 'hideRated'
            ? new Set([
                ...Array.from(jobRatingMap.keys()),
                ...(Array.isArray(searchPayload.userRatingFilter?.ratedJobUrls)
                    ? searchPayload.userRatingFilter.ratedJobUrls
                        .map((value) => normalizeExactUrl(value))
                        .filter((value) => value.length > 0)
                    : []),
            ])
            : new Set();
        const ratedCompanies = userRatingMode === 'ratedOnly' || userRatingMode === 'hideRated'
            ? new Set([
                ...Array.from(companyRatingMap.keys()),
                ...(Array.isArray(searchPayload.userRatingFilter?.ratedCompanies)
                    ? searchPayload.userRatingFilter.ratedCompanies
                        .map((value) => normalizeExactCompanyName(value))
                        .filter((value) => value.length > 0)
                    : []),
            ])
            : new Set();
        const ratingFilteredJobs = userRatingMode === 'ratedOnly'
            ? remoteFilteredJobs.filter((job) => hasAnyUserRating(job, ratedJobUrls, ratedCompanies))
            : userRatingMode === 'hideRated'
                ? remoteFilteredJobs.filter((job) => !hasAnyUserRating(job, ratedJobUrls, ratedCompanies))
                : remoteFilteredJobs;
        logSearchStage('user rating filtering', ratingFilterStartedAt, `jobs=${ratingFilteredJobs.length}, mode=${userRatingMode}`);
        if (logSearchMain) {
            console.log('SearchMain.search called with query:', rawQuery, 'parsed terms:', queryTerms, 'locationText:', searchPayload.locationText, 'resumeText length:', typeof searchPayload.resumeText === 'string' ? searchPayload.resumeText.length : 'N/A', 'hiddenExclusionsEnabled:', hiddenExclusionsEnabled, 'hiddenJobUrls:', hiddenJobUrls.size, 'hiddenCompanies:', hiddenCompanies.size, 'userRatingMode:', userRatingMode, 'jobRatingMap:', jobRatingMap.size, 'companyRatingMap:', companyRatingMap.size, 'ratedJobUrls:', ratedJobUrls.size, 'ratedCompanies:', ratedCompanies.size);
        }
        const queryMatchStartedAt = Date.now();
        const matched = queryTerms.length > 0
            ? ratingFilteredJobs.filter((job) => jobMatchesQuery(job, queryTerms, logFlags.query === true))
            : ratingFilteredJobs; // If no query terms, consider all visible jobs as matched (subject to pagination later)
        logSearchStage('query matching', queryMatchStartedAt, `matched=${matched.length}`);
        const resumeText = typeof searchPayload.resumeText === 'string' ? searchPayload.resumeText : '';
        const locationText = typeof searchPayload.locationText === 'string' ? searchPayload.locationText : '';
        // Geocode user location
        const userGeocodeStartedAt = Date.now();
        const userLocCoords = locationText.length > 0 ? await geocodeUserLocation(locationText, logFlags.location === true) : null;
        const userLat = userLocCoords?.lat ?? null;
        const userLon = userLocCoords?.lon ?? null;
        const hasUsableUserCoords = typeof userLat === 'number' &&
            typeof userLon === 'number' &&
            Number.isFinite(userLat) &&
            Number.isFinite(userLon);
        if (logSearchMain) {
            console.log('User location geocoded to:', userLocCoords, 'for location text:', locationText);
        }
        logSearchStage('user location geocoding', userGeocodeStartedAt, hasUsableUserCoords ? 'coords=usable' : 'coords=unavailable');
        // return { matched: [], size: matched.length }
        // Geocoding every job location is expensive and only helps when user coordinates exist.
        // For empty/failed location input paths, skip this entirely and rely on text/remote scoring.
        const jobGeocodeStartedAt = Date.now();
        const jobsWithCoords = hasUsableUserCoords
            ? await geocodeJobLocations(matched, logFlags.location === true)
            : matched;
        logSearchStage('job location geocoding', jobGeocodeStartedAt, `jobs=${jobsWithCoords.length}`);
        // Calculate scores for each job and create wrappers
        const rankingStartedAt = Date.now();
        const rankedWrappers = jobsWithCoords
            .map((job) => {
            const scores = calculateIndividualScores(job, resumeText, locationText, userLat, userLon, logFlags);
            const addedJobBonus = job.source === 'AddedByUser'
                ? Math.max(0.45, Number.isFinite(job.audit_number) ? Number(job.audit_number) / 100 : 0.45)
                : 0;
            // Calculate total score using weights
            const totalScore = (scores.resume ?? 0) * (searchPayload.scoreWeights?.resume ?? 1) +
                (scores.impact ?? 0) * (searchPayload.scoreWeights?.impact ?? 1) +
                (scores.location ?? 0) * (searchPayload.scoreWeights?.location ?? 1) +
                (scores.fresh ?? 0) * (searchPayload.scoreWeights?.fresh ?? 1) +
                (scores.audit ?? 0) * (searchPayload.scoreWeights?.audit ?? 1) +
                (scores.qualityOfLife ?? 0) * (searchPayload.scoreWeights?.qualityOfLife ?? 1) +
                addedJobBonus;
            return {
                job,
                scores,
                totalScore,
                aiPayload: buildJobAiPayload(job),
            };
        })
            .sort((a, b) => b.totalScore - a.totalScore);
        logSearchStage('score calculation and ranking', rankingStartedAt, `ranked=${rankedWrappers.length}`);
        const userRatingSortStartedAt = Date.now();
        const sortedByUserRatingWrappers = userRatingMode === 'none'
            ? rankedWrappers
            : rankedWrappers
                .map((wrapper, originalIndex) => {
                const userRating = getEffectiveUserRating(wrapper.job, jobRatingMap, companyRatingMap);
                return {
                    wrapper,
                    originalIndex,
                    userRating,
                };
            })
                .sort((a, b) => {
                const aHasRating = a.userRating !== null;
                const bHasRating = b.userRating !== null;
                if (aHasRating !== bHasRating) {
                    return aHasRating ? -1 : 1;
                }
                if (aHasRating && bHasRating) {
                    if (a.userRating !== b.userRating) {
                        return Number(b.userRating) - Number(a.userRating);
                    }
                    return a.originalIndex - b.originalIndex;
                }
                return a.originalIndex - b.originalIndex;
            })
                .map((entry) => entry.wrapper);
        logSearchStage('user rating sort', userRatingSortStartedAt, `sorted=${sortedByUserRatingWrappers.length}`);
        const metaStartedAt = Date.now();
        const start = Number.isInteger(searchPayload.start) ? Number(searchPayload.start) : 0;
        const end = Number.isInteger(searchPayload.end) ? Number(searchPayload.end) : sortedByUserRatingWrappers.length;
        const meta = {
            aiCoverage: buildSearchAiCoverage(sortedByUserRatingWrappers),
            scoreDistribution: buildScoreDistribution(sortedByUserRatingWrappers),
            appliedFilters: {
                includeRemoteJobs,
                userRatingMode,
            },
        };
        logSearchStage('result metadata', metaStartedAt, `matched=${sortedByUserRatingWrappers.length}`);
        if (start < 0 || end < 0 || end <= start) {
            logSearchStage('search total', searchStartedAt, `returned=${sortedByUserRatingWrappers.length}`);
            return { matched: sortedByUserRatingWrappers, size: sortedByUserRatingWrappers.length, meta };
        }
        if (logSearchMain) {
            console.log(sortedByUserRatingWrappers.length, 'jobs matched the query. Returning ranked slice from', start, 'to', end);
            console.log('SearchPayload: ' + JSON.stringify(searchPayload));
        }
        const sliced = sortedByUserRatingWrappers.slice(start, end);
        // sliced.map((wrapper, index) => {
        //   const shouldLaunch = true
        //   wrapper.scores.audit = Math.min(auditJob(wrapper.job, logFlags.audit === true, shouldLaunch) / 100, 1.0)
        // })
        logSearchStage('search total', searchStartedAt, `returned=${sliced.length}, matched=${sortedByUserRatingWrappers.length}`);
        return { matched: sliced, size: sortedByUserRatingWrappers.length, meta };
    }
}
export default SearchMain;
