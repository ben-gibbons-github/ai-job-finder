import * as path from 'path';
import { fileURLToPath } from 'url';
import { CacheHandler } from '../utils/CacheHandler.js';
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.resolve(moduleDir, '../../cache/impactcache.json');
const cacheHandler = new CacheHandler(CACHE_FILE);
class SearchImpactAICache {
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
    getCachedImpact(job) {
        const key = this.getJobKey(job);
        return this.cache.get(key) ?? null;
    }
    setCachedImpact(job, result) {
        const key = this.getJobKey(job);
        this.cache.set(key, {
            impactScore: result.impactScore,
            impactSummary: result.impactSummary,
            timestamp: Date.now(),
        });
        this.saveToFile();
    }
    deleteCachedImpact(job) {
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
            console.log(`[SearchImpactAICache] Loaded ${this.cache.size} cached impact entries from ${CACHE_FILE}`);
        }
        catch (error) {
            console.warn(`[SearchImpactAICache] Failed to load cache from ${CACHE_FILE}:`, error);
            this.cache = new Map();
        }
    }
    saveToFile() {
        setImmediate(() => {
            const obj = Object.fromEntries(this.cache);
            const payload = JSON.stringify(obj);
            cacheHandler.save(payload).catch((error) => {
                console.error(`[SearchImpactAICache] Failed to save cache to ${CACHE_FILE}:`, error);
            });
        });
    }
}
export default new SearchImpactAICache();
