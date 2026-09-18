import { describe, it, expect, beforeEach, vi } from 'vitest';

const { strategyMock, cacheStore, saveSpy } = vi.hoisted(() => ({
  strategyMock: vi.fn(),
  cacheStore: { raw: '{}' },
  saveSpy: vi.fn(),
}));

vi.mock('./CacheHandler.js', () => ({
  CacheHandler: class {
    async loadWithFallback<T>(parse: (raw: string, sourcePath: string) => T | Promise<T>): Promise<T> {
      return parse(cacheStore.raw, 'memory://locations.json');
    }

    async save(raw: string): Promise<void> {
      saveSpy(raw);
      cacheStore.raw = raw;
    }
  },
}));

vi.mock('./NameToLonLat/NameToLonLatStrategies.js', () => ({
  geocodingStrategies: [strategyMock],
}));

import { nameToLonLat, clearLocationCache, getCacheSize } from './NameToLonLat.js';
import { cacheLocation, getCachedLocation } from './NameToLonLatCache.js';
import { computeServerDebugCoverageStats } from './debugStats/DebugStats.js';

describe('NameToLonLat', () => {
  beforeEach(() => {
    clearLocationCache();
    cacheStore.raw = '{}';
    vi.clearAllMocks();
    strategyMock.mockReset();
  });

  describe('nameToLonLat', () => {
    it('should return coordinates for a valid location', async () => {
      strategyMock.mockResolvedValueOnce({ lat: 51.5074, lon: -0.1278 });

      const result = await nameToLonLat('London');
      expect(result).toEqual({ lat: 51.5074, lon: -0.1278 });
    });

    it('should cache results to avoid repeated API calls', async () => {
      strategyMock.mockResolvedValueOnce({ lat: 48.8566, lon: 2.3522 });

      await nameToLonLat('Paris');
      await nameToLonLat('Paris');

      expect(strategyMock).toHaveBeenCalledTimes(1);
    });

    it('should normalize location names for cache lookup', async () => {
      strategyMock.mockResolvedValueOnce({ lat: 35.6762, lon: 139.6503 });

      await nameToLonLat('Tokyo');
      await nameToLonLat('  TOKYO  ');

      expect(strategyMock).toHaveBeenCalledTimes(1);
    });

    it('should clean and lowercase locations before geocoding and cache lookup', async () => {
      strategyMock.mockResolvedValueOnce({ lat: 37.7749, lon: -122.4194 });

      await nameToLonLat('  <San>   Francisco {CA}  ');
      await nameToLonLat('san francisco ca');

      expect(strategyMock).toHaveBeenCalledTimes(1);
      expect(strategyMock).toHaveBeenCalledWith('san francisco ca');
    });

    it('should throw error when location not found', async () => {
      strategyMock.mockRejectedValueOnce(new Error('No results found for location: InvalidLocation123'));

      await expect(nameToLonLat('InvalidLocation123')).rejects.toThrow(
        'Failed to geocode location "InvalidLocation123" with all providers: No results found for location: InvalidLocation123'
      );
    });

    it('should throw error on API failure', async () => {
      strategyMock.mockRejectedValueOnce(new Error('Network error'));

      await expect(nameToLonLat('AnyLocation')).rejects.toThrow(
        'Failed to geocode location "AnyLocation" with all providers: Network error'
      );
    });
  });

  describe('clearLocationCache', () => {
    it('should clear all cached locations', async () => {
      strategyMock.mockResolvedValue({ lat: 0, lon: 0 });

      await nameToLonLat('Location1');
      await nameToLonLat('Location2');
      expect(getCacheSize()).toBe(2);

      clearLocationCache();
      expect(getCacheSize()).toBe(0);
    });
  });

  describe('getCacheSize', () => {
    it('should return 0 for empty cache', () => {
      expect(getCacheSize()).toBe(0);
    });

    it('should return correct cache size', async () => {
      strategyMock.mockResolvedValue({ lat: 0, lon: 0 });

      await nameToLonLat('Location1');
      expect(getCacheSize()).toBe(1);

      await nameToLonLat('Location2');
      expect(getCacheSize()).toBe(2);
    });
  });

  describe('location cache keys', () => {
    it('normalizes capitalization and unusual characters at the cache boundary', () => {
      cacheLocation('  <San> Francisco {CA}  ', { lat: 37.7749, lon: -122.4194 });

      expect(getCachedLocation('SAN FRANCISCO CA')).toEqual({ lat: 37.7749, lon: -122.4194 });
    });

    it('debounces persistence so a new cache entry does not block the request path', async () => {
      vi.useFakeTimers();
      try {
        cacheLocation('  <San> Francisco {CA}  ', { lat: 37.7749, lon: -122.4194 });

        expect(saveSpy).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(250);
        expect(saveSpy).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('computeServerDebugCoverageStats', () => {
    it('reports AI coverage by unique company as well as by job', () => {
      const jobs = [
        { company_name: 'Acme', audit_number: 80, impact_number: 70 },
        { company_name: ' acme ', audit_number: 90 },
        { company_name: 'Beta', scrapedEmployer: { employeeQualityOfLifeScore: 60 } },
        { company_name: 'Gamma' },
      ] as any[];

      const stats = computeServerDebugCoverageStats(jobs, {} as any);

      expect(stats.withAuditScoreCount).toBe(2);
      expect(stats.withAuditCompanyCount).toBe(1);
      expect(stats.withAuditCompanyPct).toBe(33.3);
      expect(stats.withImpactCompanyCount).toBe(1);
      expect(stats.withImpactCompanyPct).toBe(33.3);
      expect(stats.withQolCompanyCount).toBe(1);
      expect(stats.withQolCompanyPct).toBe(33.3);
    });

    it('reports the percentage of jobs missing descriptions', () => {
      const jobs = [
        { description: 'Great role', source: 'A', company_name: 'Acme' },
        { description: '   ', source: 'B', company_name: 'Beta' },
        { description: '', source: 'C', company_name: 'Gamma' },
        { source: 'D', company_name: 'Delta' },
      ] as any[];

      const stats = computeServerDebugCoverageStats(jobs, {
        jobsFromCacheCount: 0,
        jobsFromCachePct: 0,
        jobsFromSourceCount: 4,
        jobsFromSourcePct: 100,
        cacheSources: [],
        sourceSources: [],
        urlCache: {
          totalLookups: 0,
          hits: 0,
          hitPct: 0,
          misses: 0,
          missPct: 0,
          hitSources: [],
          missSources: [],
        },
        scraperUrlTraversal: [],
        pageJobCounts: [],
      });

      expect(stats.missingDescriptionCount).toBe(3);
      expect(stats.missingDescriptionPct).toBe(75);
    });
  });
});
