export const JOB_TYPE_CLASSIFIER_VERSION = '2.0.1'

export type JobTypeCategory =
	| 'mental_health'
	| 'medical'
	| 'cybersecurity'
	| 'accessibility'
	| 'education'
	| 'architecture_built_environment'
	| 'public_service_nonprofit'
	| 'climate_energy_environment'
	| 'finance_legal_compliance'
	| 'general_business'

export interface JobTypeClassificationMatch {
	category: JobTypeCategory
	score: number
	reasons: string[]
}

export interface JobTypeClassificationResult {
	version: string
	primaryCategory: JobTypeCategory
	categories: JobTypeCategory[]
	matches: JobTypeClassificationMatch[]
	confidence: number
	text: string
}

export interface JobTypeClassifiableJob {
	name?: string
	company_name?: string
	location?: string
	type?: string
	source?: string
	description?: string
	tags?: string[]
	audit_text?: string
	scrapedEmployer?: {
		ai_summary?: string
		ai_impact_summary?: string
		employeeQualityOfLifeSummary?: string
	}
	job_type_classification_version?: string
	job_type_primary_category?: JobTypeCategory
	job_type_categories?: JobTypeCategory[]
	job_type_classification_confidence?: number
}

interface CategoryRule {
	category: JobTypeCategory
	terms: Array<{ phrase: string; weight: number }>
	boostTerms?: Array<{ phrase: string; weight: number }>
	singleWords?: Array<{ word: string; weight: number }>
}

