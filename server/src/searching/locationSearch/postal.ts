import type { ParsedPostalQuery } from './types.js'

export function parsePostalQuery(query: string): ParsedPostalQuery | null {
  const trimmed = query.trim().toUpperCase()
  if (!trimmed) {
    return null
  }

  const usZip = /^(\d{5})(?:-\d{4})?$/
  if (usZip.test(trimmed)) {
    return { countryCode: 'US', postalCode: trimmed }
  }

  const prefixCountry = trimmed.match(/^([A-Z]{2})[\s-]+([A-Z0-9][A-Z0-9\s-]{1,9})$/)
  if (prefixCountry) {
    return { countryCode: prefixCountry[1], postalCode: prefixCountry[2].trim() }
  }

  const suffixCountry = trimmed.match(/^([A-Z0-9][A-Z0-9\s-]{1,9})[\s,]+([A-Z]{2})$/)
  if (suffixCountry) {
    return { countryCode: suffixCountry[2], postalCode: suffixCountry[1].trim() }
  }

  return null
}
