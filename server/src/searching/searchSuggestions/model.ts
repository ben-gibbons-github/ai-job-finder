export const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'at',
  'for',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
])

export const GENERIC_COMPANY_NAMES = new Set([
  'company confidential',
  'confidential',
  'jooble employer',
  'unknown',
  'unknown company',
  'unknown employer',
])

export interface SuggestionStats {
  display: string
  score: number
}
