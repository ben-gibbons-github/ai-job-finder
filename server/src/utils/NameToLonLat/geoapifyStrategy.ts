import axios from 'axios';

import { GEOAPIFY_API_KEY } from './apiKeys.js';
import type { LatLonPair } from '../NameToLonLatCache.js';

/**
 * Geoapify geocoding strategy.
 */
export async function geoapifyStrategy(placeName: string): Promise<LatLonPair> {
  if (!GEOAPIFY_API_KEY) {
    throw new Error('Missing GEOAPIFY_API_KEY');
  }

  const response = await axios.get('https://api.geoapify.com/v1/geocode/search', {
    params: {
      text: placeName,
      format: 'json',
      apiKey: GEOAPIFY_API_KEY,
      limit: 1,
    },
  });

  const featureCoords = response.data?.features?.[0]?.geometry?.coordinates;
  const resultObj = response.data?.results?.[0];

  if (!featureCoords && (!resultObj || typeof resultObj.lat !== 'number' || typeof resultObj.lon !== 'number')) {
    throw new Error(`No results found for location: ${placeName}`);
  }

  return {
    lon: featureCoords ? featureCoords[0] : resultObj.lon,
    lat: featureCoords ? featureCoords[1] : resultObj.lat,
  };
}
