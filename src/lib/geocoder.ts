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

// --- Reverse geocoding ---

export interface ReverseResult {
  displayName: string;
  /** Short human-readable name: county, city, ZIP, etc. */
  shortName: string;
  /** Nominatim addresstype: 'administrative', 'postcode', 'city', etc. */
  addresstype: string;
  address: {
    postcode?: string;
    county?: string;
    city?: string;
    town?: string;
    village?: string;
    suburb?: string;
    state?: string;
    country?: string;
    country_code?: string;
  };
}

/**
 * Reverse geocode a lat/lng using Nominatim.
 * zoom=10 returns county-level granularity.
 * Not rate-limited (called only on explicit user clicks).
 */
export async function reverseGeocode(lat: number, lng: number): Promise<ReverseResult | null> {
  const url =
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10&addressdetails=1`;
  try {
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'en', 'User-Agent': 'GeoTargetBuilder/1.0' },
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      display_name?: string;
      name?: string;
      addresstype?: string;
      type?: string;
      address?: ReverseResult['address'];
    };
    const addr = data.address ?? {};
    const addresstype = data.addresstype ?? data.type ?? 'unknown';
    const shortName =
      data.name ||
      addr.county ||
      addr.city ||
      addr.town ||
      addr.suburb ||
      addr.postcode ||
      '';
    return {
      displayName: data.display_name ?? '',
      shortName,
      addresstype,
      address: addr,
    };
  } catch {
    return null;
  }
}

/**
 * Build a location string in Google/Bing Ads format from a reverse geocode result.
 * e.g. "Orange County, California, United States (county)"
 */
export function reverseResultToLocationString(r: ReverseResult): string {
  const addr = r.address;
  const state = addr.state ?? '';
  const country = addr.country ?? '';

  if (addr.postcode && r.addresstype === 'postcode') {
    return [addr.postcode, state, country].filter(Boolean).join(', ');
  }

  const place =
    addr.county ||
    addr.city ||
    addr.town ||
    addr.village ||
    addr.suburb ||
    r.shortName;

  const kind =
    addr.county ? '(county)' :
    addr.city ? '(city)' :
    addr.suburb ? '(neighborhood)' :
    '';

  return [place, state, country].filter(Boolean).join(', ') + (kind ? ` ${kind}` : '');
}
