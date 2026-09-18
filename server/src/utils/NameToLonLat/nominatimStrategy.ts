import axios from 'axios';

import type { LatLonPair } from '../NameToLonLatCache.js';

/**
 * OpenStreetMap Nominatim - free, reliable, no API key required.
 */
export async function nominatimStrategy(placeName: string): Promise<LatLonPair> {
  const response = await axios.get('https://nominatim.openstreetmap.org/search', {
    params: {
      q: placeName,
      format: 'json',
      limit: 1,
    },
    headers: {
      'User-Agent': 'JobFinder/1.0',
    },
  });

  if (!response.data || response.data.length === 0) {
    throw new Error(`No results found for location: ${placeName}`);
  }

  const result = response.data[0];
  return {
    lat: parseFloat(result.lat),
    lon: parseFloat(result.lon),
  };
}
