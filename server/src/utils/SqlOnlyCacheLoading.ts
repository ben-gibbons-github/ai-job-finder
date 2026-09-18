export function isSqlOnlyCacheLoadingEnabled(): boolean {
  return process.env.SQL_ONLY_CACHE_LOADING === '1'
    || process.env.SQL_ONLY_CACHE_LOADING === 'true'
}