const CATEGORY_RULES: CategoryRule[] = [
	{
		category: 'mental_health',
		terms: [
			{ phrase: 'mental health', weight: 2.6 },
			{ phrase: 'behavioral health', weight: 1.6 },
			{ phrase: 'in-network therapists', weight: 2.2 },
			{ phrase: 'in network therapists', weight: 2.2 },
			{ phrase: 'therapists', weight: 1.3 },
			{ phrase: 'therapy practice', weight: 1.6 },
			{ phrase: 'licensed therapist', weight: 2.4 },
			{ phrase: 'clinical therapist', weight: 2.2 },
			{ phrase: 'counselor', weight: 2.2 },
			{ phrase: 'psychologist', weight: 2.4 },
			{ phrase: 'psychiatry', weight: 2.3 },
		],
		singleWords: [
			{ word: 'suicidal', weight: 1.5 },
			{ word: 'suicide', weight: 1.5 },
			{ word: 'therapist', weight: 1.2 },
			{ word: 'counselor', weight: 1.1 },
			{ word: 'psychologist', weight: 1.2 },
			{ word: 'psychiatry', weight: 1.1 },
			{ word: 'psychiatric', weight: 1.0 },
			{ word: 'behavioral', weight: 0.45 },
			{ word: 'mental', weight: 0.95 },
			{ word: 'wellbeing', weight: 0.7 },
			{ word: 'wellness', weight: 0.6 },
			{ word: 'trauma', weight: 0.8 },
			{ word: 'therapists', weight: 0.95 },
		],
	},
	{
		category: 'medical',
		terms: [
			{ phrase: 'medical', weight: 2.0 },
			{ phrase: 'medical device', weight: 2.4 },
			{ phrase: 'clinical research', weight: 2.2 },
			{ phrase: 'speech therapy', weight: 2.5 },
			{ phrase: 'life-saving', weight: 2.5 },
			{ phrase: 'language therapy', weight: 2.4 },
			{ phrase: 'speech language', weight: 2.3 },
			{ phrase: 'communication disorder', weight: 2.2 },
			{ phrase: 'augmentative communication', weight: 2.6 },
			{ phrase: 'aac device', weight: 2.6 },
			{ phrase: 'telehealth', weight: 2.0 },
			{ phrase: 'medicare', weight: 2.2 },
			{ phrase: 'aphasia', weight: 2.6 },
			{ phrase: 'parkinson', weight: 2.2 },
			{ phrase: 'stroke', weight: 2.3 },
			{ phrase: 'rehabilitation', weight: 2.1 },
			{ phrase: 'life-saving therapies', weight: 2.7 },
			{ phrase: 'life saving therapies', weight: 2.7 },
			{ phrase: 'clinical trials', weight: 2.4 },
			{ phrase: 'biopharmaceutical', weight: 2.3 },
			{ phrase: 'patient access', weight: 2.0 },
			{ phrase: 'vaccine', weight: 2.6 },
			{ phrase: 'vaccines', weight: 2.6 },
			{ phrase: 'blood', weight: 2.1 },
			{ phrase: 'blood bank', weight: 2.5 },
			{ phrase: 'immunization', weight: 2.4 },
			{ phrase: 'pathology', weight: 2.2 },
			{ phrase: 'phlebotomy', weight: 2.5 },
			{ phrase: 'diagnostics', weight: 2.0 },
			{ phrase: 'specimen', weight: 1.8 },
			{ phrase: 'laboratory', weight: 1.8 },
			{ phrase: 'hospital', weight: 1.7 },
			{ phrase: 'clinic', weight: 1.7 },
			{ phrase: 'nurse', weight: 2.4 },
			{ phrase: 'physician', weight: 2.4 },
			{ phrase: 'care manager', weight: 1.9 },
			{ phrase: 'social worker', weight: 2.0 },
			{ phrase: 'patient care', weight: 2.1 },
			{ phrase: 'pediatric care', weight: 2.2 },
			{ phrase: 'speech language pathologist', weight: 2.5 },
			{ phrase: 'clinical care', weight: 2.0 },
			{ phrase: 'healthcare', weight: 1.7 },
			{ phrase: 'claims processing', weight: 1.9 },
			{ phrase: 'care providers', weight: 1.9 },
			{ phrase: 'provider reimbursement', weight: 2.0 },
		],
		singleWords: [
			{ word: 'medical', weight: 1.1 },
			{ word: 'medicine', weight: 1.0 },
			{ word: 'nurse', weight: 1.0 },
			{ word: 'physician', weight: 1.0 },
			{ word: 'aphasia', weight: 1.3 },
			{ word: 'parkinson', weight: 1.1 },
			{ word: 'clinical', weight: 1.1 },
			{ word: 'stroke', weight: 1.1 },
			{ word: 'telehealth', weight: 0.95 },
			{ word: 'medicare', weight: 1.0 },
			{ word: 'rehabilitation', weight: 0.9 },
			{ word: 'biopharmaceutical', weight: 1.0 },
			{ word: 'therapies', weight: 0.9 },
			{ word: 'trials', weight: 0.85 },
			{ word: 'aac', weight: 1.0 },
			{ word: 'therapy', weight: 0.8 },
			{ word: 'blood', weight: 1.0 },
			{ word: 'vaccine', weight: 1.1 },
			{ word: 'vaccines', weight: 1.1 },
			{ word: 'immunization', weight: 1.0 },
			{ word: 'pathology', weight: 0.95 },
			{ word: 'diagnostic', weight: 0.85 },
			{ word: 'laboratory', weight: 0.75 },
			{ word: 'clinic', weight: 0.7 },
			{ word: 'hospital', weight: 0.7 },
			{ word: 'healthcare', weight: 0.85 },
			{ word: 'patient', weight: 0.7 },
			{ word: 'pediatric', weight: 0.75 },
			{ word: 'providers', weight: 0.65 },
			{ word: 'reimbursement', weight: 0.8 },
			{ word: 'claims', weight: 0.65 },
			{ word: 'care', weight: 0.55 },
			{ word: 'pharma', weight: 0.75 },
			{ word: 'mortality', weight: 0.75 },
			{ word: 'medicaid', weight: 2.75 },
		],
	},
	{
		category: 'cybersecurity',
		terms: [
			{ phrase: 'cybersecurity', weight: 3.4 },
			{ phrase: 'cyber security', weight: 3.4 },
			{ phrase: 'information security', weight: 3.0 },
			{ phrase: 'application security', weight: 3.2 },
			{ phrase: 'product security', weight: 3.2 },
			{ phrase: 'security engineer', weight: 3.0 },
			{ phrase: 'threat detection', weight: 2.8 },
			{ phrase: 'incident response', weight: 2.8 },
			{ phrase: 'supply chain security', weight: 3.4 },
			{ phrase: 'supply chain attack', weight: 3.4 },
			{ phrase: 'open source dependency', weight: 3.0 },
			{ phrase: 'open-source dependency', weight: 3.0 },
			{ phrase: 'vulnerability', weight: 2.6 },
			{ phrase: 'vulnerabilities', weight: 2.6 },
			{ phrase: 'malware', weight: 2.6 },
			{ phrase: 'digital infrastructure', weight: 2.2 },
		],
		boostTerms: [
			{ phrase: 'zero trust', weight: 1.2 },
			{ phrase: 'iam', weight: 0.9 },
			{ phrase: 'siem', weight: 1.0 },
			{ phrase: 'soc', weight: 1.0 },
			{ phrase: 'pentest', weight: 1.1 },
			{ phrase: 'phishing', weight: 1.0 },
			{ phrase: 'ransomware', weight: 1.2 },
			{ phrase: 'dependency', weight: 0.8 },
		],
		singleWords: [
			{ word: 'security', weight: 1.6 },
			{ word: 'cyber', weight: 1.8 },
			{ word: 'threat', weight: 1.1 },
			{ word: 'vulnerability', weight: 1.1 },
			{ word: 'vulnerabilities', weight: 1.1 },
			{ word: 'malicious', weight: 1.0 },
			{ word: 'breach', weight: 0.95 },
			{ word: 'attack', weight: 0.95 },
			{ word: 'defense', weight: 0.85 },
			{ word: 'secure', weight: 0.85 },
		],
	},
	{
		category: 'accessibility',
		terms: [
			{ phrase: 'digital accessibility', weight: 2.8 },
			{ phrase: 'accessibility testing', weight: 3.0 },
			{ phrase: 'accessibility audit', weight: 2.6 },
			{ phrase: 'inclusive design', weight: 2.7 },
			{ phrase: 'assistive technology', weight: 2.8 },
			{ phrase: 'people with disabilities', weight: 3.0 },
			{ phrase: 'disability', weight: 2.0 },
			{ phrase: 'screen reader', weight: 2.7 },
			{ phrase: 'nothing for us without us', weight: 3.2 },
			{ phrase: 'user research', weight: 1.7 },
			{ phrase: 'wcag', weight: 2.6 },
			{ phrase: 'ada compliance', weight: 2.4 },
		],
		boostTerms: [
			{ phrase: 'inclusive', weight: 0.9 },
			{ phrase: 'underserved', weight: 0.8 },
			{ phrase: 'co-creation', weight: 0.9 },
		],
		singleWords: [
			{ word: 'accessibility', weight: 1.4 },
			{ word: 'accessible', weight: 1.0 },
			{ word: 'disability', weight: 1.1 },
			{ word: 'disabilities', weight: 1.1 },
			{ word: 'inclusive', weight: 0.85 },
			{ word: 'inclusion', weight: 0.8 },
			{ word: 'screenreader', weight: 0.9 },
			{ word: 'wcag', weight: 1.2 },
			{ word: 'ada', weight: 0.9 },
		],
	},
	{
		category: 'education',
		terms: [
			{ phrase: 'higher education', weight: 2.7 },
			{ phrase: 'education', weight: 2.2 },
			{ phrase: 'university', weight: 2.1 },
			{ phrase: 'students', weight: 1.8 },
			{ phrase: 'student', weight: 1.7 },
			{ phrase: 'curriculum', weight: 2.0 },
			{ phrase: 'learning', weight: 1.8 },
			{ phrase: 'teaching', weight: 1.8 },
			{ phrase: 'coding camps', weight: 2.1 },
			{ phrase: 'digital pioneers', weight: 2.0 },
			{ phrase: 'intercultural learning', weight: 2.0 },
		],
		boostTerms: [
			{ phrase: 'curiosity-driven education', weight: 1.3 },
			{ phrase: 'open society', weight: 0.8 },
			{ phrase: 'critical thinking', weight: 1.0 },
			{ phrase: 'problem-solving', weight: 1.0 },
		],
		singleWords: [
			{ word: 'education', weight: 1.2 },
			{ word: 'university', weight: 1.1 },
			{ word: 'student', weight: 0.85 },
			{ word: 'students', weight: 0.85 },
			{ word: 'learning', weight: 0.8 },
			{ word: 'school', weight: 0.75 },
			{ word: 'teaching', weight: 0.8 },
			{ word: 'curriculum', weight: 0.9 },
			{ word: 'academic', weight: 0.75 },
			{ word: 'entrepreneurship', weight: 0.7 },
		],
	},
	{
		category: 'architecture_built_environment',
		terms: [
			{ phrase: 'architecture', weight: 2.2 },
			{ phrase: 'building designer', weight: 2.2 },
			{ phrase: 'interior architect', weight: 2.2 },
			{ phrase: 'landscape architect', weight: 2.4 },
			{ phrase: 'urban designer', weight: 2.0 },
		],
		singleWords: [
			{ word: 'architect', weight: 1.8 },
			{ word: 'architecture', weight: 1.6 },
			{ word: 'construction', weight: 0.85 },
			{ word: 'interior', weight: 0.75 },
		],
	},
	{
		category: 'public_service_nonprofit',
		terms: [
			{ phrase: 'nonprofit', weight: 2.2 },
			{ phrase: 'public service', weight: 2.1 },
			{ phrase: 'government', weight: 1.9 },
			{ phrase: 'community', weight: 1.6 },
			{ phrase: 'advocacy', weight: 1.9 },
		],
		singleWords: [
			{ word: 'nonprofit', weight: 1.0 },
			{ word: 'government', weight: 0.9 },
			{ word: 'community', weight: 0.75 },
			{ word: 'advocacy', weight: 0.9 },
			{ word: 'charity', weight: 0.8 },
		],
	},
	{
		category: 'climate_energy_environment',
		terms: [
			{ phrase: 'climate', weight: 2.2 },
			{ phrase: 'energy', weight: 1.5 },
			{ phrase: 'renewable', weight: 2.0 },
			{ phrase: 'solar', weight: 1.8 },
			{ phrase: 'wind', weight: 1.8 },
			{ phrase: 'electrical grid', weight: 2.4 },
			{ phrase: 'grid resilience', weight: 2.4 },
			{ phrase: 'wildfire', weight: 2.2 },
			{ phrase: 'wildfires', weight: 2.2 },
			{ phrase: 'environment', weight: 1.9 },
			{ phrase: 'sustainability', weight: 2.0 },
			{ phrase: 'carbon', weight: 2.0 },
			{ phrase: 'wildfire', weight: 2.0 },
			{ phrase: 'energy infrastructure', weight: 2.0 },
		],
		singleWords: [
			{ word: 'climate', weight: 1.0 },
			{ word: 'energy', weight: 0.75 },
			{ word: 'renewable', weight: 0.95 },
			{ word: 'solar', weight: 0.9 },
			{ word: 'environment', weight: 0.95 },
			{ word: 'sustainability', weight: 0.95 },
			{ word: 'carbon', weight: 0.95 },
		],
	},
	{
		category: 'finance_legal_compliance',
		terms: [
			{ phrase: 'finance', weight: 1.8 },
			{ phrase: 'financial', weight: 1.7 },
			{ phrase: 'accounting', weight: 2.1 },
			{ phrase: 'controller', weight: 1.9 },
			{ phrase: 'legal', weight: 1.9 },
			{ phrase: 'compliance', weight: 2.2 },
			{ phrase: 'risk', weight: 1.7 },
			{ phrase: 'audit', weight: 1.8 },
		],
		singleWords: [
			{ word: 'finance', weight: 0.9 },
			{ word: 'legal', weight: 0.95 },
			{ word: 'compliance', weight: 1.0 },
			{ word: 'accounting', weight: 0.95 },
			{ word: 'audit', weight: 0.85 },
			{ word: 'risk', weight: 0.75 },
			{ word: 'tax', weight: 0.8 },
			{ word: 'banking', weight: 0.8 },
		],
	},
	{
		category: 'general_business',
		terms: [
			{ phrase: 'business analyst', weight: 1.9 },
			{ phrase: 'consultant', weight: 1.6 },
			{ phrase: 'general manager', weight: 1.8 },
			{ phrase: 'partnerships', weight: 1.5 },
		],
		singleWords: [
			{ word: 'business', weight: 0.85 },
			{ word: 'analyst', weight: 0.8 },
			{ word: 'consultant', weight: 0.85 },
			{ word: 'manager', weight: 0.55 },
		],
	},
]

