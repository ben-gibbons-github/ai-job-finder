/** Mirrors server/src/searching/EmployerImpactCategory.ts — keep enum values and labels in sync. */
export const EmployerImpactCategory = {
  ClimateEnergyAnimalWelfare: 'climate_energy_animal_welfare',
  HealthMedTechMentalCare: 'health_medtech_mental_care',
  TechAiMediaForGood: 'tech_ai_media_for_good',
  EducationSkillsOpportunity: 'education_skills_opportunity',
  VeteransHumanRightsGlobalAid: 'veterans_human_rights_global_aid',
  SocialSafetyHousingCommunity: 'social_safety_housing_community',
  DisabilityAccessibility: 'disability_accessibility',
  ImpactFinanceEconomicInclusion: 'impact_finance_economic_inclusion',
} as const

export type EmployerImpactCategory = (typeof EmployerImpactCategory)[keyof typeof EmployerImpactCategory]

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

export const EMPLOYER_IMPACT_CATEGORY_ICONS: Record<EmployerImpactCategory, string> = {
  [EmployerImpactCategory.ClimateEnergyAnimalWelfare]: '🌎',
  [EmployerImpactCategory.HealthMedTechMentalCare]: '🩺',
  [EmployerImpactCategory.TechAiMediaForGood]: '🤖',
  [EmployerImpactCategory.EducationSkillsOpportunity]: '🎓',
  [EmployerImpactCategory.VeteransHumanRightsGlobalAid]: '🤝',
  [EmployerImpactCategory.SocialSafetyHousingCommunity]: '🏘️',
  [EmployerImpactCategory.DisabilityAccessibility]: '♿',
  [EmployerImpactCategory.ImpactFinanceEconomicInclusion]: '💰',
}

export function isEmployerImpactCategory(value: unknown): value is EmployerImpactCategory {
  return typeof value === 'string' && EMPLOYER_IMPACT_CATEGORIES.includes(value as EmployerImpactCategory)
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
