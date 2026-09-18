import type { LatLonPair } from '../NameToLonLatCache.js';

import { geoapifyStrategy } from './geoapifyStrategy.js';
import { hardcodedLocationsStrategy } from './hardcodedLocationsStrategy.js';
import { mapquestStrategy } from './mapquestStrategy.js';
import { nominatimStrategy } from './nominatimStrategy.js';
import { openMeteoStrategy } from './openMeteoStrategy.js';

export const geocodingStrategies: Array<(placeName: string) => Promise<LatLonPair>> = [
  nominatimStrategy,
  geoapifyStrategy,
  openMeteoStrategy,
  mapquestStrategy,
  hardcodedLocationsStrategy,
];