const POSITIVE_MULTIPLE_CATEGORY_TERMS = ['and', 'or', 'plus', 'cross-functional', 'generalist']

function normalizeText(value: string | undefined | null): string {
	return String(value ?? '').toLowerCase().replace(/[^a-z0-9+\s-]/g, ' ').replace(/\s+/g, ' ').trim()
}

function addScore(
	scoreMap: Map<JobTypeCategory, { score: number; reasons: string[] }>,
	category: JobTypeCategory,
	amount: number,
	reason: string,
): void {
	const current = scoreMap.get(category)
	if (current) {
		current.score += amount
		current.reasons.push(reason)
		return
	}
	scoreMap.set(category, { score: amount, reasons: [reason] })
}

function scoreTextForRule(text: string, rule: CategoryRule): { score: number; reasons: string[] } {
	const reasons: string[] = []
	let score = 0
	const tokens = new Set(text.split(/\s+/).filter(Boolean))

	for (const term of rule.terms) {
		if (text.includes(term.phrase)) {
			score += term.weight
			reasons.push(term.phrase)
		}
	}

	for (const term of rule.boostTerms ?? []) {
		if (text.includes(term.phrase)) {
			score += term.weight
			reasons.push(term.phrase)
		}
	}

	for (const term of rule.singleWords ?? []) {
		if (tokens.has(term.word)) {
			score += term.weight
			reasons.push(term.word)
		}
	}

	return { score, reasons }
}

