/**
 * CityFallbackLookup.ts
 *
 * Hardcoded city/state → approximate lat/lon lookup for use when the primary
 * geocoding API stalls. Results from this table are intentionally NOT written
 * to the persistent location cache — they are only used as a one-time
 * temporary substitute within a single search request.
 */

interface LatLon { lat: number; lon: number }

// ─── Database ─────────────────────────────────────────────────────────────────
// Key format: lowercase city name, or "city, state-abbr", or "city, country"
// All aliases for the same place share the same coordinates.

const FALLBACK_DB: [string, LatLon][] = [
  // ── United States ──────────────────────────────────────────────────────────
  // New York
  ['new york',              { lat: 40.7128, lon: -74.0060 }],
  ['new york, ny',          { lat: 40.7128, lon: -74.0060 }],
  ['new york, new york',    { lat: 40.7128, lon: -74.0060 }],
  ['new york city',         { lat: 40.7128, lon: -74.0060 }],
  ['nyc',                   { lat: 40.7128, lon: -74.0060 }],
  ['brooklyn',              { lat: 40.6782, lon: -73.9442 }],
  ['brooklyn, ny',          { lat: 40.6782, lon: -73.9442 }],
  // California
  ['los angeles',           { lat: 34.0522, lon: -118.2437 }],
  ['los angeles, ca',       { lat: 34.0522, lon: -118.2437 }],
  ['la',                    { lat: 34.0522, lon: -118.2437 }],
  ['san francisco',         { lat: 37.7749, lon: -122.4194 }],
  ['san francisco, ca',     { lat: 37.7749, lon: -122.4194 }],
  ['sf',                    { lat: 37.7749, lon: -122.4194 }],
  ['san jose',              { lat: 37.3382, lon: -121.8863 }],
  ['san jose, ca',          { lat: 37.3382, lon: -121.8863 }],
  ['san diego',             { lat: 32.7157, lon: -117.1611 }],
  ['san diego, ca',         { lat: 32.7157, lon: -117.1611 }],
  ['sacramento',            { lat: 38.5816, lon: -121.4944 }],
  ['sacramento, ca',        { lat: 38.5816, lon: -121.4944 }],
  ['oakland',               { lat: 37.8044, lon: -122.2712 }],
  ['oakland, ca',           { lat: 37.8044, lon: -122.2712 }],
  ['long beach',            { lat: 33.7701, lon: -118.1937 }],
  ['long beach, ca',        { lat: 33.7701, lon: -118.1937 }],
  ['fresno',                { lat: 36.7378, lon: -119.7871 }],
  ['fresno, ca',            { lat: 36.7378, lon: -119.7871 }],
  ['irvine',                { lat: 33.6846, lon: -117.8265 }],
  ['irvine, ca',            { lat: 33.6846, lon: -117.8265 }],
  ['santa clara',           { lat: 37.3541, lon: -121.9552 }],
  ['santa clara, ca',       { lat: 37.3541, lon: -121.9552 }],
  ['palo alto',             { lat: 37.4419, lon: -122.1430 }],
  ['palo alto, ca',         { lat: 37.4419, lon: -122.1430 }],
  ['mountain view',         { lat: 37.3861, lon: -122.0839 }],
  ['mountain view, ca',     { lat: 37.3861, lon: -122.0839 }],
  ['menlo park',            { lat: 37.4529, lon: -122.1817 }],
  ['menlo park, ca',        { lat: 37.4529, lon: -122.1817 }],
  ['san mateo',             { lat: 37.5630, lon: -122.3255 }],
  ['san mateo, ca',         { lat: 37.5630, lon: -122.3255 }],
  ['redwood city',          { lat: 37.4852, lon: -122.2364 }],
  ['redwood city, ca',      { lat: 37.4852, lon: -122.2364 }],
  ['sunnyvale',             { lat: 37.3688, lon: -122.0363 }],
  ['sunnyvale, ca',         { lat: 37.3688, lon: -122.0363 }],
  ['berkeley',              { lat: 37.8716, lon: -122.2727 }],
  ['berkeley, ca',          { lat: 37.8716, lon: -122.2727 }],
  ['santa monica',          { lat: 34.0195, lon: -118.4912 }],
  ['santa monica, ca',      { lat: 34.0195, lon: -118.4912 }],
  ['pasadena',              { lat: 34.1478, lon: -118.1445 }],
  ['pasadena, ca',          { lat: 34.1478, lon: -118.1445 }],
  ['burbank',               { lat: 34.1808, lon: -118.3090 }],
  ['burbank, ca',           { lat: 34.1808, lon: -118.3090 }],
  // Texas
  ['houston',               { lat: 29.7604, lon: -95.3698 }],
  ['houston, tx',           { lat: 29.7604, lon: -95.3698 }],
  ['dallas',                { lat: 32.7767, lon: -96.7970 }],
  ['dallas, tx',            { lat: 32.7767, lon: -96.7970 }],
  ['san antonio',           { lat: 29.4241, lon: -98.4936 }],
  ['san antonio, tx',       { lat: 29.4241, lon: -98.4936 }],
  ['austin',                { lat: 30.2672, lon: -97.7431 }],
  ['austin, tx',            { lat: 30.2672, lon: -97.7431 }],
  ['fort worth',            { lat: 32.7555, lon: -97.3308 }],
  ['fort worth, tx',        { lat: 32.7555, lon: -97.3308 }],
  ['plano',                 { lat: 33.0198, lon: -96.6989 }],
  ['plano, tx',             { lat: 33.0198, lon: -96.6989 }],
  // Illinois
  ['chicago',               { lat: 41.8781, lon: -87.6298 }],
  ['chicago, il',           { lat: 41.8781, lon: -87.6298 }],
  // Pennsylvania
  ['philadelphia',          { lat: 39.9526, lon: -75.1652 }],
  ['philadelphia, pa',      { lat: 39.9526, lon: -75.1652 }],
  ['pittsburgh',            { lat: 40.4406, lon: -79.9959 }],
  ['pittsburgh, pa',        { lat: 40.4406, lon: -79.9959 }],
  // Arizona
  ['phoenix',               { lat: 33.4484, lon: -112.0740 }],
  ['phoenix, az',           { lat: 33.4484, lon: -112.0740 }],
  ['scottsdale',            { lat: 33.4942, lon: -111.9261 }],
  ['scottsdale, az',        { lat: 33.4942, lon: -111.9261 }],
  ['tempe',                 { lat: 33.4255, lon: -111.9400 }],
  ['tempe, az',             { lat: 33.4255, lon: -111.9400 }],
  // Florida
  ['jacksonville',          { lat: 30.3322, lon: -81.6557 }],
  ['jacksonville, fl',      { lat: 30.3322, lon: -81.6557 }],
  ['miami',                 { lat: 25.7617, lon: -80.1918 }],
  ['miami, fl',             { lat: 25.7617, lon: -80.1918 }],
  ['tampa',                 { lat: 27.9506, lon: -82.4572 }],
  ['tampa, fl',             { lat: 27.9506, lon: -82.4572 }],
  ['orlando',               { lat: 28.5383, lon: -81.3792 }],
  ['orlando, fl',           { lat: 28.5383, lon: -81.3792 }],
  ['fort lauderdale',       { lat: 26.1224, lon: -80.1373 }],
  ['fort lauderdale, fl',   { lat: 26.1224, lon: -80.1373 }],
  ['boca raton',            { lat: 26.3683, lon: -80.1289 }],
  ['boca raton, fl',        { lat: 26.3683, lon: -80.1289 }],
  // Ohio
  ['columbus',              { lat: 39.9612, lon: -82.9988 }],
  ['columbus, oh',          { lat: 39.9612, lon: -82.9988 }],
  ['cleveland',             { lat: 41.4993, lon: -81.6944 }],
  ['cleveland, oh',         { lat: 41.4993, lon: -81.6944 }],
  ['cincinnati',            { lat: 39.1031, lon: -84.5120 }],
  ['cincinnati, oh',        { lat: 39.1031, lon: -84.5120 }],
  // Michigan
  ['detroit',               { lat: 42.3314, lon: -83.0458 }],
  ['detroit, mi',           { lat: 42.3314, lon: -83.0458 }],
  ['ann arbor',             { lat: 42.2808, lon: -83.7430 }],
  ['ann arbor, mi',         { lat: 42.2808, lon: -83.7430 }],
  // Washington
  ['seattle',               { lat: 47.6062, lon: -122.3321 }],
  ['seattle, wa',           { lat: 47.6062, lon: -122.3321 }],
  ['bellevue',              { lat: 47.6101, lon: -122.2015 }],
  ['bellevue, wa',          { lat: 47.6101, lon: -122.2015 }],
  ['redmond',               { lat: 47.6740, lon: -122.1215 }],
  ['redmond, wa',           { lat: 47.6740, lon: -122.1215 }],
  ['kirkland',              { lat: 47.6815, lon: -122.2087 }],
  ['kirkland, wa',          { lat: 47.6815, lon: -122.2087 }],
  // Colorado
  ['denver',                { lat: 39.7392, lon: -104.9903 }],
  ['denver, co',            { lat: 39.7392, lon: -104.9903 }],
  ['boulder',               { lat: 40.0150, lon: -105.2705 }],
  ['boulder, co',           { lat: 40.0150, lon: -105.2705 }],
  // Oregon
  ['portland',              { lat: 45.5051, lon: -122.6750 }],
  ['portland, or',          { lat: 45.5051, lon: -122.6750 }],
  // Nevada
  ['las vegas',             { lat: 36.1699, lon: -115.1398 }],
  ['las vegas, nv',         { lat: 36.1699, lon: -115.1398 }],
  ['reno',                  { lat: 39.5296, lon: -119.8138 }],
  ['reno, nv',              { lat: 39.5296, lon: -119.8138 }],
  // Georgia
  ['atlanta',               { lat: 33.7490, lon: -84.3880 }],
  ['atlanta, ga',           { lat: 33.7490, lon: -84.3880 }],
  // North Carolina
  ['charlotte',             { lat: 35.2271, lon: -80.8431 }],
  ['charlotte, nc',         { lat: 35.2271, lon: -80.8431 }],
  ['raleigh',               { lat: 35.7796, lon: -78.6382 }],
  ['raleigh, nc',           { lat: 35.7796, lon: -78.6382 }],
  ['durham',                { lat: 35.9940, lon: -78.8986 }],
  ['durham, nc',            { lat: 35.9940, lon: -78.8986 }],
  // Virginia
  ['virginia beach',        { lat: 36.8529, lon: -75.9780 }],
  ['virginia beach, va',    { lat: 36.8529, lon: -75.9780 }],
  ['richmond',              { lat: 37.5407, lon: -77.4360 }],
  ['richmond, va',          { lat: 37.5407, lon: -77.4360 }],
  ['arlington',             { lat: 38.8799, lon: -77.1068 }],
  ['arlington, va',         { lat: 38.8799, lon: -77.1068 }],
  ['mclean',                { lat: 38.9339, lon: -77.1773 }],
  ['mclean, va',            { lat: 38.9339, lon: -77.1773 }],
  // Massachusetts
  ['boston',                { lat: 42.3601, lon: -71.0589 }],
  ['boston, ma',            { lat: 42.3601, lon: -71.0589 }],
  ['cambridge',             { lat: 42.3736, lon: -71.1106 }],
  ['cambridge, ma',         { lat: 42.3736, lon: -71.1106 }],
  ['somerville',            { lat: 42.3876, lon: -71.0995 }],
  ['somerville, ma',        { lat: 42.3876, lon: -71.0995 }],
  // Maryland / DC
  ['washington',            { lat: 38.9072, lon: -77.0369 }],
  ['washington, dc',        { lat: 38.9072, lon: -77.0369 }],
  ['dc',                    { lat: 38.9072, lon: -77.0369 }],
  ['baltimore',             { lat: 39.2904, lon: -76.6122 }],
  ['baltimore, md',         { lat: 39.2904, lon: -76.6122 }],
  ['bethesda',              { lat: 38.9807, lon: -77.1002 }],
  ['bethesda, md',          { lat: 38.9807, lon: -77.1002 }],
  // Minnesota
  ['minneapolis',           { lat: 44.9778, lon: -93.2650 }],
  ['minneapolis, mn',       { lat: 44.9778, lon: -93.2650 }],
  // Missouri
  ['kansas city',           { lat: 39.0997, lon: -94.5786 }],
  ['kansas city, mo',       { lat: 39.0997, lon: -94.5786 }],
  ['st louis',              { lat: 38.6270, lon: -90.1994 }],
  ['st. louis',             { lat: 38.6270, lon: -90.1994 }],
  ['st louis, mo',          { lat: 38.6270, lon: -90.1994 }],
  // Tennessee
  ['nashville',             { lat: 36.1627, lon: -86.7816 }],
  ['nashville, tn',         { lat: 36.1627, lon: -86.7816 }],
  ['memphis',               { lat: 35.1495, lon: -90.0490 }],
  ['memphis, tn',           { lat: 35.1495, lon: -90.0490 }],
  // Wisconsin
  ['milwaukee',             { lat: 43.0389, lon: -87.9065 }],
  ['milwaukee, wi',         { lat: 43.0389, lon: -87.9065 }],
  // Indiana
  ['indianapolis',          { lat: 39.7684, lon: -86.1581 }],
  ['indianapolis, in',      { lat: 39.7684, lon: -86.1581 }],
  // Louisiana
  ['new orleans',           { lat: 29.9511, lon: -90.0715 }],
  ['new orleans, la',       { lat: 29.9511, lon: -90.0715 }],
  // Oklahoma
  ['oklahoma city',         { lat: 35.4676, lon: -97.5164 }],
  ['oklahoma city, ok',     { lat: 35.4676, lon: -97.5164 }],
  // Utah
  ['salt lake city',        { lat: 40.7608, lon: -111.8910 }],
  ['salt lake city, ut',    { lat: 40.7608, lon: -111.8910 }],
  ['slc',                   { lat: 40.7608, lon: -111.8910 }],
  // Connecticut
  ['hartford',              { lat: 41.7658, lon: -72.6851 }],
  ['hartford, ct',          { lat: 41.7658, lon: -72.6851 }],
  ['new haven',             { lat: 41.3083, lon: -72.9279 }],
  ['new haven, ct',         { lat: 41.3083, lon: -72.9279 }],
  // New Jersey
  ['newark',                { lat: 40.7357, lon: -74.1724 }],
  ['newark, nj',            { lat: 40.7357, lon: -74.1724 }],
  ['jersey city',           { lat: 40.7178, lon: -74.0431 }],
  ['jersey city, nj',       { lat: 40.7178, lon: -74.0431 }],
  ['hoboken',               { lat: 40.7440, lon: -74.0324 }],
  ['hoboken, nj',           { lat: 40.7440, lon: -74.0324 }],
  // Hawaii
  ['honolulu',              { lat: 21.3069, lon: -157.8583 }],
  ['honolulu, hi',          { lat: 21.3069, lon: -157.8583 }],
  // Alaska
  ['anchorage',             { lat: 61.2181, lon: -149.9003 }],
  ['anchorage, ak',         { lat: 61.2181, lon: -149.9003 }],

  // ── Canada ─────────────────────────────────────────────────────────────────
  ['toronto',               { lat: 43.6532, lon: -79.3832 }],
  ['toronto, on',           { lat: 43.6532, lon: -79.3832 }],
  ['toronto, canada',       { lat: 43.6532, lon: -79.3832 }],
  ['vancouver',             { lat: 49.2827, lon: -123.1207 }],
  ['vancouver, bc',         { lat: 49.2827, lon: -123.1207 }],
  ['vancouver, canada',     { lat: 49.2827, lon: -123.1207 }],
  ['montreal',              { lat: 45.5017, lon: -73.5673 }],
  ['montreal, qc',          { lat: 45.5017, lon: -73.5673 }],
  ['montreal, canada',      { lat: 45.5017, lon: -73.5673 }],
  ['calgary',               { lat: 51.0447, lon: -114.0719 }],
  ['calgary, ab',           { lat: 51.0447, lon: -114.0719 }],
  ['ottawa',                { lat: 45.4215, lon: -75.6972 }],
  ['ottawa, on',            { lat: 45.4215, lon: -75.6972 }],

  // ── United Kingdom ─────────────────────────────────────────────────────────
  ['london',                { lat: 51.5074, lon: -0.1278 }],
  ['london, uk',            { lat: 51.5074, lon: -0.1278 }],
  ['london, england',       { lat: 51.5074, lon: -0.1278 }],
  ['manchester',            { lat: 53.4808, lon: -2.2426 }],
  ['manchester, uk',        { lat: 53.4808, lon: -2.2426 }],
  ['birmingham',            { lat: 52.4862, lon: -1.8904 }],
  ['birmingham, uk',        { lat: 52.4862, lon: -1.8904 }],
  ['edinburgh',             { lat: 55.9533, lon: -3.1883 }],
  ['edinburgh, uk',         { lat: 55.9533, lon: -3.1883 }],
  ['glasgow',               { lat: 55.8642, lon: -4.2518 }],
  ['glasgow, uk',           { lat: 55.8642, lon: -4.2518 }],
  ['bristol',               { lat: 51.4545, lon: -2.5879 }],
  ['bristol, uk',           { lat: 51.4545, lon: -2.5879 }],
  ['leeds',                 { lat: 53.8008, lon: -1.5491 }],
  ['leeds, uk',             { lat: 53.8008, lon: -1.5491 }],

  // ── Europe ─────────────────────────────────────────────────────────────────
  ['berlin',                { lat: 52.5200, lon: 13.4050 }],
  ['berlin, germany',       { lat: 52.5200, lon: 13.4050 }],
  ['munich',                { lat: 48.1351, lon: 11.5820 }],
  ['munich, germany',       { lat: 48.1351, lon: 11.5820 }],
  ['hamburg',               { lat: 53.5753, lon: 10.0153 }],
  ['hamburg, germany',      { lat: 53.5753, lon: 10.0153 }],
  ['frankfurt',             { lat: 50.1109, lon: 8.6821 }],
  ['frankfurt, germany',    { lat: 50.1109, lon: 8.6821 }],
  ['paris',                 { lat: 48.8566, lon: 2.3522 }],
  ['paris, france',         { lat: 48.8566, lon: 2.3522 }],
  ['amsterdam',             { lat: 52.3676, lon: 4.9041 }],
  ['amsterdam, netherlands', { lat: 52.3676, lon: 4.9041 }],
  ['stockholm',             { lat: 59.3293, lon: 18.0686 }],
  ['stockholm, sweden',     { lat: 59.3293, lon: 18.0686 }],
  ['copenhagen',            { lat: 55.6761, lon: 12.5683 }],
  ['copenhagen, denmark',   { lat: 55.6761, lon: 12.5683 }],
  ['oslo',                  { lat: 59.9139, lon: 10.7522 }],
  ['oslo, norway',          { lat: 59.9139, lon: 10.7522 }],
  ['zurich',                { lat: 47.3769, lon: 8.5417 }],
  ['zurich, switzerland',   { lat: 47.3769, lon: 8.5417 }],
  ['dublin',                { lat: 53.3498, lon: -6.2603 }],
  ['dublin, ireland',       { lat: 53.3498, lon: -6.2603 }],
  ['madrid',                { lat: 40.4168, lon: -3.7038 }],
  ['madrid, spain',         { lat: 40.4168, lon: -3.7038 }],
  ['barcelona',             { lat: 41.3851, lon: 2.1734 }],
  ['barcelona, spain',      { lat: 41.3851, lon: 2.1734 }],
  ['lisbon',                { lat: 38.7223, lon: -9.1393 }],
  ['lisbon, portugal',      { lat: 38.7223, lon: -9.1393 }],
  ['warsaw',                { lat: 52.2297, lon: 21.0122 }],
  ['warsaw, poland',        { lat: 52.2297, lon: 21.0122 }],
  ['prague',                { lat: 50.0755, lon: 14.4378 }],
  ['prague, czechia',       { lat: 50.0755, lon: 14.4378 }],

  // ── Asia-Pacific ───────────────────────────────────────────────────────────
  ['tokyo',                 { lat: 35.6762, lon: 139.6503 }],
  ['tokyo, japan',          { lat: 35.6762, lon: 139.6503 }],
  ['osaka',                 { lat: 34.6937, lon: 135.5023 }],
  ['osaka, japan',          { lat: 34.6937, lon: 135.5023 }],
  ['beijing',               { lat: 39.9042, lon: 116.4074 }],
  ['beijing, china',        { lat: 39.9042, lon: 116.4074 }],
  ['shanghai',              { lat: 31.2304, lon: 121.4737 }],
  ['shanghai, china',       { lat: 31.2304, lon: 121.4737 }],
  ['hong kong',             { lat: 22.3193, lon: 114.1694 }],
  ['singapore',             { lat: 1.3521, lon: 103.8198 }],
  ['singapore, singapore',  { lat: 1.3521, lon: 103.8198 }],
  ['sydney',                { lat: -33.8688, lon: 151.2093 }],
  ['sydney, australia',     { lat: -33.8688, lon: 151.2093 }],
  ['melbourne',             { lat: -37.8136, lon: 144.9631 }],
  ['melbourne, australia',  { lat: -37.8136, lon: 144.9631 }],
  ['bangalore',             { lat: 12.9716, lon: 77.5946 }],
  ['bangalore, india',      { lat: 12.9716, lon: 77.5946 }],
  ['bengaluru',             { lat: 12.9716, lon: 77.5946 }],
  ['mumbai',                { lat: 19.0760, lon: 72.8777 }],
  ['mumbai, india',         { lat: 19.0760, lon: 72.8777 }],
  ['delhi',                 { lat: 28.7041, lon: 77.1025 }],
  ['delhi, india',          { lat: 28.7041, lon: 77.1025 }],
  ['hyderabad',             { lat: 17.3850, lon: 78.4867 }],
  ['hyderabad, india',      { lat: 17.3850, lon: 78.4867 }],
  ['pune',                  { lat: 18.5204, lon: 73.8567 }],
  ['pune, india',           { lat: 18.5204, lon: 73.8567 }],
  ['seoul',                 { lat: 37.5665, lon: 126.9780 }],
  ['seoul, south korea',    { lat: 37.5665, lon: 126.9780 }],
  ['tel aviv',              { lat: 32.0853, lon: 34.7818 }],
  ['tel aviv, israel',      { lat: 32.0853, lon: 34.7818 }],

  // ── South America ──────────────────────────────────────────────────────────
  ['sao paulo',             { lat: -23.5505, lon: -46.6333 }],
  ['são paulo',             { lat: -23.5505, lon: -46.6333 }],
  ['rio de janeiro',        { lat: -22.9068, lon: -43.1729 }],
  ['buenos aires',          { lat: -34.6037, lon: -58.3816 }],
  ['bogota',                { lat: 4.7110, lon: -74.0721 }],
  ['santiago',              { lat: -33.4489, lon: -70.6693 }],
  ['lima',                  { lat: -12.0464, lon: -77.0428 }],
]

