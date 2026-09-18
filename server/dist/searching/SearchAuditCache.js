import * as path from 'path';
import { fileURLToPath } from 'url';
import { CacheHandler } from '../utils/CacheHandler.js';
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.resolve(moduleDir, '../../cache/auditcache.json');
const cacheHandler = new CacheHandler(CACHE_FILE);
class SearchAuditCache {
    cache = new Map();
    constructor() {
        this.loadFromFile();
    }
    normalizeJobKeyPart(value) {
        return String(value ?? '').trim().toLowerCase();
    }
    getJobKey(job) {
        const sourceUrl = job.source_url?.trim();
        const company = this.normalizeJobKeyPart(job.company_name);
        const title = this.normalizeJobKeyPart(job.name);
        const location = this.normalizeJobKeyPart(job.location);
        if (sourceUrl) {
            return `${sourceUrl}::${company}::${title}::${location}`;
        }
        return `${title}::${company}::${location}`;
    }
    getCachedAudit(job) {
        const key = this.getJobKey(job);
        const cached = this.cache.get(key);
        if (cached) {
            return {
                auditScore: cached.auditScore,
                auditText: cached.auditText,
            };
        }
        return null;
    }
    setCachedAudit(job, result) {
        const key = this.getJobKey(job);
        this.cache.set(key, {
            auditScore: result.auditScore,
            auditText: result.auditText,
            timestamp: Date.now(),
        });
        this.saveToFile();
    }
    deleteCachedAudit(job) {
        const key = this.getJobKey(job);
        if (this.cache.delete(key)) {
            this.saveToFile();
        }
    }
    loadFromFile() {
        try {
            const parsed = cacheHandler.loadWithFallbackSync((raw) => {
                const value = JSON.parse(raw);
                if (!value || typeof value !== 'object' || Array.isArray(value)) {
                    throw new Error('Cache payload is not a valid object');
                }
                return value;
            });
            this.cache = new Map(Object.entries(parsed));
            console.log(`[SearchAuditCache] Loaded ${this.cache.size} cached audits from ${CACHE_FILE}`);
        }
        catch (error) {
            console.warn(`[SearchAuditCache] Failed to load cache from ${CACHE_FILE}:`, error);
            this.cache = new Map();
        }
    }
    saveToFile() {
        setImmediate(() => {
            const obj = Object.fromEntries(this.cache);
            const payload = JSON.stringify(obj);
            cacheHandler.save(payload).catch((error) => {
                console.error(`[SearchAuditCache] Failed to save cache to ${CACHE_FILE}:`, error);
            });
        });
    }
}
export default new SearchAuditCache();
