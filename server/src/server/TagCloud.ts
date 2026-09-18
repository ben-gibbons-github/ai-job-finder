import type { ScrapedJob } from '../scraping/core/ScrapedJob.js'

export interface TagCloudEntry {
  word: string
  count: number
}

const TAG_CLOUD_STOP_WORDS = new Set([
  'the','a','an','and','or','in','to','of','for','with','as','is','are','was',
  'were','be','been','being','you','your','our','we','us','their','they','it',
  'its','this','that','these','those','will','can','may','must','should',
  'would','could','have','has','had','do','does','did','not','no','by','at',
  'on','up','out','if','so','all','also','any','new','one','two','more','other',
  'work','working','job','role','position','team','company','opportunity',
  'years','experience','ability','skills','strong','including','related',
  'within','across','provide','ensure','support','manage','develop','build',
  'using','from','into','about','such','well','both','each','than','then',
  'when','where','which','who','how','what','their','them','through','over',
  'under','between','during','while','after','before','based','required',
  'looking','join','help','make','take','use','get','set','go','per','etc',
  // scraper fallback values
  'unknown','none','na',
  // html entity artifacts
  'nbsp','amp','quot','apos','lt','gt','ndash','mdash','lsquo','rsquo',
])

export function buildTagCloud(jobs: ScrapedJob[], topN = 150): TagCloudEntry[] {
  const counts = new Map<string, number>()

  for (const job of jobs) {
    const rawText = `${job.name ?? ''} ${job.description ?? ''} ${job.type ?? ''}`
    // Strip HTML tags and decode/discard HTML entities before tokenizing
    const text = rawText
      .replace(/<[^>]*>/g, ' ')
      .replace(/&[a-z#][a-z0-9]{0,6};/gi, ' ')
    const tokens = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)

    for (const token of tokens) {
      if (token.length < 3 || token.length > 24) continue
      if (TAG_CLOUD_STOP_WORDS.has(token)) continue
      if (/^\d+$/.test(token)) continue
      counts.set(token, (counts.get(token) ?? 0) + 1)
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([word, count]) => ({ word, count }))
}
