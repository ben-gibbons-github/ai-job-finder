export interface ScrapedEmployer {
  name: string;
  
  ai_summary: string;
  ai_red_flag_summary: string;

  ai_score: number;
  ai_red_flag_score: number;

  ai_impact_summary: string;
  ai_impact_score: number;

  employeeQualityOfLifeScore: number;
  employeeQualityOfLifeSummary: string;

  location_fallback?: string;

  promptVersion?: string;
  aiPrompt?: string;
}

