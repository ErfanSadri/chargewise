# Route-search performance measurement

Ticket: CHG-062  
Generated: 2026-08-05T22:17:55.202Z

## Methodology

This is a controlled local measurement of the real HTTP API, PostgreSQL
persistence, Redis session/cache infrastructure, route-search service, and
response serialization. Requests were sequential. External providers were
replaced with the deterministic fixture adapters introduced for browser tests.

Each path used 30 measured requests after
warm-up:

- **Uncached:** every request used a unique normalized location pair, forcing a
  provider-discovery cache miss.
- **Cached:** one request primed a fixed location pair, followed by repeated
  requests for the same cache key.

Raw machine-specific samples are written to
`artifacts/performance/route-search-local.json` and are intentionally ignored
by Git.

## Environment

- Node: v24.9.0
- Platform: darwin (x64)
- CPU: Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz
- Provider mode: fixture
- Database: chargewise_performance
- Redis database: 14

## Results

| Path                  | Samples |      Min |      Mean |       p50 |       p95 |       Max |
| --------------------- | ------: | -------: | --------: | --------: | --------: | --------: |
| Uncached route search |      30 | 9.661 ms | 11.008 ms | 10.776 ms | 12.252 ms | 13.467 ms |
| Cached route search   |      30 | 8.656 ms | 10.172 ms |  9.823 ms | 11.994 ms | 16.353 ms |

The uncached path was 0.258 ms slower than the cached path at p95 in this run.

## Target comparison

The product requirements target a cached p95 below
750 ms and an uncached p95 below
3000 ms. This controlled local fixture run was
below the cached target
and below the
uncached target.

These results do **not** prove production performance. Fixture providers avoid
real upstream latency, provider rate limits, public-network variance, and
deployment-region latency. Production measurements must be repeated after
CHG-063 using the deployed API and carefully rate-limited live-provider
requests.

## Cache policy

The Redis entry contains only regenerable route discovery data: normalized
geocoding choices, route geometry/summary, and normalized station-provider
records. The key includes normalized origin, destination, and corridor distance.
Vehicle compatibility, request filters, persisted station IDs, and user
favorites are applied after the cache read, so user-specific state is not shared
through Redis.

The configured default TTL remains 900 seconds. Fifteen minutes limits stale
provider data while allowing repeated route refinements and revisits to avoid
duplicate external discovery work. Favorites and charging sessions remain
uncached sources of truth.

## Interpretation and follow-up

Structured route-search logs now record cache status, service duration, and
discovered/returned station counts. The controlled benchmark distinguishes the
cache-hit and cache-miss paths, but it cannot identify which live provider is
the production bottleneck because fixture adapters return in-memory data.

After deployment:

1. measure the same route with production infrastructure;
2. keep requests sequential and within provider limits;
3. record cache-hit and cache-miss p50/p95 separately;
4. use structured logs to correlate slow requests;
5. change the TTL only when measurements or provider freshness behavior justify
   it.
