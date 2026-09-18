export function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function titleCaseWord(value: string): string {
  if (!value) {
    return value
  }
  return value[0].toUpperCase() + value.slice(1).toLowerCase()
}

export function splitTitleWords(title: string): string[] {
  const matches = title.match(/[A-Za-z0-9][A-Za-z0-9+#./'’-]*/g) ?? []
  return matches
    .map((word) => word.trim())
    .filter((word) => word.length >= 2)
}
