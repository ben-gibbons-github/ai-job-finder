import { hasUnitedStatesStateAbbreviation } from '../../utils/CityFallbackLookup.js'
import { COUNTRY_ALIASES, LOCATION_COUNTRY_HINTS } from './constants.js'
import { containsAlias, toSafeText } from './text.js'

function detectCountryFromText(text: string): string | null {
  const normalized = toSafeText(text)
  if (!normalized) {
    return null
  }

  for (const entry of COUNTRY_ALIASES) {
    for (const alias of entry.aliases) {
      if (containsAlias(normalized, alias)) {
        return entry.canonical
      }
    }
  }

  return null
}

export function detectCountryFromLocation(text: string): string | null {
  const explicitCountry = detectCountryFromText(text)
  if (explicitCountry !== null) {
    return explicitCountry
  }

  if (/(^|[^a-z])u\.?s\.?(?:a\.?)([^a-z]|$)/i.test(text) || hasUnitedStatesStateAbbreviation(text)) {
    return 'united states'
  }

  for (const entry of LOCATION_COUNTRY_HINTS) {
    if (entry.aliases.some((alias) => containsAlias(text, alias))) {
      return entry.canonical
    }
  }

  return null
}

export function detectCountryFromTextValue(text: string): string | null {
  return detectCountryFromText(text)
}
