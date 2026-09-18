import { ScrapedEmployer } from "./ScrapedEmployer.js";
import type { JobTypeCategory } from '../../searching/JobTypeClassify.js';

export interface JobLocationCoordinate {
  label: string;
  lat: number;
  lon: number;
}

export interface ScrapedJob {
  name: string;
  company_name: string;
  location: string;
  remote: string;
  location_lon: number;
  location_lat: number;
  location_coordinates?: JobLocationCoordinate[];
  description: string;
  type: string;
  source: string;
  source_url: string;
  posted: string | Date;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  salary_period?: string;
  salary_is_estimated?: boolean;
  /** ISO timestamp of the most recent scrape that produced this record. */
  last_scraped_at?: string;
  impact_number: number;
  audit_number: number;
  audit_text: string;
  /** Memoized freshness score, recomputed when absent. */
  freshness_number?: number;
  tags: string[];
  job_type_classification_version?: string;
  job_type_primary_category?: JobTypeCategory;
  job_type_categories?: JobTypeCategory[];
  job_type_classification_confidence?: number;

  scrapedEmployer?: ScrapedEmployer;
}
