import axios from 'axios';

import { MAPQUEST_API_KEY } from './apiKeys.js';
import type { LatLonPair } from '../NameToLonLatCache.js';

/**
 * MapQuest geocoding strategy.
 */
export async function mapquestStrategy(placeName: string): Promise<LatLonPair> {
  if (!MAPQUEST_API_KEY) {
    throw new Error('Missing MAPQUEST_API_KEY');
  }

  const response = await axios.get('https://www.mapquestapi.com/geocoding/v1/address', {
    params: {
      key: MAPQUEST_API_KEY,
      location: placeName,
      maxResults: 1,
    },
  });

  if (
    !response.data ||
    !response.data.results ||
    response.data.results.length === 0 ||
    !response.data.results[0].locations ||
    response.data.results[0].locations.length === 0
  ) {
    throw new Error(`No results found for location: ${placeName}`);
  }

  const loc = response.data.results[0].locations[0].latLng;
  return {
    lat: loc.lat,
    lon: loc.lng,
  };
}
