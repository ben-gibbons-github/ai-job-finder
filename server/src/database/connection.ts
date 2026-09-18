import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(moduleDir, '../../cache');
export const CACHE_DB_FILE = path.join(CACHE_DIR, 'scraped_jobs.sqlite');

let cacheDb: DatabaseSync | null = null;

export function getCacheDb(): DatabaseSync {
	if (cacheDb) {
		return cacheDb;
	}

	const db = new DatabaseSync(CACHE_DB_FILE);
	db.exec('PRAGMA journal_mode = WAL;');
	db.exec('PRAGMA synchronous = NORMAL;');
	db.exec('PRAGMA temp_store = MEMORY;');
	db.exec('PRAGMA busy_timeout = 5000;');
	db.exec(`
		CREATE TABLE IF NOT EXISTS llm_answer_cache (
			question TEXT NOT NULL,
			prompt_version TEXT NOT NULL,
			answer TEXT NOT NULL,
			updated_at_ms INTEGER NOT NULL,
			PRIMARY KEY(question, prompt_version)
		);

		CREATE TABLE IF NOT EXISTS job_audit_cache (
			job_key TEXT PRIMARY KEY,
			audit_score REAL NOT NULL,
			audit_text TEXT NOT NULL,
			updated_at_ms INTEGER NOT NULL
		);

		CREATE TABLE IF NOT EXISTS job_impact_cache (
			job_key TEXT PRIMARY KEY,
			impact_score REAL NOT NULL,
			impact_summary TEXT NOT NULL,
			updated_at_ms INTEGER NOT NULL
		);

		CREATE TABLE IF NOT EXISTS job_qol_cache (
			job_key TEXT PRIMARY KEY,
			employee_qol_score REAL NOT NULL,
			employee_qol_summary TEXT NOT NULL,
			updated_at_ms INTEGER NOT NULL
		);

		CREATE TABLE IF NOT EXISTS location_search_cache (
			query_key TEXT NOT NULL,
			result_index INTEGER NOT NULL,
			value TEXT NOT NULL,
			label TEXT NOT NULL,
			country TEXT,
			state TEXT,
			display_label TEXT NOT NULL,
			lat REAL NOT NULL,
			lng REAL NOT NULL,
			updated_at_ms INTEGER NOT NULL,
			PRIMARY KEY(query_key, result_index)
		);

		CREATE TABLE IF NOT EXISTS location_latlon_cache (
			location_key TEXT PRIMARY KEY,
			lat REAL NOT NULL,
			lon REAL NOT NULL,
			is_hardcoded INTEGER NOT NULL DEFAULT 0,
			updated_at_ms INTEGER NOT NULL
		);

		CREATE TABLE IF NOT EXISTS scraped_employer_cache (
			employer_key TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			ai_summary TEXT NOT NULL,
			ai_red_flag_summary TEXT NOT NULL,
			ai_score REAL NOT NULL,
			ai_red_flag_score REAL NOT NULL,
			ai_impact_summary TEXT NOT NULL,
			ai_impact_score REAL NOT NULL,
			employee_qol_score REAL NOT NULL,
			employee_qol_summary TEXT NOT NULL,
			location_fallback TEXT,
			prompt_version TEXT,
			ai_prompt TEXT,
			updated_at_ms INTEGER NOT NULL
		);

		CREATE TABLE IF NOT EXISTS scraper_http_cache (
			cache_key TEXT PRIMARY KEY,
			url TEXT NOT NULL,
			method TEXT NOT NULL,
			status INTEGER NOT NULL,
			status_text TEXT NOT NULL,
			headers_json TEXT NOT NULL,
			body_text TEXT NOT NULL,
			cached_at_ms INTEGER NOT NULL,
			expires_at_ms INTEGER NOT NULL,
			network_error INTEGER NOT NULL DEFAULT 0,
			error_message TEXT
		);

		CREATE TABLE IF NOT EXISTS scraped_jobs (
			component_name TEXT NOT NULL,
			job_key TEXT NOT NULL,
			payload_json TEXT NOT NULL,
			updated_at_ms INTEGER NOT NULL,
			PRIMARY KEY(component_name, job_key)
		);

		CREATE INDEX IF NOT EXISTS idx_scraped_jobs_component
		ON scraped_jobs(component_name);

		CREATE TABLE IF NOT EXISTS component_cache_state (
			component_name TEXT PRIMARY KEY,
			updated_at_ms INTEGER NOT NULL
		);

		CREATE TABLE IF NOT EXISTS cache_refresh_requests (
			component_name TEXT PRIMARY KEY,
			updated_at_ms INTEGER NOT NULL
		);
	`);

	cacheDb = db;
	return db;
}
