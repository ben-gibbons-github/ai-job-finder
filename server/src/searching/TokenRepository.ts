import { FILLER_TOKENS } from './FillerTokens.js'

const tokenIds = new Map<string, number>()
const tokenValues: string[] = []

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !FILLER_TOKENS.has(token))
}

export function internToken(token: string): number {
  const normalized = token.toLowerCase()
  const existing = tokenIds.get(normalized)
  if (existing !== undefined) return existing

  const id = tokenValues.length
  tokenIds.set(normalized, id)
  tokenValues.push(normalized)
  return id
}

export function internTokens(text: string): number[] {
  return tokenize(text).map(internToken)
}

export function lookupToken(token: string): number {
  return tokenIds.get(token.toLowerCase()) ?? -1
}

export function getTokenRepositorySize(): number {
  return tokenValues.length
}
