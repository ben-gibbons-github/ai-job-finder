import { HARDCODED_LOCATIONS } from '../HardcodedLocations.js';
import type { LatLonPair } from '../NameToLonLatCache.js';

import { normalizeLocationText } from './normalizeLocationText.js';

const NORMALIZED_HARDCODED_LOCATIONS: Record<string, LatLonPair> = Object.entries(HARDCODED_LOCATIONS).reduce(
  (acc, [key, value]) => {
    acc[normalizeLocationText(key)] = value;
    return acc;
  },
  {} as Record<string, LatLonPair>,
);

/**
 * Hardcoded fallback strategy used when API strategies fail.
 */
export async function hardcodedLocationsStrategy(placeName: string): Promise<LatLonPair> {
  const normalized = normalizeLocationText(placeName);

  if (NORMALIZED_HARDCODED_LOCATIONS[normalized]) {
    return NORMALIZED_HARDCODED_LOCATIONS[normalized];
  }

  throw new Error(`No hardcoded location match found for: ${placeName}`);
}
