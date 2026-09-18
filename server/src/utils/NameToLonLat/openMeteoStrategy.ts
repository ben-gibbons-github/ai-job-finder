import axios from 'axios';

import type { LatLonPair } from '../NameToLonLatCache.js';

/**
 * Open-Meteo geocoding strategy.
 */
export async function openMeteoStrategy(placeName: string): Promise<LatLonPair> {
  const response = await axios.get('https://geocoding-api.open-meteo.com/v1/search', {
    params: {
      name: placeName,
      count: 1,
      language: 'en',
      format: 'json',
    },
  });

  if (!response.data || !response.data.results || response.data.results.length === 0) {
    throw new Error(`No results found for location: ${placeName}`);
  }

  const result = response.data.results[0];
  return {
    lat: result.latitude,
    lon: result.longitude,
  };
}
