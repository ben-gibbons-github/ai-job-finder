function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, ' ');
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function deriveDescriptionFromContext(
  contextHtml: string,
  title?: string,
  maxLength = 280,
): string {
  let text = normalizeWhitespace(stripHtml(String(contextHtml ?? '')));
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
