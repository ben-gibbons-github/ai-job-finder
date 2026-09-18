import { getCacheDb } from './connection.js'

function toMs(value: number | undefined, fallback = Date.now()): number {
	return Math.round(Number.isFinite(value) ? Number(value) : fallback);
}

export interface LlmAnswerCacheRow {
	question: string;
	promptVersion: string;
	answer: string;
	updatedAtMs: number;
}

export interface JobAuditCacheRow {
	jobKey: string;
	auditScore: number;
	auditText: string;
	updatedAtMs: number;
}

export interface JobImpactCacheRow {
	jobKey: string;
	impactScore: number;
	impactSummary: string;
	updatedAtMs: number;
}

export interface JobQolCacheRow {
	jobKey: string;
	employeeQolScore: number;
	employeeQolSummary: string;
	updatedAtMs: number;
}

export interface LocationSearchCacheRow {
	queryKey: string;
	resultIndex: number;
	value: string;
	label: string;
	country: string;
	state: string;
	displayLabel: string;
	lat: number;
	lng: number;
	updatedAtMs: number;
}

export interface LocationLatLonCacheRow {
	locationKey: string;
	lat: number;
	lon: number;
	isHardcoded: boolean;
	updatedAtMs: number;
}

export interface ScrapedEmployerCacheRow {
	employerKey: string;
	name: string;
	aiSummary: string;
	aiRedFlagSummary: string;
	aiScore: number;
	aiRedFlagScore: number;
	aiImpactSummary: string;
	aiImpactScore: number;
	employeeQolScore: number;
	employeeQolSummary: string;
	locationFallback: string;
	promptVersion: string;
	aiPrompt: string;
	updatedAtMs: number;
}

export interface ScraperHttpCacheRow {
	cacheKey: string;
	url: string;
	method: string;
	status: number;
	statusText: string;
	headersJson: string;
	bodyText: string;
	cachedAtMs: number;
	expiresAtMs: number;
	networkError: boolean;
	errorMessage: string;
}

export interface CacheRefreshRequestRow {
	componentName: string;
	updatedAtMs: number;
}

export function readAllLlmAnswers(): LlmAnswerCacheRow[] {
	const db = getCacheDb();
	const rows = db.prepare('SELECT question, prompt_version, answer, updated_at_ms FROM llm_answer_cache').all() as Array<{
		question: string;
		prompt_version: string;
		answer: string;
		updated_at_ms: number;
	}>;
	return rows.map((row) => ({
		question: String(row.question ?? ''),
		promptVersion: String(row.prompt_version ?? ''),
		answer: String(row.answer ?? ''),
		updatedAtMs: Number(row.updated_at_ms ?? 0),
	}));
}

export function upsertLlmAnswer(row: Omit<LlmAnswerCacheRow, 'updatedAtMs'> & { updatedAtMs?: number }): void {
	const db = getCacheDb();
	db.prepare(`
		INSERT INTO llm_answer_cache(question, prompt_version, answer, updated_at_ms)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(question, prompt_version)
		DO UPDATE SET
			answer = excluded.answer,
			updated_at_ms = excluded.updated_at_ms
		WHERE
			llm_answer_cache.answer IS NOT excluded.answer
			OR llm_answer_cache.updated_at_ms IS NOT excluded.updated_at_ms
	`).run(String(row.question ?? '').trim(), String(row.promptVersion ?? '').trim(), String(row.answer ?? ''), toMs(row.updatedAtMs));
}

export function readAllJobAuditCacheRows(): JobAuditCacheRow[] {
	const db = getCacheDb();
	const rows = db.prepare('SELECT job_key, audit_score, audit_text, updated_at_ms FROM job_audit_cache').all() as Array<{
		job_key: string;
		audit_score: number;
		audit_text: string;
		updated_at_ms: number;
	}>;
	return rows.map((row) => ({
		jobKey: String(row.job_key ?? ''),
		auditScore: Number(row.audit_score ?? 0),
		auditText: String(row.audit_text ?? ''),
		updatedAtMs: Number(row.updated_at_ms ?? 0),
	}));
}

export function upsertJobAuditCacheRow(row: Omit<JobAuditCacheRow, 'updatedAtMs'> & { updatedAtMs?: number }): void {
	const db = getCacheDb();
	db.prepare(`
		INSERT INTO job_audit_cache(job_key, audit_score, audit_text, updated_at_ms)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(job_key)
		DO UPDATE SET
			audit_score = excluded.audit_score,
			audit_text = excluded.audit_text,
			updated_at_ms = excluded.updated_at_ms
		WHERE
			job_audit_cache.audit_score IS NOT excluded.audit_score
			OR job_audit_cache.audit_text IS NOT excluded.audit_text
			OR job_audit_cache.updated_at_ms IS NOT excluded.updated_at_ms
	`).run(String(row.jobKey ?? '').trim(), Number(row.auditScore ?? 0), String(row.auditText ?? ''), toMs(row.updatedAtMs));
}