function collectJobText(job: JobTypeClassifiableJob): string {
	return normalizeText([
		job.name,
		job.company_name,
		job.location,
		job.type,
		job.source,
		job.description,
		job.audit_text,
		...(Array.isArray(job.tags) ? job.tags : []),
		job.scrapedEmployer?.ai_summary,
		job.scrapedEmployer?.ai_impact_summary,
		job.scrapedEmployer?.employeeQualityOfLifeSummary,
	].join(' '))
}

export function classifyJobTypes(job: JobTypeClassifiableJob): JobTypeClassificationResult {
	const text = collectJobText(job)
	const scoreMap = new Map<JobTypeCategory, { score: number; reasons: string[] }>()

	for (const rule of CATEGORY_RULES) {
		const { score, reasons } = scoreTextForRule(text, rule)
		if (score > 0) {
			addScore(scoreMap, rule.category, score, reasons.join(', '))
		}
	}

	const hasMultipleSignal = POSITIVE_MULTIPLE_CATEGORY_TERMS.some((term) => text.includes(term))
	const sortedMatches = Array.from(scoreMap.entries())
		.map(([category, { score, reasons }]) => ({ category, score, reasons }))
		.sort((left, right) => right.score - left.score || left.category.localeCompare(right.category))

	const topScore = sortedMatches[0]?.score ?? 0
	const threshold = hasMultipleSignal ? 1.2 : 1.6
	const thresholdCategories = sortedMatches
		.filter((match) => match.score >= Math.max(threshold, topScore * 0.45))
		.slice(0, hasMultipleSignal ? 3 : 2)
		.map((match) => match.category)

	const categories =
		thresholdCategories.length > 0
			? thresholdCategories
			: [sortedMatches[0]?.category ?? 'general_business']

	const primaryCategory = categories[0] ?? 'general_business'
	const confidence = Math.max(0, Math.min(1, Number((topScore / 5).toFixed(2))))

	return {
		version: JOB_TYPE_CLASSIFIER_VERSION,
		primaryCategory,
		categories,
		matches: sortedMatches,
		confidence,
		text,
	}
}

export function classifyJobTypeLabel(job: JobTypeClassifiableJob): string {
	return classifyJobTypes(job).primaryCategory
}

export function ensureJobTypeClassification(job: JobTypeClassifiableJob): boolean {
	if (job.job_type_classification_version === JOB_TYPE_CLASSIFIER_VERSION && job.job_type_primary_category) {
		return false
	}

	const classification = classifyJobTypes(job)
	job.job_type_classification_version = classification.version
	job.job_type_primary_category = classification.primaryCategory
	job.job_type_categories = classification.categories
	job.job_type_classification_confidence = classification.confidence
	return true
}
