import 'dotenv/config';
import { existsSync } from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import SearchMain from './searching/searchMain/SearchMain.js';
import { Top100Search } from './searching/Top100Search.js';
import { computeServerDebugCoverageStats, summarizeJobCorpus, withLiveCacheIoSummary } from './utils/debugStats/DebugStats.js';
import { startMemoryHeartbeat } from './server/MemoryHeartbeat.js';
import { registerGracefulShutdownHandlers } from './server/GracefulShutdown.js';
import { runStartupLogic } from './server/StartupLogic.js';
import { registerSearchApi } from './server/api/searchApi.js';
import { registerIOModule } from './server/iomodule/IOModule.js';
import { onBackgroundGeocodeComplete } from './utils/BackgroundGeocode.js';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const SEARCH_DEBUG_ENABLED = process.env.SEARCH_DEBUG_ENABLED === 'true';
const AUDIT_ENABLED = process.env.AUDIT_ENABLED === 'true';
const HAYSTACK_WARMUP_ENABLED = process.env.HAYSTACK_WARMUP_ENABLED === 'true';
const SHUTDOWN_TIMEOUT_MS = Math.max(1000, Number(process.env.SHUTDOWN_TIMEOUT_MS ?? 10000));
const MEMORY_HEARTBEAT_MS = 5000;
// Global job list
let JOBS = [];
let SCRAPE_LOAD_DEBUG_STATS = null;
let DEBUG_COVERAGE_STATS = null;
const searchMain = new SearchMain();
const top100Search = new Top100Search(searchMain);
function recomputeDebugCoverageStats() {
    if (!SEARCH_DEBUG_ENABLED || SCRAPE_LOAD_DEBUG_STATS === null || JOBS.length === 0) {
        return null;
    }
    return computeServerDebugCoverageStats(JOBS, SCRAPE_LOAD_DEBUG_STATS);
}
// ─── Tag cloud ───────────────────────────────────────────────────────────────
let cachedTagCloud = [];
setImmediate(() => {
    void (async () => {
        try {
            const startup = await runStartupLogic({
                searchMain,
                top100Search,
                searchDebugEnabled: SEARCH_DEBUG_ENABLED,
                haystackWarmupEnabled: HAYSTACK_WARMUP_ENABLED,
                onScrapeProgress: ({ jobs, scrapeLoadDebugStats }) => {
                    JOBS = jobs;
                    SCRAPE_LOAD_DEBUG_STATS = scrapeLoadDebugStats;
                    const corpusSummary = summarizeJobCorpus(jobs);
                    const debugCoverage = SEARCH_DEBUG_ENABLED
                        ? computeServerDebugCoverageStats(jobs, scrapeLoadDebugStats)
                        : undefined;
                    if (debugCoverage) {
                        DEBUG_COVERAGE_STATS = debugCoverage;
                    }
                    io.emit('server:config', {
                        ...corpusSummary,
                        searchDebugEnabled: SEARCH_DEBUG_ENABLED,
                        ...(debugCoverage ? { debugCoverage: withLiveCacheIoSummary(debugCoverage) } : {}),
                    });
                },
            });
            JOBS = startup.jobs;
            SCRAPE_LOAD_DEBUG_STATS = startup.scrapeLoadDebugStats;
            DEBUG_COVERAGE_STATS = startup.debugCoverageStats ?? recomputeDebugCoverageStats();
            cachedTagCloud = startup.cachedTagCloud;
        }
        catch (err) {
            console.error('Failed to scrape jobs on startup:', err);
        }
    })();
});
const PORT = Number(process.env.PORT) || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:3010';
const CLIENT_DIST_DIR = process.env.CLIENT_DIST_DIR || path.resolve(process.cwd(), '../client/dist');
const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json({ limit: '1mb' }));
app.get('/api/hello', (_req, res) => {
    res.json({ ok: true });
});
registerSearchApi({
    app,
    searchMain,
    getJobs: () => JOBS,
    searchDebugEnabled: SEARCH_DEBUG_ENABLED,
});
if (existsSync(CLIENT_DIST_DIR)) {
    app.use(express.static(CLIENT_DIST_DIR));
    app.get(/^(?!\/api|\/socket\.io).*/, (_req, res) => {
        res.sendFile(path.join(CLIENT_DIST_DIR, 'index.html'));
    });
}
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: CLIENT_ORIGIN,
    },
});
onBackgroundGeocodeComplete(() => {
    const liveCoverage = recomputeDebugCoverageStats();
    if (!liveCoverage) {
        return;
    }
    DEBUG_COVERAGE_STATS = liveCoverage;
    io.emit('server:debugCoverage', withLiveCacheIoSummary(liveCoverage));
    console.log(`[DebugCoverage] Refreshed after background geocode: geocoded=${liveCoverage.geocodedCount}/${JOBS.length} (${liveCoverage.geocodedPct}%)`);
});
registerIOModule({
    io,
    searchMain,
    top100Search,
    getJobs: () => JOBS,
    getScrapeLoadDebugStats: () => SCRAPE_LOAD_DEBUG_STATS,
    getDebugCoverageStats: () => recomputeDebugCoverageStats() ?? DEBUG_COVERAGE_STATS,
    getCachedTagCloud: () => cachedTagCloud,
    searchDebugEnabled: SEARCH_DEBUG_ENABLED,
    auditEnabled: AUDIT_ENABLED,
    isProduction: IS_PRODUCTION,
});
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
const memoryHeartbeat = startMemoryHeartbeat(() => JOBS, MEMORY_HEARTBEAT_MS);
registerGracefulShutdownHandlers({
    io,
    httpServer,
    memoryHeartbeat,
    shutdownTimeoutMs: SHUTDOWN_TIMEOUT_MS,
});