export function deleteJobAuditCacheRow(jobKey: string): void {
	const db = getCacheDb();
	db.prepare('DELETE FROM job_audit_cache WHERE job_key = ?').run(String(jobKey ?? '').trim());
}

export function readAllJobImpactCacheRows(): JobImpactCacheRow[] {
	const db = getCacheDb();
	const rows = db.prepare('SELECT job_key, impact_score, impact_summary, updated_at_ms FROM job_impact_cache').all() as Array<{
		job_key: string;
		impact_score: number;
		impact_summary: string;
		updated_at_ms: number;
	}>;
	return rows.map((row) => ({
		jobKey: String(row.job_key ?? ''),
		impactScore: Number(row.impact_score ?? 0),
		impactSummary: String(row.impact_summary ?? ''),
		updatedAtMs: Number(row.updated_at_ms ?? 0),
	}));
}

export function upsertJobImpactCacheRow(row: Omit<JobImpactCacheRow, 'updatedAtMs'> & { updatedAtMs?: number }): void {
	const db = getCacheDb();
	db.prepare(`
		INSERT INTO job_impact_cache(job_key, impact_score, impact_summary, updated_at_ms)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(job_key)
		DO UPDATE SET
			impact_score = excluded.impact_score,
			impact_summary = excluded.impact_summary,
			updated_at_ms = excluded.updated_at_ms
		WHERE
			job_impact_cache.impact_score IS NOT excluded.impact_score
			OR job_impact_cache.impact_summary IS NOT excluded.impact_summary
			OR job_impact_cache.updated_at_ms IS NOT excluded.updated_at_ms
	`).run(String(row.jobKey ?? '').trim(), Number(row.impactScore ?? 0), String(row.impactSummary ?? ''), toMs(row.updatedAtMs));
}

export function deleteJobImpactCacheRow(jobKey: string): void {
	const db = getCacheDb();
	db.prepare('DELETE FROM job_impact_cache WHERE job_key = ?').run(String(jobKey ?? '').trim());
}

export function readAllJobQolCacheRows(): JobQolCacheRow[] {
	const db = getCacheDb();
	const rows = db.prepare('SELECT job_key, employee_qol_score, employee_qol_summary, updated_at_ms FROM job_qol_cache').all() as Array<{
		job_key: string;
		employee_qol_score: number;
		employee_qol_summary: string;
		updated_at_ms: number;
	}>;
	return rows.map((row) => ({
		jobKey: String(row.job_key ?? ''),
		employeeQolScore: Number(row.employee_qol_score ?? 0),
		employeeQolSummary: String(row.employee_qol_summary ?? ''),
		updatedAtMs: Number(row.updated_at_ms ?? 0),
	}));
}

export function upsertJobQolCacheRow(row: Omit<JobQolCacheRow, 'updatedAtMs'> & { updatedAtMs?: number }): void {
	const db = getCacheDb();
	db.prepare(`
		INSERT INTO job_qol_cache(job_key, employee_qol_score, employee_qol_summary, updated_at_ms)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(job_key)
		DO UPDATE SET
			employee_qol_score = excluded.employee_qol_score,
			employee_qol_summary = excluded.employee_qol_summary,
			updated_at_ms = excluded.updated_at_ms
		WHERE
			job_qol_cache.employee_qol_score IS NOT excluded.employee_qol_score
			OR job_qol_cache.employee_qol_summary IS NOT excluded.employee_qol_summary
			OR job_qol_cache.updated_at_ms IS NOT excluded.updated_at_ms
	`).run(String(row.jobKey ?? '').trim(), Number(row.employeeQolScore ?? 0), String(row.employeeQolSummary ?? ''), toMs(row.updatedAtMs));
}

export function deleteJobQolCacheRow(jobKey: string): void {
	const db = getCacheDb();
	db.prepare('DELETE FROM job_qol_cache WHERE job_key = ?').run(String(jobKey ?? '').trim());
}

