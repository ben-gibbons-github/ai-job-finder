export class RateLimitedScrapeError extends Error {
  status: number;
  url: string;
  method: string;

  constructor(status: number, url: string, method: string) {
    super(`Rate limited (${status}) for ${method} ${url}`);
    this.name = 'RateLimitedScrapeError';
    this.status = status;
    this.url = url;
    this.method = method;
  }
}

export function isRateLimitedScrapeError(error: unknown): error is RateLimitedScrapeError {
  return error instanceof RateLimitedScrapeError;
}

export function hasRateLimitErrorMessage(value: string | undefined): boolean {
  return /Rate limited \(|RateLimitedScrapeError/i.test(value || '');
}

export function isRateLimitedStatus(status: number): boolean {
  return status === 429 || status === 403;
}
