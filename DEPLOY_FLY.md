# Deploy to Fly.io (Single App: Client + Server)

This repo is configured so one Fly app serves:
- Express + Socket.IO API from `server/dist`
- Vite-built client static files from `client/dist`

## 1) Prerequisites

- Install Fly CLI: `brew install flyctl` (macOS) or see Fly docs.
- Login: `fly auth login`

## 2) Prepare app name

`fly.toml` currently uses:
- `app = "job-finder-super"`

If that name is taken, update `fly.toml` to a unique name.

## 3) Create app + volume

From repo root:

```bash
cd /Users/8s/Documents/code/web/job_finder_super
fly launch --no-deploy
fly volumes create cache_data --region iad --size 5
```

## 4) Set required secrets

```bash
fly secrets set \
  GEMINI_API_KEY=... \
  CLIENT_ORIGIN=https://<your-fly-app>.fly.dev \
  CACHE_SEED_MODE=overwrite \
  CLIMATEBASE_ALGOLIA_API_KEY=... \
  ESCAPE_THE_CITY_ALGOLIA_API_KEY=... \
  EIGHTYK_HOURS_ALGOLIA_API_KEY=... \
  GEOAPIFY_API_KEY=... \
  MAPQUEST_API_KEY=... \
  INDEED_RSS_LOCATION=United\ States \
  CRAIGSLIST_CATEGORIES=jjj \
  USAJOBS_API_KEY=... \
  USAJOBS_USER_AGENT_EMAIL=you@example.com \
  ADZUNA_APP_ID=... \
  ADZUNA_APP_KEY=... \
  JOOBLE_API_KEY=... \
  REED_API_KEY=... \
  ASHBY_FEED_ENDPOINTS=... \
  AUDIT_ALL_MAX_CONCURRENCY=4 \
  AUDIT_ALL_MAX_JOBS=250 \
  SHUTDOWN_TIMEOUT_MS=10000 \
  SOCKET_RATE_LIMIT_HELLO_CAPACITY=10 \
  SOCKET_RATE_LIMIT_HELLO_LEAK_PER_SECOND=2 \
  SOCKET_RATE_LIMIT_SEARCH_CAPACITY=20 \
  SOCKET_RATE_LIMIT_SEARCH_LEAK_PER_SECOND=1.5 \
  SOCKET_RATE_LIMIT_AUDIT_ALL_CAPACITY=2 \
  SOCKET_RATE_LIMIT_AUDIT_ALL_LEAK_PER_SECOND=0.03 \
  SOCKET_RATE_LIMIT_LOCATION_CAPACITY=25 \
  SOCKET_RATE_LIMIT_LOCATION_LEAK_PER_SECOND=3 \
  SOCKET_RATE_LIMIT_JOB_AUDIT_CAPACITY=8 \
  SOCKET_RATE_LIMIT_JOB_AUDIT_LEAK_PER_SECOND=0.4
```

## 5) Deploy

```bash
fly deploy
```

## 6) Verify

```bash
fly status
fly logs
curl https://<your-fly-app>.fly.dev/api/hello
```

Then open `https://<your-fly-app>.fly.dev` and verify:
- search results load
- location dropdown lookup works
- job audit emits result events

## Notes

- Client socket URL uses `VITE_SERVER_URL` when provided, otherwise same-origin in production.
- This deploy path uses same-origin, so no extra client env variable is required.
- Cache data persists on mounted volume at `/app/server/cache`.
- Cache seed files are bundled at `/app/server/cache_seed` from repo `server/cache` during image build.
- `CACHE_SEED_MODE=overwrite` refreshes mounted cache files from git-uploaded seed caches at startup.
- `CACHE_SEED_MODE=missing` only copies missing files from `cache_seed` to mounted cache volume.
- `CACHE_SEED_MODE=off` disables startup seeding.
- `ASHBY_FEED_ENDPOINTS`, `ASHBY_ORGS`, `GREENHOUSE_BOARDS`, and `LEVER_BOARDS` control how many boards/orgs are ingested.
- If `ASHBY_ORGS`, `GREENHOUSE_BOARDS`, or `LEVER_BOARDS` are omitted, the app now falls back to expanded built-in generalist target packs.
- `INDEED_RSS_QUERIES` can be set to custom comma-separated non-tech terms; if omitted, a large built-in generalist query pack is used.
- `INDEED_RSS_LOCATIONS` can be set to a comma-separated list to multiply volume across regions; if omitted, the scraper uses a broad built-in location set.
- `CRAIGSLIST_AREAS` and `CRAIGSLIST_CATEGORIES` can be set for Craigslist RSS ingestion; if omitted, a broad built-in US metro area list with `jjj` (all jobs) is used.
- `USAJOBS_API_KEY` and `USAJOBS_USER_AGENT_EMAIL` enable high-volume public-sector ingestion from USAJobs; optional tuning: `USAJOBS_KEYWORDS`, `USAJOBS_MAX_PAGES`, `USAJOBS_RESULTS_PER_PAGE`.
- `ADZUNA_APP_ID` and `ADZUNA_APP_KEY` enable broad generalist ingestion across countries; optional tuning: `ADZUNA_COUNTRIES`, `ADZUNA_KEYWORDS`, `ADZUNA_MAX_PAGES`.
- `JOOBLE_API_KEY` enables Jooble ingestion; optional tuning: `JOOBLE_KEYWORDS`, `JOOBLE_LOCATIONS`, `JOOBLE_MAX_PAGES`.
- `REED_API_KEY` enables Reed (UK-heavy) ingestion; optional tuning: `REED_KEYWORDS`, `REED_LOCATIONS`, `REED_MAX_PAGES`.