export function readAllLocationSearchCacheRows(): LocationSearchCacheRow[] {
	const db = getCacheDb();
	const rows = db.prepare(`
		SELECT query_key, result_index, value, label, country, state, display_label, lat, lng, updated_at_ms
		FROM location_search_cache
		ORDER BY query_key ASC, result_index ASC
	`).all() as Array<{
		query_key: string;
		result_index: number;
		value: string;
		label: string;
		country: string | null;
		state: string | null;
		display_label: string;
		lat: number;
		lng: number;
		updated_at_ms: number;
	}>;
	return rows.map((row) => ({
		queryKey: String(row.query_key ?? ''),
		resultIndex: Number(row.result_index ?? 0),
		value: String(row.value ?? ''),
		label: String(row.label ?? ''),
		country: String(row.country ?? ''),
		state: String(row.state ?? ''),
		displayLabel: String(row.display_label ?? ''),
		lat: Number(row.lat ?? 0),
		lng: Number(row.lng ?? 0),
		updatedAtMs: Number(row.updated_at_ms ?? 0),
	}));
}

export function replaceLocationSearchCacheRows(queryKey: string, rows: Array<Omit<LocationSearchCacheRow, 'queryKey' | 'updatedAtMs'> & { updatedAtMs?: number }>): void {
	const db = getCacheDb();
	const normalizedQuery = String(queryKey ?? '').trim();
	db.exec('BEGIN IMMEDIATE;');
	try {
		db.prepare('DELETE FROM location_search_cache WHERE query_key = ?').run(normalizedQuery);
		const insert = db.prepare(`
			INSERT INTO location_search_cache(
				query_key, result_index, value, label, country, state, display_label, lat, lng, updated_at_ms
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`);
		rows.forEach((row, index) => {
			insert.run(
				normalizedQuery,
				Number.isFinite(row.resultIndex) ? Number(row.resultIndex) : index,
				String(row.value ?? ''),
				String(row.label ?? ''),
				String(row.country ?? ''),
				String(row.state ?? ''),
				String(row.displayLabel ?? ''),
				Number(row.lat ?? 0),
				Number(row.lng ?? 0),
				toMs(row.updatedAtMs),
			);
		});
		db.exec('COMMIT;');
	} catch (error) {
		db.exec('ROLLBACK;');
		throw error;
	}
}

export function readAllLocationLatLonCacheRows(): LocationLatLonCacheRow[] {
	const db = getCacheDb();
	const rows = db.prepare('SELECT location_key, lat, lon, is_hardcoded, updated_at_ms FROM location_latlon_cache').all() as Array<{
		location_key: string;
		lat: number;
		lon: number;
		is_hardcoded: number;
		updated_at_ms: number;
	}>;
	return rows.map((row) => ({
		locationKey: String(row.location_key ?? ''),
		lat: Number(row.lat ?? 0),
		lon: Number(row.lon ?? 0),
		isHardcoded: Number(row.is_hardcoded ?? 0) === 1,
		updatedAtMs: Number(row.updated_at_ms ?? 0),
	}));
}

export function upsertLocationLatLonCacheRow(row: Omit<LocationLatLonCacheRow, 'updatedAtMs'> & { updatedAtMs?: number }): void {
	const db = getCacheDb();
	db.prepare(`
		INSERT INTO location_latlon_cache(location_key, lat, lon, is_hardcoded, updated_at_ms)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(location_key)
		DO UPDATE SET
			lat = excluded.lat,
			lon = excluded.lon,
			is_hardcoded = excluded.is_hardcoded,
			updated_at_ms = excluded.updated_at_ms
		WHERE
			location_latlon_cache.lat IS NOT excluded.lat
			OR location_latlon_cache.lon IS NOT excluded.lon
			OR location_latlon_cache.is_hardcoded IS NOT excluded.is_hardcoded
			OR location_latlon_cache.updated_at_ms IS NOT excluded.updated_at_ms
	`).run(
		String(row.locationKey ?? '').trim(),
		Number(row.lat ?? 0),
		Number(row.lon ?? 0),
		row.isHardcoded ? 1 : 0,
		toMs(row.updatedAtMs),
	);
}

export function deleteLocationLatLonCacheRow(locationKey: string): void {
	const db = getCacheDb();
	db.prepare('DELETE FROM location_latlon_cache WHERE location_key = ?').run(String(locationKey ?? '').trim());
}

