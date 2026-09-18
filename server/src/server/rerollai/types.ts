import type { ScrapedJob } from '../../scraping/core/ScrapedJob.js';

export interface RegisterRerollAiDebugOptions {
  searchDebugEnabled: boolean;
  getJobs: () => ScrapedJob[];
}

export interface RerollPayload {
  source_url?: string;
  name?: string;
  company_name?: string;
}

export interface RerollCallbackResponse {
  auditScore: number;
  auditText: string;
  error?: string;
}

export type RerollCallback = (response: RerollCallbackResponse) => void;
