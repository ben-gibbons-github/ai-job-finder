import type { ScrapedJob } from './ScrapedJob.js';

interface SourceHealthStats {
  total: number;
  missingDescription: number;
  missingCompany: number;
  missingSourceUrl: number;
  unknownLocation: number;
}

function safePreview(value: unknown, maxLength = 80): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}...`;
}

export function logScrapeQualityFlags(jobs: ScrapedJob[]): void {
  if (jobs.length === 0) {
    console.log('[ScrapeQuality] No jobs to inspect.');
    return;
  }

  const missingDescription = jobs.filter((job) => String(job.description ?? '').trim().length === 0);
  const missingCompany = jobs.filter((job) => String(job.company_name ?? '').trim().length === 0);
  const missingSourceUrl = jobs.filter((job) => String(job.source_url ?? '').trim().length === 0);
  const unknownLocation = jobs.filter((job) => {
    const location = String(job.location ?? '').trim().toLowerCase();
    return location.length === 0 || location === 'unknown';
  });

  const flaggedTotal = new Set<ScrapedJob>([
    ...missingDescription,
    ...missingCompany,
    ...missingSourceUrl,
    ...unknownLocation,
  ]).size;

  const formatSample = (subset: ScrapedJob[]): string =>
    subset
      .slice(0, 5)
      .map((job) => {
        const title = safePreview(job.name || 'Untitled', 60);
        const company = safePreview(job.company_name || 'Unknown company', 40);
        const source = safePreview(job.source || 'Unknown source', 24);
        return `${title} | ${company} | ${source}`;
      })
      .join(' || ');

  console.log(
    [
      '[ScrapeQuality] Flag summary:',
      `flaggedUnique=${flaggedTotal}/${jobs.length}`,
      `missingDescription=${missingDescription.length}`,
      `missingCompany=${missingCompany.length}`,
      `missingSourceUrl=${missingSourceUrl.length}`,
      `unknownLocation=${unknownLocation.length}`,
    ].join(' ')
  );

  if (missingDescription.length > 0) {
    console.warn(`[ScrapeQuality] Missing description sample: ${formatSample(missingDescription)}`);
  }
  if (missingCompany.length > 0) {
    console.warn(`[ScrapeQuality] Missing company sample: ${formatSample(missingCompany)}`);
  }
  if (missingSourceUrl.length > 0) {
    console.warn(`[ScrapeQuality] Missing source_url sample: ${formatSample(missingSourceUrl)}`);
  }
  if (unknownLocation.length > 0) {
    console.warn(`[ScrapeQuality] Unknown location sample: ${formatSample(unknownLocation)}`);
  }

  const sourceStats = new Map<string, SourceHealthStats>();

  const ensureSourceStats = (sourceName: string): SourceHealthStats => {
    const existing = sourceStats.get(sourceName);
    if (existing) {
      return existing;
    }

    const created: SourceHealthStats = {
      total: 0,
      missingDescription: 0,
      missingCompany: 0,
      missingSourceUrl: 0,
      unknownLocation: 0,
    };
    sourceStats.set(sourceName, created);
    return created;
  };

  for (const job of jobs) {
    const sourceName = String(job.source ?? '').trim() || 'Unknown source';
    const stats = ensureSourceStats(sourceName);
    stats.total += 1;

    if (String(job.description ?? '').trim().length === 0) {
      stats.missingDescription += 1;
    }
    if (String(job.company_name ?? '').trim().length === 0) {
      stats.missingCompany += 1;
    }
    if (String(job.source_url ?? '').trim().length === 0) {
      stats.missingSourceUrl += 1;
    }

    const location = String(job.location ?? '').trim().toLowerCase();
    if (location.length === 0 || location === 'unknown') {
      stats.unknownLocation += 1;
    }
  }

  const toPct = (part: number, total: number): string => {
    if (total <= 0) {
      return '0.0';
    }
    return ((part / total) * 100).toFixed(1);
  };

  const severityScore = (stats: SourceHealthStats): number => {
    if (stats.total <= 0) {
      return 0;
    }

    // Weight hard failures (missing core fields) higher than soft quality issues.
    return (
      (stats.missingCompany / stats.total) * 4 +
      (stats.missingSourceUrl / stats.total) * 4 +
      (stats.missingDescription / stats.total) * 2 +
      (stats.unknownLocation / stats.total) * 1
    );
  };

  const rankedSources = Array.from(sourceStats.entries())
    .map(([source, stats]) => ({
      source,
      stats,
      severity: severityScore(stats),
    }))
    .filter(({ stats }) =>
      stats.missingDescription > 0 ||
      stats.missingCompany > 0 ||
      stats.missingSourceUrl > 0 ||
      stats.unknownLocation > 0,
    )
    .sort((a, b) => {
      if (b.severity !== a.severity) {
        return b.severity - a.severity;
      }
      const bFlagged = b.stats.missingDescription + b.stats.missingCompany + b.stats.missingSourceUrl + b.stats.unknownLocation;
      const aFlagged = a.stats.missingDescription + a.stats.missingCompany + a.stats.missingSourceUrl + a.stats.unknownLocation;
      return bFlagged - aFlagged;
    });

  if (rankedSources.length === 0) {
    console.log('[ScrapeQuality] Source severity ranking: no flagged sources.');
    return;
  }

  const severityLines = rankedSources.slice(0, 15).map(({ source, stats, severity }) => {
    return [
      `${source}: severity=${severity.toFixed(2)}`,
      `jobs=${stats.total}`,
      `missingDescription=${stats.missingDescription}(${toPct(stats.missingDescription, stats.total)}%)`,
      `missingCompany=${stats.missingCompany}(${toPct(stats.missingCompany, stats.total)}%)`,
      `missingSourceUrl=${stats.missingSourceUrl}(${toPct(stats.missingSourceUrl, stats.total)}%)`,
      `unknownLocation=${stats.unknownLocation}(${toPct(stats.unknownLocation, stats.total)}%)`,
    ].join(' | ');
  });

  console.warn('[ScrapeQuality] Source severity ranking (highest first):\n- ' + severityLines.join('\n- '));

  const topMissingDescription = Array.from(sourceStats.entries())
    .map(([source, stats]) => ({ source, stats }))
    .filter(({ stats }) => stats.missingDescription > 0)
    .sort((a, b) => {
      if (b.stats.missingDescription !== a.stats.missingDescription) {
        return b.stats.missingDescription - a.stats.missingDescription;
      }
      return (b.stats.missingDescription / Math.max(1, b.stats.total)) - (a.stats.missingDescription / Math.max(1, a.stats.total));
    })
    .slice(0, 15)
    .map(({ source, stats }) =>
      `${source}: missingDescription=${stats.missingDescription}/${stats.total} (${toPct(stats.missingDescription, stats.total)}%)`,
    );

  if (topMissingDescription.length > 0) {
    console.warn('[ScrapeQuality] Top sources by missing description:\n- ' + topMissingDescription.join('\n- '));
  }
}
