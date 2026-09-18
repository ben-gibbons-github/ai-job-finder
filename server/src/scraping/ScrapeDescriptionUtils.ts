function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  bull: '•',
  gt: '>',
  hellip: '...',
  ldquo: '“',
  lsquo: '‘',
  lt: '<',
  mdash: '—',
  nbsp: ' ',
  ndash: '–',
  quot: '"',
  rdquo: '”',
  rsquo: '’',
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z][a-z\d]+);/gi, (entity, code: string) => {
    if (code.startsWith('#x')) {
      return String.fromCodePoint(Number.parseInt(code.slice(2), 16))
    }
    if (code.startsWith('#')) {
      return String.fromCodePoint(Number.parseInt(code.slice(1), 10))
    }
    return HTML_ENTITIES[code.toLowerCase()] ?? ' '
  })
}

export function sanitizeJobDescription(value: unknown): string {
  let text = String(value ?? '')
  for (let pass = 0; pass < 2; pass += 1) {
    text = decodeHtmlEntities(text)
  }

  return normalizeWhitespace(
    text
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--([\s\S]*?)-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\u00a0/g, ' '),
  )
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function deriveDescriptionFromContext(
  contextHtml: string,
  title?: string,
  maxLength = 280,
): string {
  let text = sanitizeJobDescription(contextHtml);
  if (!text) {
    return '';
  }

  const normalizedTitle = normalizeWhitespace(String(title ?? ''));
  if (normalizedTitle.length > 0) {
    const titlePattern = new RegExp(escapeRegExp(normalizedTitle), 'i');
    text = normalizeWhitespace(text.replace(titlePattern, ' '));
  }

  text = normalizeWhitespace(
    text
      .replace(/\b(save|saved jobs?|job alerts?|browse jobs?|view all jobs?|sign in|register|apply by)\b/gi, ' ')
      .replace(/\b(location|company|employer)\s*:/gi, ' '),
  );

  if (text.length < 24) {
    return '';
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength).trim()}...`;
}
