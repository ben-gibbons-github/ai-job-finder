import { describe, expect, it } from 'vitest'
import type { ScrapedJob } from '../scraping/core/ScrapedJob.js'
import { calculateLocationScore, getLocationScoreDebugInfo, parseJobLocations } from './searchDistance/SearchDistance.js'

function makeJob(overrides: Partial<ScrapedJob> = {}): ScrapedJob {
  return {
    name: 'Test job',
    company_name: 'Test company',
    location: 'Unknown',
    remote: 'No',
    location_lon: -122.4194,
    location_lat: 37.7749,
    description: 'On-site role in San Francisco',
    type: 'Full-time',
    source: 'Test',
    source_url: 'https://example.com/job',
    posted: '2026-08-18',
    impact_number: 0,
    audit_number: 0,
    audit_text: '',
    tags: [],
    ...overrides,
  }
}

function makeEmployer(location_fallback?: string): NonNullable<ScrapedJob['scrapedEmployer']> {
  return {
    name: 'Test company',
    ai_summary: '',
    ai_red_flag_summary: '',
    ai_score: 0,
    ai_red_flag_score: 0,
    ai_impact_summary: '',
    ai_impact_score: 0,
    employeeQualityOfLifeScore: 0,
    employeeQualityOfLifeSummary: '',
    location_fallback,
  }
}