export function readAllScrapedEmployerCacheRows(): ScrapedEmployerCacheRow[] {
	const db = getCacheDb();
	const rows = db.prepare(`
		SELECT
			employer_key,
			name,
			ai_summary,
			ai_red_flag_summary,
			ai_score,
			ai_red_flag_score,
			ai_impact_summary,
			ai_impact_score,
			employee_qol_score,
			employee_qol_summary,
			location_fallback,
			prompt_version,
			ai_prompt,
			updated_at_ms
		FROM scraped_employer_cache
	`).all() as Array<Record<string, unknown>>;
	return rows.map((row) => ({
		employerKey: String(row.employer_key ?? ''),
		name: String(row.name ?? ''),
		aiSummary: String(row.ai_summary ?? ''),
		aiRedFlagSummary: String(row.ai_red_flag_summary ?? ''),
		aiScore: Number(row.ai_score ?? 0),
		aiRedFlagScore: Number(row.ai_red_flag_score ?? 0),
		aiImpactSummary: String(row.ai_impact_summary ?? ''),
		aiImpactScore: Number(row.ai_impact_score ?? 0),
		employeeQolScore: Number(row.employee_qol_score ?? 0),
		employeeQolSummary: String(row.employee_qol_summary ?? ''),
		locationFallback: String(row.location_fallback ?? ''),
		promptVersion: String(row.prompt_version ?? ''),
		aiPrompt: String(row.ai_prompt ?? ''),
		updatedAtMs: Number(row.updated_at_ms ?? 0),
	}));
}

export function upsertScrapedEmployerCacheRow(row: Omit<ScrapedEmployerCacheRow, 'updatedAtMs'> & { updatedAtMs?: number }): void {
	const db = getCacheDb();
	db.prepare(`
		INSERT INTO scraped_employer_cache(
			employer_key,
			name,
			ai_summary,
			ai_red_flag_summary,
			ai_score,
			ai_red_flag_score,
			ai_impact_summary,
			ai_impact_score,
			employee_qol_score,
			employee_qol_summary,
			location_fallback,
			prompt_version,
			ai_prompt,
			updated_at_ms
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(employer_key)
		DO UPDATE SET
			name = excluded.name,
			ai_summary = excluded.ai_summary,
			ai_red_flag_summary = excluded.ai_red_flag_summary,
			ai_score = excluded.ai_score,
			ai_red_flag_score = excluded.ai_red_flag_score,
			ai_impact_summary = excluded.ai_impact_summary,
			ai_impact_score = excluded.ai_impact_score,
			employee_qol_score = excluded.employee_qol_score,
			employee_qol_summary = excluded.employee_qol_summary,
			location_fallback = excluded.location_fallback,
			prompt_version = excluded.prompt_version,
			ai_prompt = excluded.ai_prompt,
			updated_at_ms = excluded.updated_at_ms
		WHERE
			scraped_employer_cache.name IS NOT excluded.name
			OR scraped_employer_cache.ai_summary IS NOT excluded.ai_summary
			OR scraped_employer_cache.ai_red_flag_summary IS NOT excluded.ai_red_flag_summary
			OR scraped_employer_cache.ai_score IS NOT excluded.ai_score
			OR scraped_employer_cache.ai_red_flag_score IS NOT excluded.ai_red_flag_score
			OR scraped_employer_cache.ai_impact_summary IS NOT excluded.ai_impact_summary
			OR scraped_employer_cache.ai_impact_score IS NOT excluded.ai_impact_score
			OR scraped_employer_cache.employee_qol_score IS NOT excluded.employee_qol_score
			OR scraped_employer_cache.employee_qol_summary IS NOT excluded.employee_qol_summary
			OR scraped_employer_cache.location_fallback IS NOT excluded.location_fallback
			OR scraped_employer_cache.prompt_version IS NOT excluded.prompt_version
			OR scraped_employer_cache.ai_prompt IS NOT excluded.ai_prompt
			OR scraped_employer_cache.updated_at_ms IS NOT excluded.updated_at_ms
	`).run(
		String(row.employerKey ?? '').trim(),
		String(row.name ?? ''),
		String(row.aiSummary ?? ''),
		String(row.aiRedFlagSummary ?? ''),
		Number(row.aiScore ?? 0),
		Number(row.aiRedFlagScore ?? 0),
		String(row.aiImpactSummary ?? ''),
		Number(row.aiImpactScore ?? 0),
		Number(row.employeeQolScore ?? 0),
		String(row.employeeQolSummary ?? ''),
		String(row.locationFallback ?? ''),
		String(row.promptVersion ?? ''),
		String(row.aiPrompt ?? ''),
		toMs(row.updatedAtMs),
	);
}

export function deleteScrapedEmployerCacheRow(employerKey: string): void {
	const db = getCacheDb();
	db.prepare('DELETE FROM scraped_employer_cache WHERE employer_key = ?').run(String(employerKey ?? '').trim());
}