// Build a fast lookup map
const LOOKUP_MAP = new Map<string, LatLon>(FALLBACK_DB)

// ─── State abbreviation expansions for US city matching ──────────────────────
const STATE_ABBR: Record<string, string> = {
  al:'alabama', ak:'alaska', az:'arizona', ar:'arkansas', ca:'california',
  co:'colorado', ct:'connecticut', de:'delaware', fl:'florida', ga:'georgia',
  hi:'hawaii', id:'idaho', il:'illinois', in:'indiana', ia:'iowa',
  ks:'kansas', ky:'kentucky', la:'louisiana', me:'maine', md:'maryland',
  ma:'massachusetts', mi:'michigan', mn:'minnesota', ms:'mississippi',
  mo:'missouri', mt:'montana', ne:'nebraska', nv:'nevada', nh:'new hampshire',
  nj:'new jersey', nm:'new mexico', ny:'new york', nc:'north carolina',
  nd:'north dakota', oh:'ohio', ok:'oklahoma', or:'oregon', pa:'pennsylvania',
  ri:'rhode island', sc:'south carolina', sd:'south dakota', tn:'tennessee',
  tx:'texas', ut:'utah', vt:'vermont', va:'virginia', wa:'washington',
  wv:'west virginia', wi:'wisconsin', wy:'wyoming', dc:'district of columbia',
}

