import { ScrapedEmployer } from "./ScrapedEmployer.js";
import type { JobTypeCategory } from '../searching/JobTypeClassify.js';

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
  impact_number: number;
  audit_number: number;
  audit_text: string;
  tags: string[];
  job_type_classification_version?: string;
  job_type_primary_category?: JobTypeCategory;
  job_type_categories?: JobTypeCategory[];
  job_type_classification_confidence?: number;
  
  scrapedEmployer?: ScrapedEmployer;
}

