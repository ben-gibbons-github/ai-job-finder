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

function truncate(text: string, maxLength: number): string {
  if (maxLength <= 0 || text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength).trim()}...`;
}

function collectJsonLdDescriptions(html: string): string[] {
  const found: string[] = [];
  const scriptPattern = /<script[^>]*type=["']application\/ld(?:\+|&#x2B;)json["'][^>]*>([\s\S]*?)<\/script>/gi;

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }
    if (!value || typeof value !== 'object') {
      return;
    }

    const obj = value as Record<string, unknown>;
    if (typeof obj.description === 'string') {
      const text = sanitizeJobDescription(obj.description);
      if (text) {
        found.push(text);
      }
    }
    for (const nested of Object.values(obj)) {
      visit(nested);
    }
  };

  for (const match of html.matchAll(scriptPattern)) {
    const raw = (match[1] || '').trim();
    if (!raw) {
      continue;
    }
    try {
      visit(JSON.parse(raw));
    } catch {
      // Ignore malformed JSON-LD blocks.
    }
  }

  return found;
}

const DESCRIPTION_CONTAINER_PATTERNS: RegExp[] = [
  /<div[^>]*(?:id|class|data-testid)=["'][^"']*job[-_]?description[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
  /<section[^>]*(?:id|class|data-testid)=["'][^"']*(?:job[-_]?description|description)[^"']*["'][^>]*>([\s\S]*?)<\/section>/i,
  /<div[^>]*(?:id|class)=["'][^"']*(?:content-intro|job[-_]?post|posting|vacancy)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
  /<article[^>]*>([\s\S]*?)<\/article>/i,
  /<main[^>]*>([\s\S]*?)<\/main>/i,
];

function collectContainerDescriptions(html: string): string[] {
  const found: string[] = [];
  for (const pattern of DESCRIPTION_CONTAINER_PATTERNS) {
    const match = html.match(pattern);
    const text = sanitizeJobDescription(match?.[1] || '');
    if (text) {
      found.push(text);
    }
  }
  return found;
}

function collectMetaDescriptions(html: string): string[] {
  const found: string[] = [];
  const metaPatterns = [
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
  ];

  for (const pattern of metaPatterns) {
    const match = html.match(pattern);
    const text = sanitizeJobDescription(match?.[1] || '');
    if (text) {
      found.push(text);
    }
  }
  return found;
}

/** Pulls the best job description text out of a detail page, preferring structured sources. */
export function extractDescriptionFromHtml(
  html: string,
  title?: string,
  maxLength = 2000,
): string {
  const raw = String(html ?? '');
  if (!raw.trim()) {
    return '';
  }

  const normalizedTitle = normalizeWhitespace(String(title ?? ''));
  const stripTitle = (text: string): string => {
    if (!normalizedTitle) {
      return text;
    }
    return normalizeWhitespace(text.replace(new RegExp(escapeRegExp(normalizedTitle), 'i'), ' '));
  };

  const candidates = [
    ...collectJsonLdDescriptions(raw),
    ...collectContainerDescriptions(raw),
  ]
    .map(stripTitle)
    .filter((text) => text.length >= 40);

  if (candidates.length > 0) {
    const best = candidates.reduce((longest, text) => (text.length > longest.length ? text : longest));
    return truncate(best, maxLength);
  }

  const metaCandidates = collectMetaDescriptions(raw)
    .map(stripTitle)
    .filter((text) => text.length >= 40);
  if (metaCandidates.length > 0) {
    const best = metaCandidates.reduce((longest, text) => (text.length > longest.length ? text : longest));
    return truncate(best, maxLength);
  }

  return deriveDescriptionFromContext(raw, title, maxLength);
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