/**
 * Attempts to find approximate lat/lon for a location string using the
 * hardcoded fallback database.
 *
 * Tries in order:
 *   1. Exact normalised match
 *   2. First token before a comma (city only)
 *   3. After stripping state/country suffixes
 *
 * Returns null if no match is found.
 * The caller must NOT cache this result to disk.
 */
export function lookupCityFallback(locationText: string): LatLon | null {
  const normalized = locationText.trim().toLowerCase()
  if (!normalized) return null

  // 1. Direct match
  const direct = LOOKUP_MAP.get(normalized)
  if (direct) return direct

  // 2. If the text has a comma, try "city, state-abbr" then "city" alone
  const commaIdx = normalized.indexOf(',')
  if (commaIdx > 0) {
    const city = normalized.slice(0, commaIdx).trim()
    const suffix = normalized.slice(commaIdx + 1).trim()

    // Try "city, abbr" as a key
    const withAbbr = `${city}, ${suffix}`
    const byAbbr = LOOKUP_MAP.get(withAbbr)
    if (byAbbr) return byAbbr

    // Try city name alone
    const byCity = LOOKUP_MAP.get(city)
    if (byCity) return byCity

    // Expand state abbreviation and try "city, full-state-name"
    const fullState = STATE_ABBR[suffix]
    if (fullState) {
      const withFull = `${city}, ${fullState}`
      const byFull = LOOKUP_MAP.get(withFull)
      if (byFull) return byFull
    }
  }

  // 3. Try the whole string as city-only (handles "San Francisco, California, US")
  const firstToken = normalized.split(',')[0].trim()
  if (firstToken !== normalized) {
    const byFirstToken = LOOKUP_MAP.get(firstToken)
    if (byFirstToken) return byFirstToken
  }

  return null
}
