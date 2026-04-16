/**
 * Nominatim geocoder with:
 * - localStorage cache (geotarget_geocache_v3)
 * - 1200ms rate-limiting queue (Nominatim ToS: max 1 req/sec)
 * - version-based cancellation to avoid stale state updates
 * - polygon_geojson support for zone rendering
 */
import type { Geometry } from 'geojson';

const CACHE_KEY = 'geotarget_geocache_v3';
const RATE_LIMIT_MS = 1200;

export interface GeoResult {
  lat: number;
  lng: number;
  geom?: Geometry;
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
    localStorage.removeItem(CACHE_KEY);
  }
}

const cache = loadCache();

// --- Rate-limited queue ---
let lastRequestTime = 0;
let queue: Array<() => Promise<void>> = [];
let processing = false;

function enqueue(fn: () => Promise<void>) {
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
    await fn();
  }
  processing = false;
}

function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms));
}

// --- Forward geocode fetch (with polygon) ---
async function fetchNominatim(query: string): Promise<GeoResult | null> {
  const url =
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}` +
    `&format=json&limit=1&polygon_geojson=1&polygon_threshold=0.005&addressdetails=1`;
  try {
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'en', 'User-Agent': 'GeoTargetBuilder/1.0' },
    });
    if (!res.ok) return null;
    const data = await res.json() as Array<{
      lat: string; lon: string; geojson?: Geometry;
    }>;
    if (!data.length) return null;
    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
      geom: data[0].geojson,
    };
  } catch {
    return null;
  }
}

/**
 * Geocode a text query with rate-limiting, caching, and version-abort support.
 */
export function geocode(
  query: string,
  versionRef: { current: number },
  myVersion: number,
): Promise<GeoResult | null> {
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

export function clearGeoQueue() {
  queue = [];
}

// --- Autocomplete search ---

export interface NominatimSuggestion {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  addresstype?: string;
  geojson?: Geometry;
  address?: {
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
 * Search Nominatim for suggestions (for autocomplete).
 * Not rate-limited — debounce in the caller.
 */
export async function searchNominatim(query: string, limit = 6): Promise<NominatimSuggestion[]> {
  if (query.length < 2) return [];
  const url =
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}` +
    `&format=json&limit=${limit}&polygon_geojson=1&polygon_threshold=0.005&addressdetails=1`;
  try {
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'en', 'User-Agent': 'GeoTargetBuilder/1.0' },
    });
    if (!res.ok) return [];
    return await res.json() as NominatimSuggestion[];
  } catch {
    return [];
  }
}

// --- Reverse geocoding ---

export interface ReverseResult {
  displayName: string;
  shortName: string;
  addresstype: string;
  geom?: Geometry;
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
 * Reverse geocode a point. zoom controls granularity:
 * 8=state, 10=county, 12=city/suburb, 14=street
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
  zoom = 10,
): Promise<ReverseResult | null> {
  const url =
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}` +
    `&format=json&zoom=${zoom}&addressdetails=1&polygon_geojson=1&polygon_threshold=0.005`;
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
      geojson?: Geometry;
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
      geom: data.geojson,
      address: addr,
    };
  } catch {
    return null;
  }
}

/**
 * Build a location string in Google/Bing Ads format.
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
    addr.county ? ' (county)' :
    addr.city ? ' (city)' :
    addr.suburb ? ' (neighborhood)' :
    '';

  return [place, state, country].filter(Boolean).join(', ') + kind;
}

/**
 * Build location string from a NominatimSuggestion (for search results).
 */
export function suggestionToLocationString(s: NominatimSuggestion): string {
  const addr = s.address ?? {};
  const state = addr.state ?? '';
  const country = addr.country ?? '';

  if (addr.postcode && s.addresstype === 'postcode') {
    return [addr.postcode, state, country].filter(Boolean).join(', ');
  }

  const place =
    addr.county ||
    addr.city ||
    addr.town ||
    addr.village ||
    addr.suburb ||
    '';

  if (!place) return s.display_name;

  const kind =
    addr.county ? ' (county)' :
    addr.city ? ' (city)' :
    addr.suburb ? ' (neighborhood)' :
    '';

  return [place, state, country].filter(Boolean).join(', ') + kind;
}
