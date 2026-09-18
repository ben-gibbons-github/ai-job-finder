import { ALL_SCRAPE_COUNTRY_NAMES } from './SharedCountries.js';

export const REMOTE_LOCATION_HINTS = [
  'Remote',
  'Worldwide',
  'Anywhere',
  'Work from Home',
  'Hybrid',
];

export const GLOBAL_COUNTRY_LOCATIONS = [...ALL_SCRAPE_COUNTRY_NAMES];

export const GLOBAL_HUB_CITY_LOCATIONS = [
  'New York, NY',
  'Los Angeles, CA',
  'Chicago, IL',
  'San Francisco, CA',
  'Seattle, WA',
  'Austin, TX',
  'Boston, MA',
  'Washington, DC',
  'Atlanta, GA',
  'Miami, FL',
  'Toronto, ON',
  'Vancouver, BC',
  'Montreal, QC',
  'London',
  'Manchester',
  'Birmingham',
  'Edinburgh',
  'Glasgow',
  'Dublin',
  'Berlin',
  'Munich',
  'Hamburg',
  'Amsterdam',
  'Rotterdam',
  'Paris',
  'Lyon',
  'Madrid',
  'Barcelona',
  'Lisbon',
  'Stockholm',
  'Copenhagen',
  'Oslo',
  'Helsinki',
  'Zurich',
  'Vienna',
  'Brussels',
  'Warsaw',
  'Prague',
  'Budapest',
  'Bucharest',
  'Athens',
  'Dubai',
  'Abu Dhabi',
  'Singapore',
  'Hong Kong',
  'Tokyo',
  'Osaka',
  'Seoul',
  'Bangalore',
  'Hyderabad',
  'Pune',
  'Mumbai',
  'Delhi',
  'Sydney',
  'Melbourne',
  'Brisbane',
  'Perth',
  'Auckland',
];

export const UNITED_KINGDOM_REGIONAL_LOCATIONS = [
  'United Kingdom',
  'London',
  'Manchester',
  'Birmingham',
  'Leeds',
  'Bristol',
  'Glasgow',
  'Edinburgh',
  'Liverpool',
  'Nottingham',
  'Leicester',
  'Sheffield',
  'Newcastle upon Tyne',
  'Cardiff',
  'Belfast',
  'Southampton',
  'Portsmouth',
  'Reading',
  'Milton Keynes',
  'Cambridge',
  'Oxford',
  'Coventry',
  'Bradford',
  'Hull',
  'Stoke-on-Trent',
  'Swansea',
  'Derby',
  'Plymouth',
  'Aberdeen',
  'Dundee',
  'Inverness',
  'York',
  'Bath',
  'Exeter',
  'Norwich',
  'Brighton',
  'Luton',
  'Northampton',
  'Remote',
  'Hybrid',
];

function uniqueLocations(locations: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of locations) {
    const value = String(raw || '').trim();
    if (!value) {
      continue;
    }

    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(value);
  }

  return result;
}

export function getGlobalLocationCatalog(): string[] {
  return uniqueLocations([
    ...REMOTE_LOCATION_HINTS,
    ...GLOBAL_COUNTRY_LOCATIONS,
    ...GLOBAL_HUB_CITY_LOCATIONS,
  ]);
}

export function getUkFocusedLocationCatalog(): string[] {
  return uniqueLocations([
    ...UNITED_KINGDOM_REGIONAL_LOCATIONS,
    ...REMOTE_LOCATION_HINTS,
  ]);
}

export function capLocations(locations: string[], maxLocations: number): string[] {
  const cap = Math.max(1, Number(maxLocations || 1));
  return uniqueLocations(locations).slice(0, cap);
}