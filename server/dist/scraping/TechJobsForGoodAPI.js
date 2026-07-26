import { normalizeJobsWithCoordinates } from './PortalIngestionUtils.js';
import { collectPaginatedHtmlJobs, stripHtmlTags } from './PaginatedHtmlScrapeUtils.js';
const TECH_JOBS_FOR_GOOD_URL = 'https://www.techjobsforgood.com/jobs/';
const MAX_TECH_JOBS_FOR_GOOD_PAGES = 200;
function pageUrl(page) {
    const url = new URL(TECH_JOBS_FOR_GOOD_URL);
    if (page > 1) {
        url.searchParams.set('page', String(page));
    }
    return url.toString();
}
function parseTechJobsForGood(html) {
    const jobs = [];
    const cardPattern = /<div class="ui raised fluid card job-card"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/gi;
    for (const cardHtml of html.match(cardPattern) || []) {
        const hrefMatch = cardHtml.match(/<a class="content" href="((?:https:\/\/www\.techjobsforgood\.com)?\/jobs\/[0-9]+\/?(?:\?[^"\s]*)?)"/i);
        const rawUrl = (hrefMatch?.[1] || '').trim();
        const sourceUrl = rawUrl.startsWith('http') ? rawUrl : `https://www.techjobsforgood.com${rawUrl}`;
        const titleMatch = cardHtml.match(/<div class="header job-title"[^>]*title="([^"]+)"/i)
            || cardHtml.match(/<div class="header job-title"[^>]*>([\s\S]*?)<\/div>/i);
        const title = stripHtmlTags(titleMatch?.[1] || '');
        const companyMatch = cardHtml.match(/<div class="meta company-name"[^>]*title="([^"]+)"/i)
            || cardHtml.match(/<span class="company_name"[^>]*>([\s\S]*?)<\/span>/i);
        const company = stripHtmlTags(companyMatch?.[1] || '') || 'Unknown Company';
        const locationMatch = cardHtml.match(/<span class="location"[^>]*title="([^"]+)"/i)
            || cardHtml.match(/<span class="location"[^>]*>([\s\S]*?)<\/span>/i);
        const location = stripHtmlTags(locationMatch?.[1] || '') || 'Unknown';
        const descriptionMatch = cardHtml.match(/<div class="content job-snippet"[^>]*>([\s\S]*?)<\/div>/i);
        const description = stripHtmlTags(descriptionMatch?.[1] || '');
        if (!sourceUrl || !title) {
            continue;
        }
        jobs.push({
            title,
            company,
            location,
            remote: /\bremote\b/i.test(`${location} ${description}`) ? 'Remote' : 'Unknown',
            type: 'Unknown',
            sourceUrl,
            description,
            tags: ['TechJobsForGood', 'Mission Driven', 'Tech'],
        });
    }
    return jobs;
}
export async function fetchAllTechJobsForGoodJobs() {
    try {
        const normalized = await collectPaginatedHtmlJobs({
            sourceName: 'TechJobsForGood',
            maxPages: MAX_TECH_JOBS_FOR_GOOD_PAGES,
            pageUrl,
            parseJobs: (html) => parseTechJobsForGood(html),
            hasNextPage: (html, page) => /\bnext\b/i.test(html) || new RegExp(`\\b${page + 1}\\b`).test(html),
        });
        return normalizeJobsWithCoordinates('TechJobsForGood', normalized);
    }
    catch (error) {
        console.warn('[TechJobsForGoodAPI] Failed to fetch jobs:', String(error));
        return [];
    }
}
