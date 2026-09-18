export type CacheResourceKind = 'cache' | 'database';

export type HybridCacheFlowEvent =
	| 'db-read-hit'
	| 'db-read-miss'
	| 'legacy-read-hit'
	| 'db-hydrate-write'
	| 'db-direct-write';

export interface CachePathHybridFlowStat {
	dbReadHits: number;
	dbReadMisses: number;
	legacyReadHits: number;
	dbHydrateWrites: number;
	dbDirectWrites: number;
}

export interface CachePathIoDebugStat {
	path: string;
	label: string;
	kind: CacheResourceKind;
	backend: string;
	dbSourceFile: string;
	readOps: number;
	readHits: number;
	readMisses: number;
	writeOps: number;
	hybridFlow: CachePathHybridFlowStat;
}

export interface CacheIoDebugSummary {
	totalReadOps: number;
	totalWriteOps: number;
	totalCacheReadOps: number;
	totalDatabaseReadOps: number;
	rows: CachePathIoDebugStat[];
}

const cacheIoStats = new Map<string, CachePathIoDebugStat>();

function normalizePath(inputPath: string): string {
	return String(inputPath ?? '').trim();
}

function inferKind(path: string): CacheResourceKind {
	const normalized = normalizePath(path).toLowerCase();
	if (normalized.endsWith('.json') || normalized.includes('*.json')) {
		return 'cache';
	}
	return 'database';
}

function inferBackend(path: string, kind: CacheResourceKind): string {
	const normalized = normalizePath(path).toLowerCase();
	if (kind === 'database') {
		if (normalized.endsWith('.sqlite') || normalized.endsWith('.db')) {
			return 'sqlite';
		}
		return 'database';
	}

	if (normalized.endsWith('.json') || normalized.includes('*.json')) {
		return 'json';
	}
	return 'cache';
}

function deriveLabel(path: string): string {
	const normalized = normalizePath(path);
	if (!normalized) {
		return '(unknown)';
	}

	const slashNormalized = normalized.replace(/\\/g, '/');
	const cacheIndex = slashNormalized.lastIndexOf('/cache/');
	if (cacheIndex >= 0) {
		return slashNormalized.slice(cacheIndex + '/cache/'.length);
	}

	const parts = slashNormalized.split('/').filter(Boolean);
	return parts.length > 0 ? parts[parts.length - 1] : normalized;
}

function createStat(path: string, kind?: CacheResourceKind, backend?: string, dbSourceFile = ''): CachePathIoDebugStat {
	const normalizedPath = normalizePath(path);
	const resolvedKind = kind ?? inferKind(normalizedPath);
	return {
		path: normalizedPath,
		label: deriveLabel(normalizedPath),
		kind: resolvedKind,
		backend: String(backend ?? inferBackend(normalizedPath, resolvedKind)),
		dbSourceFile: String(dbSourceFile ?? ''),
		readOps: 0,
		readHits: 0,
		readMisses: 0,
		writeOps: 0,
		hybridFlow: {
			dbReadHits: 0,
			dbReadMisses: 0,
			legacyReadHits: 0,
			dbHydrateWrites: 0,
			dbDirectWrites: 0,
		},
	};
}

function getOrCreateStat(path: string): CachePathIoDebugStat {
	const normalizedPath = normalizePath(path);
	const existing = cacheIoStats.get(normalizedPath);
	if (existing) {
		return existing;
	}

	const created = createStat(normalizedPath);
	cacheIoStats.set(normalizedPath, created);
	return created;
}

export function registerCachePath(path: string, backend = 'json'): void {
	const normalizedPath = normalizePath(path);
	const existing = cacheIoStats.get(normalizedPath);
	if (existing) {
		existing.kind = 'cache';
		existing.backend = String(backend || existing.backend || 'json');
		existing.label = deriveLabel(normalizedPath);
		return;
	}

	cacheIoStats.set(normalizedPath, createStat(normalizedPath, 'cache', backend));
}

export function registerDatabasePath(path: string, backend = 'sqlite', dbSourceFile = ''): void {
	const normalizedPath = normalizePath(path);
	const existing = cacheIoStats.get(normalizedPath);
	if (existing) {
		existing.kind = 'database';
		existing.backend = String(backend || existing.backend || 'sqlite');
		existing.dbSourceFile = String(dbSourceFile ?? existing.dbSourceFile ?? '');
		existing.label = deriveLabel(normalizedPath);
		return;
	}

	cacheIoStats.set(normalizedPath, createStat(normalizedPath, 'database', backend, dbSourceFile));
}

export function recordCacheRead(path: string, hit: boolean): void {
	const stat = getOrCreateStat(path);
	stat.readOps += 1;
	if (hit) {
		stat.readHits += 1;
	} else {
		stat.readMisses += 1;
	}
}

export function recordDatabaseRead(path: string, hit: boolean): void {
	const stat = getOrCreateStat(path);
	stat.readOps += 1;
	if (hit) {
		stat.readHits += 1;
	} else {
		stat.readMisses += 1;
	}
}

export function recordCacheWrite(path: string): void {
	const stat = getOrCreateStat(path);
	stat.writeOps += 1;
}

export function recordDatabaseWrite(path: string): void {
	const stat = getOrCreateStat(path);
	stat.writeOps += 1;
}

export function recordHybridCacheFlow(path: string, event: HybridCacheFlowEvent): void {
	const stat = getOrCreateStat(path);
	switch (event) {
		case 'db-read-hit':
			stat.hybridFlow.dbReadHits += 1;
			break;
		case 'db-read-miss':
			stat.hybridFlow.dbReadMisses += 1;
			break;
		case 'legacy-read-hit':
			stat.hybridFlow.legacyReadHits += 1;
			break;
		case 'db-hydrate-write':
			stat.hybridFlow.dbHydrateWrites += 1;
			break;
		case 'db-direct-write':
			stat.hybridFlow.dbDirectWrites += 1;
			break;
	}
}

export function resetCacheIoDebugTelemetry(): void {
	for (const stat of cacheIoStats.values()) {
		stat.readOps = 0;
		stat.readHits = 0;
		stat.readMisses = 0;
		stat.writeOps = 0;
		stat.hybridFlow.dbReadHits = 0;
		stat.hybridFlow.dbReadMisses = 0;
		stat.hybridFlow.legacyReadHits = 0;
		stat.hybridFlow.dbHydrateWrites = 0;
		stat.hybridFlow.dbDirectWrites = 0;
	}
}

export function getCacheIoDebugSummary(): CacheIoDebugSummary {
	let totalReadOps = 0;
	let totalWriteOps = 0;
	let totalCacheReadOps = 0;
	let totalDatabaseReadOps = 0;

	const rows = Array.from(cacheIoStats.values()).map((row) => ({
		...row,
		hybridFlow: { ...row.hybridFlow },
	}));

	for (const row of rows) {
		totalReadOps += row.readOps;
		totalWriteOps += row.writeOps;
		if (row.kind === 'cache') {
			totalCacheReadOps += row.readOps;
		}
		if (row.kind === 'database') {
			totalDatabaseReadOps += row.readOps;
		}
	}

	rows.sort((a, b) => {
		if (a.kind !== b.kind) {
			return a.kind === 'database' ? -1 : 1;
		}
		return a.label.localeCompare(b.label);
	});

	return {
		totalReadOps,
		totalWriteOps,
		totalCacheReadOps,
		totalDatabaseReadOps,
		rows,
	};
}
