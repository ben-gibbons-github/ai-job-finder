import { describe, expect, it } from 'vitest'
import type { ScrapedJob } from '../scraping/core/ScrapedJob.js'
import {
  buildUnifiedCompanyAiPrompt,
  getEffectiveUnifiedCompanyAiScores,
  getUnifiedScoreOffsets,
  parseUnifiedCompanyAiResponse,
  UNIFIED_COMPANY_AI_PROMPT_VERSION,
} from './SearchCompanyAiUnified.js'

function makeJob(): ScrapedJob {
  return {
    name: 'Software Engineer',
    company_name: 'Example Company',
    location: 'Unknown',
    remote: 'Unknown',
    location_lon: 0,
    location_lat: 0,
    description: 'Build useful software.',
    type: 'Full-time',
    source: 'Test',
    source_url: 'https://example.com/job',
    posted: '2026-08-18',
    impact_number: 0,
    audit_number: 0,
    audit_text: '',
    tags: [],
  }
}

describe('unified company AI location fallback', () => {
  it('requests location_fallback in prompt version 7.0', () => {
    const prompt = buildUnifiedCompanyAiPrompt(makeJob())

    expect(UNIFIED_COMPANY_AI_PROMPT_VERSION).toBe('7.0')
    expect(prompt).toContain('"location_fallback": "string"')
    expect(prompt).toContain('where this specific job can be performed')
  })

  it('parses location_fallback from a new response', () => {
    const parsed = parseUnifiedCompanyAiResponse(JSON.stringify({
      location_fallback: 'Toronto, Ontario, Canada',
      audit: { summary: 'Summary', companyQuality: 75, redFlags: 10 },
      impact: { impactSummary: 'Impact', impactScore: 60 },
      qualityOfLife: { employeeQualityOfLifeSummary: 'QoL', employeeQualityOfLifeScore: 70 },
    }))

    expect(parsed?.location_fallback).toBe('Toronto, Ontario, Canada')
  })

  it('accepts legacy responses without location_fallback', () => {
    const parsed = parseUnifiedCompanyAiResponse(JSON.stringify({
      audit: { summary: 'Legacy summary', companyQuality: 70, redFlags: 20 },
      impact: { impactSummary: 'Legacy impact', impactScore: 50 },
      qualityOfLife: { employeeQualityOfLifeSummary: 'Legacy QoL', employeeQualityOfLifeScore: 60 },
    }))

    expect(parsed?.location_fallback).toBe('')
  })

  it('applies configured score offsets for prompt version 7.0', () => {
    const employer = {
      name: 'Example Company',
      ai_summary: 'Summary',
      ai_red_flag_summary: 'Red flags',
      ai_score: 70,
      ai_red_flag_score: 25,
      ai_impact_summary: 'Impact',
      ai_impact_score: 60,
      employeeQualityOfLifeSummary: 'QoL',
      employeeQualityOfLifeScore: 50,
      promptVersion: '7.0',
    }

    expect(getUnifiedScoreOffsets('7.0')).toEqual({
      audit: 2,
      impact: 5,
      qualityOfLife: 10,
    })

    expect(getEffectiveUnifiedCompanyAiScores(employer)).toMatchObject({
      promptVersion: '7.0',
      auditScore: 72,
      redFlagScore: 25,
      impactScore: 65,
      qualityOfLifeScore: 60,
      offsets: {
        audit: 2,
        impact: 5,
        qualityOfLife: 10,
      },
    })
  })

  it('does not apply score offsets for non-7.0 prompt versions', () => {
    const employer = {
      name: 'Legacy Company',
      ai_summary: 'Summary',
      ai_red_flag_summary: 'Red flags',
      ai_score: 42,
      ai_red_flag_score: 30,
      ai_impact_summary: 'Impact',
      ai_impact_score: 33,
      employeeQualityOfLifeSummary: 'QoL',
      employeeQualityOfLifeScore: 25,
      promptVersion: '6.0',
    }

    expect(getUnifiedScoreOffsets('6.0')).toEqual({
      audit: 0,
      impact: 0,
      qualityOfLife: 0,
    })

    expect(getEffectiveUnifiedCompanyAiScores(employer)).toMatchObject({
      promptVersion: '6.0',
      auditScore: 42,
      redFlagScore: 30,
      impactScore: 33,
      qualityOfLifeScore: 25,
    })
  })
})