export function toSafeText(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }
  return String(value).toLowerCase()
}

export function containsAlias(text: string, alias: string): boolean {
  const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z])${escapedAlias}([^a-z]|$)`, 'i').test(text)
}