export function readScraperHttpCacheRow(cacheKey: string): ScraperHttpCacheRow | null {
	const db = getCacheDb();
	const row = db.prepare(`
		SELECT cache_key, url, method, status, status_text, headers_json, body_text, cached_at_ms, expires_at_ms, network_error, error_message
		FROM scraper_http_cache
		WHERE cache_key = ?
	`).get(String(cacheKey ?? '').trim()) as Record<string, unknown> | undefined;

	if (!row) {
		return null;
	}

	return {
		cacheKey: String(row.cache_key ?? ''),
		url: String(row.url ?? ''),
		method: String(row.method ?? ''),
		status: Number(row.status ?? 0),
		statusText: String(row.status_text ?? ''),
		headersJson: String(row.headers_json ?? '{}'),
		bodyText: String(row.body_text ?? ''),
		cachedAtMs: Number(row.cached_at_ms ?? 0),
		expiresAtMs: Number(row.expires_at_ms ?? 0),
		networkError: Number(row.network_error ?? 0) === 1,
		errorMessage: String(row.error_message ?? ''),
	};
}

export function upsertScraperHttpCacheRow(row: ScraperHttpCacheRow): void {
	const db = getCacheDb();
	db.prepare(`
		INSERT INTO scraper_http_cache(
			cache_key, url, method, status, status_text, headers_json, body_text, cached_at_ms, expires_at_ms, network_error, error_message
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(cache_key)
		DO UPDATE SET
			url = excluded.url,
			method = excluded.method,
			status = excluded.status,
			status_text = excluded.status_text,
			headers_json = excluded.headers_json,
			body_text = excluded.body_text,
			cached_at_ms = excluded.cached_at_ms,
			expires_at_ms = excluded.expires_at_ms,
			network_error = excluded.network_error,
			error_message = excluded.error_message
		WHERE
			scraper_http_cache.url IS NOT excluded.url
			OR scraper_http_cache.method IS NOT excluded.method
			OR scraper_http_cache.status IS NOT excluded.status
			OR scraper_http_cache.status_text IS NOT excluded.status_text
			OR scraper_http_cache.headers_json IS NOT excluded.headers_json
			OR scraper_http_cache.body_text IS NOT excluded.body_text
			OR scraper_http_cache.cached_at_ms IS NOT excluded.cached_at_ms
			OR scraper_http_cache.expires_at_ms IS NOT excluded.expires_at_ms
			OR scraper_http_cache.network_error IS NOT excluded.network_error
			OR scraper_http_cache.error_message IS NOT excluded.error_message
	`).run(
		String(row.cacheKey ?? '').trim(),
		String(row.url ?? ''),
		String(row.method ?? ''),
		Math.round(Number(row.status ?? 0)),
		String(row.statusText ?? ''),
		String(row.headersJson ?? '{}'),
		String(row.bodyText ?? ''),
		toMs(row.cachedAtMs),
		toMs(row.expiresAtMs),
		row.networkError ? 1 : 0,
		String(row.errorMessage ?? ''),
	);
}

export function deleteScraperHttpCacheRow(cacheKey: string): void {
	const db = getCacheDb();
	db.prepare('DELETE FROM scraper_http_cache WHERE cache_key = ?').run(String(cacheKey ?? '').trim());
}

export function readAllCacheRefreshRequests(): CacheRefreshRequestRow[] {
	const db = getCacheDb();
	const rows = db.prepare(`
		SELECT component_name, updated_at_ms
		FROM cache_refresh_requests
		ORDER BY component_name ASC
	`).all() as Array<{ component_name?: string; updated_at_ms?: number }>;

	return rows
		.map((row) => ({
			componentName: String(row.component_name ?? '').trim(),
			updatedAtMs: Number(row.updated_at_ms ?? 0),
		}))
		.filter((row) => row.componentName.length > 0);
}

export function replaceCacheRefreshRequests(componentNames: string[]): void {
	const db = getCacheDb();
	const normalized = Array.from(
		new Set(
			componentNames
				.map((name) => String(name ?? '').trim())
				.filter(Boolean),
		),
	);

	db.exec('BEGIN IMMEDIATE;');
	try {
		db.prepare('DELETE FROM cache_refresh_requests').run();
		const insert = db.prepare(`
			INSERT INTO cache_refresh_requests(component_name, updated_at_ms)
			VALUES (?, ?)
			ON CONFLICT(component_name)
			DO UPDATE SET updated_at_ms = excluded.updated_at_ms
		`);
		const nowMs = Date.now();
		for (const componentName of normalized) {
			insert.run(componentName, nowMs);
		}
		db.exec('COMMIT;');
	} catch (error) {
		db.exec('ROLLBACK;');
		throw error;
	}
}
