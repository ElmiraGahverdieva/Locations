import { useEffect, useRef, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Circle, CircleMarker, GeoJSON, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import type { Geometry } from 'geojson';
import type { AppData, Platform } from '../types';
import { parseLocation, milesToMeters } from '../lib/locationParser';
import {
  geocode, clearGeoQueue,
  reverseGeocode, reverseResultToLocationString,
  searchNominatim, suggestionToLocationString,
  type NominatimSuggestion,
} from '../lib/geocoder';

// Colors matching PlatformBlock.tsx exactly
const GOOGLE_COLOR = '#2563eb'; // blue-600
const BING_COLOR   = '#0d9488'; // teal-600
const CUSTOM_COLOR = '#d97706'; // amber-600

interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  platform: Platform | 'CUSTOM';
  radiusM?: number;
  geom?: Geometry;
}

interface PickResult {
  lat: number;
  lng: number;
  locationString: string;
  shortName: string;
  geom?: Geometry;
}

interface Props {
  data: AppData;
  selectedIds: Set<string>;
  onAddCustomLocation: (value: string, platform: Platform, clusterId: string) => void;
}

function platformColor(p: MapMarker['platform']) {
  if (p === 'GOOGLE') return GOOGLE_COLOR;
  if (p === 'BING')   return BING_COLOR;
  return CUSTOM_COLOR;
}

// Fit bounds on first batch of markers, but don't re-fit every incremental update
function FitBounds({ markers }: { markers: MapMarker[] }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (markers.length === 0) { fitted.current = false; return; }
    if (fitted.current) return;
    fitted.current = true;
    const lats = markers.map(m => m.lat);
    const lngs = markers.map(m => m.lng);
    map.fitBounds(
      [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]],
      { padding: [40, 40], maxZoom: 10 },
    );
  }, [markers, map]);
  return null;
}

function MapClickHandler({
  enabled,
  onMapClick,
}: {
  enabled: boolean;
  onMapClick: (lat: number, lng: number, mapZoom: number) => void;
}) {
  useMapEvents({
    click(e) {
      if (enabled) onMapClick(e.latlng.lat, e.latlng.lng, e.target.getZoom());
    },
  });
  return null;
}

// Toggle pill matching PlatformBlock header colors
function PlatformToggle({
  label, color, active, onToggle,
}: {
  label: string; color: string; active: boolean; onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      title={active ? `Hide ${label}` : `Show ${label}`}
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all select-none"
      style={active
        ? { background: color, borderColor: color, color: '#fff' }
        : { background: '#f3f4f6', borderColor: '#d1d5db', color: '#6b7280' }
      }
    >
      {/* Mini dot */}
      <span className="w-2.5 h-2.5 rounded-full border-2 border-white/60 flex-shrink-0"
        style={{ background: active ? '#fff' : color, opacity: active ? 1 : 0.5 }}
      />
      {label}
      {/* ON/OFF indicator */}
      <span className="ml-0.5 text-[10px] font-bold tracking-wide opacity-70">
        {active ? 'ON' : 'OFF'}
      </span>
    </button>
  );
}

