/** Enum of employer impact classification categories, shared in spirit with the client copy. */
export enum EmployerImpactCategory {
  ClimateEnergyAnimalWelfare = 'climate_energy_animal_welfare',
  HealthMedTechMentalCare = 'health_medtech_mental_care',
  TechAiMediaForGood = 'tech_ai_media_for_good',
  EducationSkillsOpportunity = 'education_skills_opportunity',
  VeteransHumanRightsGlobalAid = 'veterans_human_rights_global_aid',
  SocialSafetyHousingCommunity = 'social_safety_housing_community',
  DisabilityAccessibility = 'disability_accessibility',
  ImpactFinanceEconomicInclusion = 'impact_finance_economic_inclusion',
}

export const EMPLOYER_IMPACT_CATEGORY_LABELS: Record<EmployerImpactCategory, string> = {
  [EmployerImpactCategory.ClimateEnergyAnimalWelfare]: 'Climate, Energy & Animal Welfare',
  [EmployerImpactCategory.HealthMedTechMentalCare]: 'Health, MedTech & Mental Care',
  [EmployerImpactCategory.TechAiMediaForGood]: 'Tech, AI & Media for good',
  [EmployerImpactCategory.EducationSkillsOpportunity]: 'Education, Skills & Opportunity',
  [EmployerImpactCategory.VeteransHumanRightsGlobalAid]: 'Veterans, Human Rights & Global Aid',
  [EmployerImpactCategory.SocialSafetyHousingCommunity]: 'Social Safety, Housing & Community',
  [EmployerImpactCategory.DisabilityAccessibility]: 'Disability & Accessibility',
  [EmployerImpactCategory.ImpactFinanceEconomicInclusion]: 'Impact Finance & Economic Inclusion',
}

export const EMPLOYER_IMPACT_CATEGORIES: EmployerImpactCategory[] = Object.values(EmployerImpactCategory)

const LABEL_TO_CATEGORY = new Map<string, EmployerImpactCategory>(
  EMPLOYER_IMPACT_CATEGORIES.map((category) => [EMPLOYER_IMPACT_CATEGORY_LABELS[category], category]),
)

export function isEmployerImpactCategory(value: unknown): value is EmployerImpactCategory {
  return typeof value === 'string' && EMPLOYER_IMPACT_CATEGORIES.includes(value as EmployerImpactCategory)
}

export function employerImpactCategoryFromLabel(label: unknown): EmployerImpactCategory | null {
  const normalized = String(label ?? '').trim()
  return LABEL_TO_CATEGORY.get(normalized) ?? null
}

export function sanitizeEmployerImpactCategories(values: unknown): EmployerImpactCategory[] {
  if (!Array.isArray(values)) {
    return []
  }
  const result: EmployerImpactCategory[] = []
  for (const value of values) {
    if (isEmployerImpactCategory(value) && !result.includes(value)) {
      result.push(value)
    }
  }
  return result
}
