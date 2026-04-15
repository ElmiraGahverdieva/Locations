/**
 * Nominatim geocoder with:
 * - localStorage cache (geotarget_geocache_v2)
 * - 1200ms rate-limiting queue (Nominatim ToS: max 1 req/sec)
 * - version-based cancellation to avoid stale state updates
 */

const CACHE_KEY = 'geotarget_geocache_v2';
const RATE_LIMIT_MS = 1200;

export interface GeoResult {
  lat: number;
  lng: number;
}

// --- Cache ---
function loadCache(): Map<string, GeoResult | null> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return new Map();
    const obj = JSON.parse(raw) as Record<string, GeoResult | null>;
    return new Map(Object.entries(obj));
  } catch {
    return new Map();
  }
}

function saveCache(cache: Map<string, GeoResult | null>) {
  const obj: Record<string, GeoResult | null> = {};
  cache.forEach((v, k) => { obj[k] = v; });
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(obj));
  } catch {
    // Quota exceeded — clear old cache
    localStorage.removeItem(CACHE_KEY);
  }
}

const cache = loadCache();

// --- Queue ---
let lastRequestTime = 0;
let queue: Array<() => void> = [];
let processing = false;

function enqueue(fn: () => void) {
  queue.push(fn);
  if (!processing) drainQueue();
}

async function drainQueue() {
  processing = true;
  while (queue.length > 0) {
    const fn = queue.shift()!;
    const now = Date.now();
    const wait = RATE_LIMIT_MS - (now - lastRequestTime);
    if (wait > 0) await sleep(wait);
    lastRequestTime = Date.now();
    fn();
    // Wait for fn to complete before next item — fn must return a promise
    // We use a wrapper that resolves after the fetch
  }
  processing = false;
}

function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms));
}

// --- Fetch ---
async function fetchNominatim(query: string): Promise<GeoResult | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
  try {
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'en', 'User-Agent': 'GeoTargetBuilder/1.0' },
    });
    if (!res.ok) return null;
    const data = await res.json() as Array<{ lat: string; lon: string }>;
    if (data.length === 0) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

/**
 * Geocode a text query. Returns null if not found.
 * Uses cache + rate-limited queue.
 * `versionRef` is an object whose `.current` value the caller increments to cancel stale calls.
 * `myVersion` is the value at call time; if they differ, resolve with null immediately.
 */
export function geocode(
  query: string,
  versionRef: { current: number },
  myVersion: number,
): Promise<GeoResult | null> {
  // Cache hit
  if (cache.has(query)) {
    return Promise.resolve(cache.get(query) ?? null);
  }

  return new Promise<GeoResult | null>(resolve => {
    let resolved = false;

    enqueue(async () => {
      if (versionRef.current !== myVersion) {
        if (!resolved) { resolved = true; resolve(null); }
        return;
      }
      const result = await fetchNominatim(query);
      cache.set(query, result);
      saveCache(cache);
      if (!resolved) { resolved = true; resolve(result); }
    });
  });
}

/** Clear the geocoder queue (call when component unmounts or selection changes). */
export function clearGeoQueue() {
  queue = [];
}