export default function MapPanel({ data, selectedIds, onAddCustomLocation }: Props) {
  const [markers, setMarkers]               = useState<MapMarker[]>([]);
  const [loading, setLoading]               = useState(false);
  const [geocodedCount, setGeocodedCount]   = useState(0);
  const [totalToGeocode, setTotalToGeocode] = useState(0);

  // Platform visibility
  const [showGoogle, setShowGoogle] = useState(true);
  const [showBing,   setShowBing]   = useState(true);

  // Pick-from-map mode
  const [pickMode,    setPickMode]    = useState(false);
  const [pickLoading, setPickLoading] = useState(false);
  const [pickResult,  setPickResult]  = useState<PickResult | null>(null);
  const [pickPlatform, setPickPlatform] = useState<Platform>('GOOGLE');
  const [pickCluster,  setPickCluster]  = useState('');

  // Text search / autocomplete
  const [searchText,    setSearchText]    = useState('');
  const [suggestions,   setSuggestions]   = useState<NominatimSuggestion[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen,    setSearchOpen]    = useState(false);
  const [chosenSug,     setChosenSug]     = useState<NominatimSuggestion | null>(null);
  const [searchPlatform, setSearchPlatform] = useState<Platform>('GOOGLE');
  const [searchCluster,  setSearchCluster]  = useState('');

  // Radius mode for text search
  const [radiusMode,  setRadiusMode]  = useState(false);
  const [radiusMiles, setRadiusMiles] = useState(25);

  const versionRef   = useRef(0);
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  // Build markers whenever selection changes
  useEffect(() => {
    versionRef.current++;
    const myVersion = versionRef.current;
    clearGeoQueue();
    setMarkers([]);
    setPickResult(null);

    const locs = data.locations.filter(l => selectedIds.has(l.clusterId));
    if (!locs.length) { setLoading(false); setGeocodedCount(0); setTotalToGeocode(0); return; }

    const immediate: MapMarker[] = [];
    const toGeocode: Array<{ parsed: ReturnType<typeof parseLocation>; platform: Platform; label: string }> = [];

    for (const loc of locs) {
      const parsed = parseLocation(loc.value);
      if (parsed.kind === 'radius_latlng' && parsed.lat !== undefined && parsed.lng !== undefined) {
        immediate.push({
          id: `${loc.id}`,
          lat: parsed.lat,
          lng: parsed.lng,
          label: loc.value,
          platform: loc.platform,
          radiusM: parsed.radiusMiles ? milesToMeters(parsed.radiusMiles) : undefined,
        });
      } else if (parsed.query) {
        toGeocode.push({ parsed, platform: loc.platform, label: loc.value });
      }
    }

    setMarkers(immediate);
    setTotalToGeocode(toGeocode.length);
    setGeocodedCount(0);
    if (!toGeocode.length) { setLoading(false); return; }
    setLoading(true);

    let completed = 0;
    const acc: MapMarker[] = [...immediate];

    for (const item of toGeocode) {
      geocode(item.parsed.query!, versionRef, myVersion).then(result => {
        if (versionRef.current !== myVersion) return;
        completed++;
        setGeocodedCount(completed);
        if (result) {
          acc.push({
            id: `${item.label}-${item.platform}`,
            lat: result.lat,
            lng: result.lng,
            label: item.label,
            platform: item.platform,
            radiusM: item.parsed.radiusMiles ? milesToMeters(item.parsed.radiusMiles) : undefined,
            geom: result.geom,
          });
          setMarkers([...acc]);
        }
        if (completed === toGeocode.length) setLoading(false);
      });
    }
  }, [data, selectedIds]);

  // Map click → reverse geocode
  const handleMapClick = useCallback(async (lat: number, lng: number, mapZoom: number) => {
    setPickLoading(true);
    setPickResult(null);
    const nomZoom = mapZoom >= 12 ? 14 : mapZoom >= 9 ? 10 : 8;
    const result = await reverseGeocode(lat, lng, nomZoom);
    setPickLoading(false);
    if (!result) return;
    setPickResult({
      lat, lng,
      locationString: reverseResultToLocationString(result),
      shortName: result.shortName,
      geom: result.geom,
    });
    if (!pickCluster && selectedIds.size > 0) {
      setPickCluster([...selectedIds][0]);
    }
  }, [pickCluster, selectedIds]);

  function handleAddFromPick() {
    if (!pickResult || !pickCluster) return;
    const value = radiusMode && pickResult
      ? `${radiusMiles} miles around ${pickResult.locationString}`
      : pickResult.locationString;
    onAddCustomLocation(value, pickPlatform, pickCluster);
    setPickResult(null);
  }

  // Autocomplete debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!searchText.trim() || searchText.length < 2) {
      setSuggestions([]);
      setSearchOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true);
      const results = await searchNominatim(searchText);
      setSearchLoading(false);
      setSuggestions(results);
      setSearchOpen(results.length > 0);
    }, 450);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchText]);

  // Close autocomplete on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function handleSelectSuggestion(s: NominatimSuggestion) {
    setChosenSug(s);
    setSearchText(suggestionToLocationString(s));
    setSearchOpen(false);
    setSuggestions([]);
  }

  function handleAddFromSearch() {
    if (!chosenSug || !searchCluster) return;
    const locStr = suggestionToLocationString(chosenSug);
    const value = radiusMode ? `${radiusMiles} miles around ${locStr}` : locStr;
    onAddCustomLocation(value, searchPlatform, searchCluster);
    setSearchText('');
    setChosenSug(null);
  }

  // Filtered markers for display
  const visibleMarkers = markers.filter(m =>
    (m.platform === 'GOOGLE' ? showGoogle : true) &&
    (m.platform === 'BING'   ? showBing   : true)
  );

  const allClusters = [
    ...data.clusters.filter(c => selectedIds.has(c.id)),
    ...data.clusters.filter(c => !selectedIds.has(c.id)).sort((a, b) => a.name.localeCompare(b.name)),
  ];

  const googleCount = markers.filter(m => m.platform === 'GOOGLE').length;
  const bingCount   = markers.filter(m => m.platform === 'BING').length;

  return (
    <div className="flex flex-col h-full bg-gray-50">

      {/* ── Toolbar ──────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-white border-b border-gray-200 flex-wrap">

        <PlatformToggle
          label={`Google Ads${googleCount ? ` (${googleCount})` : ''}`}
          color={GOOGLE_COLOR}
          active={showGoogle}
          onToggle={() => setShowGoogle(v => !v)}
        />
        <PlatformToggle
          label={`Bing Ads${bingCount ? ` (${bingCount})` : ''}`}
          color={BING_COLOR}
          active={showBing}
          onToggle={() => setShowBing(v => !v)}
        />

        <div className="w-px h-5 bg-gray-200" />

        {/* Pick from map button — prominent */}
        <button
          onClick={() => { setPickMode(v => !v); setPickResult(null); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
            pickMode
              ? 'bg-amber-500 border-amber-500 text-white shadow-sm'
              : 'bg-white border-gray-300 text-gray-700 hover:border-amber-400 hover:text-amber-600'
          }`}
        >
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {pickMode ? 'Кликни на карту…' : 'Выбрать на карте'}
        </button>

        {/* Status */}
        {loading && (
          <span className="ml-auto text-xs text-gray-400 animate-pulse">
            Геокодирование {geocodedCount}/{totalToGeocode}…
          </span>
        )}
        {!loading && visibleMarkers.length > 0 && (
          <span className="ml-auto text-xs text-gray-400">{visibleMarkers.length} зон</span>
        )}
        {pickLoading && (
          <span className="ml-auto text-xs text-amber-500 animate-pulse">Определяю зону…</span>
        )}
      </div>

      {/* ── Map area ─────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 relative">
        {selectedIds.size === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 gap-2">
            <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            <p className="text-sm">Выбери кластер в сайдбаре</p>
          </div>
        ) : (
          <MapContainer
            center={[39.5, -98.35]}
            zoom={4}
            className="h-full w-full"
            style={{ cursor: pickMode ? 'crosshair' : undefined }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              maxZoom={19}
            />
            <MapClickHandler enabled={pickMode} onMapClick={handleMapClick} />

            {/* Location zones and markers */}
            {visibleMarkers.map(m => {
              const color = platformColor(m.platform);
              const fillOp = 0.18;
              // Priority: polygon zone > radius circle > dot
              if (m.geom) {
                return (
                  <GeoJSON
                    key={`${m.id}`}
                    data={m.geom}
                    style={{ color, fillColor: color, fillOpacity: fillOp, weight: 2, opacity: 0.8 }}
                  >
                    <Tooltip sticky>{m.label}</Tooltip>
                  </GeoJSON>
                );
              }
              if (m.radiusM && m.radiusM > 0) {
                return (
                  <Circle
                    key={m.id}
                    center={[m.lat, m.lng]}
                    radius={m.radiusM}
                    pathOptions={{ color, fillColor: color, fillOpacity: fillOp, weight: 2 }}
                  >
                    <Tooltip sticky>{m.label}</Tooltip>
                  </Circle>
                );
              }
              return (
                <CircleMarker
                  key={m.id}
                  center={[m.lat, m.lng]}
                  radius={7}
                  pathOptions={{ color, fillColor: color, fillOpacity: 0.8, weight: 2 }}
                >
                  <Tooltip sticky>{m.label}</Tooltip>
                </CircleMarker>
              );
            })}

            {/* Picked zone highlight (amber) */}
            {pickResult?.geom && (
              <GeoJSON
                key={`pick-${pickResult.locationString}`}
                data={pickResult.geom}
                style={{ color: CUSTOM_COLOR, fillColor: CUSTOM_COLOR, fillOpacity: 0.25, weight: 2.5, dashArray: '6 4' }}
              />
            )}

            {visibleMarkers.length > 0 && <FitBounds markers={visibleMarkers} />}
          </MapContainer>
        )}

        {/* ── Pick result overlay (over map, bottom-left) ── */}
        {pickResult && (
          <div className="absolute bottom-3 left-3 z-[1000] bg-white rounded-xl shadow-xl border border-amber-200 p-3 w-72">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-xs font-bold text-gray-800">{pickResult.shortName}</p>
                <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{pickResult.locationString}</p>
              </div>
              <button
                onClick={() => setPickResult(null)}
                className="text-gray-400 hover:text-gray-600 ml-2 flex-shrink-0"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Radius option */}
            <label className="flex items-center gap-2 text-xs text-gray-600 mb-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={radiusMode}
                onChange={e => setRadiusMode(e.target.checked)}
                className="rounded"
              />
              Добавить как радиус
              {radiusMode && (
                <span className="flex items-center gap-1 ml-1">
                  <input
                    type="number"
                    min={1} max={500} value={radiusMiles}
                    onChange={e => setRadiusMiles(Number(e.target.value))}
                    className="w-14 border border-gray-200 rounded px-1.5 py-0.5 text-xs"
                  />
                  <span className="text-gray-400">миль</span>
                </span>
              )}
            </label>

            <div className="flex gap-1.5 mb-2">
              <select
                value={pickPlatform}
                onChange={e => setPickPlatform(e.target.value as Platform)}
                className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:border-indigo-400"
              >
                <option value="GOOGLE">Google Ads</option>
                <option value="BING">Bing Ads</option>
              </select>
              <select
                value={pickCluster}
                onChange={e => setPickCluster(e.target.value)}
                className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:border-indigo-400"
              >
                <option value="">— кластер —</option>
                {allClusters.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleAddFromPick}
              disabled={!pickCluster}
              className="w-full py-1.5 text-xs font-semibold text-white rounded-lg transition-colors disabled:opacity-30"
              style={{ background: pickPlatform === 'GOOGLE' ? GOOGLE_COLOR : BING_COLOR }}
            >
              Добавить в {pickPlatform === 'GOOGLE' ? 'Google Ads' : 'Bing Ads'}
            </button>
          </div>
        )}

        {/* Pick mode hint */}
        {pickMode && !pickResult && !pickLoading && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-amber-500 text-white text-xs font-medium px-4 py-2 rounded-full shadow-lg pointer-events-none">
            Кликни на любую зону на карте
          </div>
        )}
      </div>

      {/* ── Search panel ─────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-t border-gray-200 bg-white p-3 space-y-2">
        <p className="text-xs font-semibold text-gray-600">Поиск локации</p>

        {/* Search input with autocomplete */}
        <div className="relative" ref={searchBoxRef}>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Начни вводить: Los Angeles, Denver County…"
                value={searchText}
                onChange={e => { setSearchText(e.target.value); setChosenSug(null); }}
                onFocus={() => suggestions.length > 0 && setSearchOpen(true)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-indigo-400 pr-7"
              />
              {searchLoading && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 text-xs animate-spin">⏳</span>
              )}
              {searchText && !searchLoading && (
                <button
                  onClick={() => { setSearchText(''); setChosenSug(null); setSuggestions([]); setSearchOpen(false); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Autocomplete dropdown */}
          {searchOpen && suggestions.length > 0 && (
            <div className="absolute bottom-full mb-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
              {suggestions.map(s => (
                <button
                  key={s.place_id}
                  onMouseDown={() => handleSelectSuggestion(s)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-indigo-50 border-b border-gray-50 last:border-0 transition-colors"
                >
                  <span className="font-medium text-gray-800">
                    {suggestionToLocationString(s) || s.display_name}
                  </span>
                  <span className="text-gray-400 ml-1.5 text-[10px]">{s.type}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Radius toggle */}
        <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={radiusMode}
            onChange={e => setRadiusMode(e.target.checked)}
            className="rounded"
          />
          Радиус вокруг локации
          {radiusMode && (
            <span className="flex items-center gap-1">
              <input
                type="number"
                min={1} max={500} value={radiusMiles}
                onChange={e => setRadiusMiles(Number(e.target.value))}
                className="w-16 border border-gray-200 rounded px-1.5 py-0.5 text-xs"
              />
              <span className="text-gray-400">миль</span>
            </span>
          )}
        </label>

        {/* Add controls (shown when location is chosen) */}
        {chosenSug && (
          <div className="flex gap-1.5 items-center flex-wrap">
            <span className="text-xs text-indigo-600 font-medium">Добавить в:</span>
            <select
              value={searchPlatform}
              onChange={e => setSearchPlatform(e.target.value as Platform)}
              className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:border-indigo-400"
            >
              <option value="GOOGLE">Google Ads</option>
              <option value="BING">Bing Ads</option>
            </select>
            <select
              value={searchCluster}
              onChange={e => setSearchCluster(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:border-indigo-400 flex-1 min-w-0"
            >
              <option value="">— кластер —</option>
              {allClusters.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button
              onClick={handleAddFromSearch}
              disabled={!searchCluster}
              className="px-3 py-1 text-xs font-semibold text-white rounded-lg transition-colors disabled:opacity-30 flex-shrink-0"
              style={{ background: searchPlatform === 'GOOGLE' ? GOOGLE_COLOR : BING_COLOR }}
            >
              Добавить
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