describe('calculateLocationScore', () => {
  it('keeps a single location unchanged', () => {
    expect(parseJobLocations('San Francisco, CA')).toEqual(['San Francisco, CA'])
  })

  it('applies a trailing shared country to multiple semicolon-delimited locations', () => {
    expect(parseJobLocations('Austin; New York; New York City; San Francisco; United States')).toEqual([
      'Austin, United States',
      'New York, United States',
      'New York City, United States',
      'San Francisco, United States',
    ])
  })

  it('scores a multi-location job using the listed location nearest the user', () => {
    const job = makeJob({
      location: 'Austin; New York; San Francisco; United States',
      location_lat: 30.2672,
      location_lon: -97.7431,
      location_coordinates: [
        { label: 'Austin, United States', lat: 30.2672, lon: -97.7431 },
        { label: 'New York, United States', lat: 40.7128, lon: -74.006 },
        { label: 'San Francisco, United States', lat: 37.7749, lon: -122.4194 },
      ],
      description: 'On-site role',
    })

    expect(getLocationScoreDebugInfo(40.7128, -74.006, job, 'New York, United States')).toMatchObject({
      jobLat: 40.7128,
      jobLon: -74.006,
      matchedLocation: 'New York, United States',
      distanceKm: 0,
      locationScore: 1,
      jobCountry: 'united states',
      countryPenalty: 'None',
    })
  })

  it('uses the nearest location country when a job lists locations in multiple countries', () => {
    const job = makeJob({
      location: 'Toronto, Canada; New York, United States',
      location_lat: 43.6532,
      location_lon: -79.3832,
      location_coordinates: [
        { label: 'Toronto, Canada', lat: 43.6532, lon: -79.3832 },
        { label: 'New York, United States', lat: 40.7128, lon: -74.006 },
      ],
      description: 'On-site role',
    })

    expect(getLocationScoreDebugInfo(40.7128, -74.006, job, 'New York, United States')).toMatchObject({
      matchedLocation: 'New York, United States',
      jobCountry: 'united states',
      countryPenalty: 'None',
      locationScore: 1,
    })
  })

  it('supports a remote job when the user country appears anywhere in its location list', () => {
    const job = makeJob({
      location: 'Toronto, Canada; New York, United States',
      remote: 'Remote',
      description: 'Remote role',
    })

    expect(getLocationScoreDebugInfo(40.7128, -74.006, job, 'New York, United States')).toMatchObject({
      jobCountry: 'united states',
      countryPenalty: 'None',
      locationScore: 1,
    })
  })

  it('matches one listed location before background coordinates are available', () => {
    const job = makeJob({
      location: 'Austin; New York; New York City; San Francisco; United States',
      location_lat: 0,
      location_lon: 0,
      description: 'On-site role',
    })

    expect(getLocationScoreDebugInfo(null, null, job, 'New York, United States')).toMatchObject({
      matchedLocation: 'New York, United States',
      jobCountry: 'united states',
      countryPenalty: 'None',
      distanceKm: null,
      locationScore: 0.6,
      calculation: 'Coordinate lookup unavailable; listed location "New York, United States" matches the user location, giving score = 0.6000.',
    })
  })

  it('scores an unknown-location non-remote job as zero even with usable coordinates', () => {
    const job = makeJob()

    expect(calculateLocationScore(37.7749, -122.4194, job, 'San Francisco, CA')).toBe(0)
    expect(getLocationScoreDebugInfo(37.7749, -122.4194, job, 'San Francisco, CA')).toMatchObject({
      distanceKm: null,
      locationScore: 0,
      calculation: 'Non-remote job has an unknown location: score = 0.0000.',
    })
  })

  it('hard-zeros location score when location and remote are both unknown, even with an AI fallback location', () => {
    const job = makeJob({
      location: 'Unkown',
      remote: 'Unknown',
      location_lat: 0,
      location_lon: 0,
      description: 'Generalist role',
      scrapedEmployer: makeEmployer('Toronto, Ontario, Canada'),
    })

    expect(calculateLocationScore(40.7128, -74.006, job, 'New York, United States')).toBe(0)
    expect(getLocationScoreDebugInfo(40.7128, -74.006, job, 'New York, United States')).toMatchObject({
      locationScore: 0,
      calculation: 'Location and remote are both unknown: score = 0.0000.',
    })
  })

  it('keeps the unknown-country remote override for an unknown-location remote job', () => {
    const job = makeJob({ remote: 'Remote' })

    expect(calculateLocationScore(37.7749, -122.4194, job, 'San Francisco, CA')).toBe(0.95)
  })

  it('scores a remote job in a different known country at 0.60', () => {
    const job = makeJob({
      location: 'Toronto, Canada',
      remote: 'Remote',
      description: 'Remote role for candidates in Canada',
    })

    expect(calculateLocationScore(40.7128, -74.006, job, 'New York, United States')).toBe(0.6)
    expect(getLocationScoreDebugInfo(40.7128, -74.006, job, 'New York, United States')).toMatchObject({
      distanceKm: null,
      jobCountry: 'canada',
      userCountry: 'united states',
      countryPenalty: 'Remote different-country override: score = 0.60',
      locationScore: 0.6,
      calculation: 'Remote job country (canada) differs from user country (united states): score = 0.6000.',
    })
  })

  it('cuts a non-remote location score by 50% when countries differ', () => {
    const job = makeJob({
      location: 'Toronto, Canada',
      remote: 'No',
      location_lat: 43.6532,
      location_lon: -79.3832,
      description: 'On-site role in Canada',
    })
    const info = getLocationScoreDebugInfo(40.7128, -74.006, job, 'New York, United States')
    const distanceKm = info.distanceKm ?? 0
    const unadjustedScore = Math.max(0, Math.min(1, (100 - Math.sqrt(distanceKm)) / 100))
    const finalScore = calculateLocationScore(40.7128, -74.006, job, 'New York, United States')

    expect(info.locationScore).toBeCloseTo(unadjustedScore * 0.5)
    expect(finalScore).toBeCloseTo(unadjustedScore * 0.5)
    expect(finalScore).toBeCloseTo(info.locationScore)
    expect(info).toMatchObject({
      jobCountry: 'canada',
      userCountry: 'united states',
      countryPenalty: '50% reduction',
    })
    expect(info.calculation).toContain('cut by 50%')
  })

  it('keeps a remote job in the same known country at 1.00', () => {
    const job = makeJob({
      location: 'Toronto, Canada',
      remote: 'Remote',
      description: 'Remote role for candidates in Canada',
    })

    expect(calculateLocationScore(43.6532, -79.3832, job, 'Ottawa, Canada')).toBe(1)
  })

  it.each([
    'Atlanta, GA',
    'Wausau, WI',
    'Chicago, IL',
    'Austin, TX',
  ])('detects a US country from the state abbreviation in %s', (location) => {
    const job = makeJob({ location, description: 'On-site role' })

    expect(getLocationScoreDebugInfo(19.4326, -99.1332, job, 'Mexico')).toMatchObject({
      jobCountry: 'united states',
      userCountry: 'mexico',
      countryPenalty: '50% reduction',
    })
  })

  it('prioritizes an explicit Mexico location over the word us in the description', () => {
    const job = makeJob({
      location: 'Mexico',
      description: 'Join us to build software for customers.',
    })

    expect(getLocationScoreDebugInfo(19.4326, -99.1332, job, 'Mexico')).toMatchObject({
      jobCountry: 'mexico',
      userCountry: 'mexico',
      countryPenalty: 'None',
    })
  })

  it('detects a US search country from a state abbreviation', () => {
    const job = makeJob({ location: 'Toronto, Canada', description: 'On-site role' })

    expect(getLocationScoreDebugInfo(33.749, -84.388, job, 'Atlanta, GA')).toMatchObject({
      jobCountry: 'canada',
      userCountry: 'united states',
      countryPenalty: '50% reduction',
    })
  })

  it('detects Poland from its native country name in mixed-script search text', () => {
    const job = makeJob({ location: 'Berlin, Germany', description: 'On-site role' })

    expect(getLocationScoreDebugInfo(null, null, job, 'San-Сян, Polska')).toMatchObject({
      jobCountry: 'germany',
      userCountry: 'poland',
      countryPenalty: '50% reduction',
    })
  })

  it.each([
    ['Remote | Cambridgeshire', 'united kingdom'],
    ['Remote | Reading', 'united kingdom'],
    ['Remote | Brussels', 'belgium'],
  ])('detects the country from the regional location %s', (location, jobCountry) => {
    const job = makeJob({ location, remote: 'Remote', description: 'Remote role' })

    expect(getLocationScoreDebugInfo(40.7128, -74.006, job, 'New York, United States')).toMatchObject({
      jobCountry,
      userCountry: 'united states',
      countryPenalty: 'Remote different-country override: score = 0.60',
      locationScore: 0.6,
    })
  })

  it('prioritizes a US state abbreviation over the plain Reading location hint', () => {
    const job = makeJob({ location: 'Reading, PA', description: 'On-site role' })

    expect(getLocationScoreDebugInfo(40.7128, -74.006, job, 'New York, United States')).toMatchObject({
      jobCountry: 'united states',
      userCountry: 'united states',
      countryPenalty: 'None',
    })
  })

  it('uses the AI fallback when the original job location is unknown', () => {
    const job = makeJob({
      location: 'Unknown',
      location_lat: 0,
      location_lon: 0,
      description: 'On-site role',
      scrapedEmployer: makeEmployer('Toronto, Ontario, Canada'),
    })
    const info = getLocationScoreDebugInfo(40.7128, -74.006, job, 'New York, United States')

    expect(info).toMatchObject({
      jobLat: null,
      jobLon: null,
      locationFallback: 'Toronto, Ontario, Canada',
      jobCountry: 'canada',
      userCountry: 'united states',
      countryPenalty: '50% reduction',
    })
    expect(info.calculation).not.toContain('unknown location')
  })

  it('keeps the original location country when an AI fallback disagrees', () => {
    const job = makeJob({
      location: 'Mexico',
      description: 'On-site role',
      scrapedEmployer: makeEmployer('Austin, Texas, United States'),
    })

    expect(getLocationScoreDebugInfo(19.4326, -99.1332, job, 'Mexico')).toMatchObject({
      jobCountry: 'mexico',
      userCountry: 'mexico',
      countryPenalty: 'None',
    })
  })
})