import { useEffect, useRef, useState, useCallback } from 'react';
import {
  MapContainer, TileLayer, CircleMarker, Circle, Tooltip, Popup, useMap, useMapEvents,
} from 'react-leaflet';
import type { LatLng } from 'leaflet';
import type { AppData, Platform } from '../types';
import { parseLocation, milesToMeters } from '../lib/locationParser';
import { geocode, clearGeoQueue, reverseGeocode, reverseResultToLocationString } from '../lib/geocoder';

interface MapMarker {
  lat: number;
  lng: number;
  label: string;
  platform: Platform | 'CUSTOM';
  radiusM?: number;
}

interface ClickInfo {
  latlng: LatLng;
  locationString: string;
  shortName: string;
}

interface Props {
  data: AppData;
  selectedIds: Set<string>;
  onAddCustomLocation: (value: string, platform: Platform, clusterId: string) => void;
}

const GOOGLE_COLOR = '#16a34a';
const BING_COLOR = '#2563eb';
const CUSTOM_COLOR = '#d97706';

function markerColor(p: MapMarker['platform']) {
  if (p === 'GOOGLE') return GOOGLE_COLOR;
  if (p === 'BING') return BING_COLOR;
  return CUSTOM_COLOR;
}

function FitBounds({ markers }: { markers: MapMarker[] }) {
  const map = useMap();
  const prevLen = useRef(0);
  useEffect(() => {
    if (markers.length === 0) return;
    if (markers.length === prevLen.current) return;
    prevLen.current = markers.length;
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
  onMapClick: (latlng: LatLng) => void;
}) {
  useMapEvents({
    click(e) {
      if (enabled) onMapClick(e.latlng);
    },
  });
  return null;
}

function ToggleBtn({
  label,
  color,
  active,
  onToggle,
}: {
  label: string;
  color: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
        active ? 'border-transparent text-white' : 'border-gray-300 text-gray-400 bg-white'
      }`}
      style={active ? { background: color, borderColor: color } : {}}
    >
      <span
        className="inline-block w-2.5 h-2.5 rounded-full"
        style={{ background: active ? '#fff' : color, opacity: active ? 0.9 : 0.4 }}
      />
      {label}
    </button>
  );
}

export default function MapPanel({ data, selectedIds, onAddCustomLocation }: Props) {
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [loading, setLoading] = useState(false);
  const [geocodedCount, setGeocodedCount] = useState(0);
  const [totalToGeocode, setTotalToGeocode] = useState(0);

  // Platform visibility toggles
  const [showGoogle, setShowGoogle] = useState(true);
  const [showBing, setShowBing] = useState(true);

  // Click-to-add mode
  const [clickMode, setClickMode] = useState(false);
  const [clickInfo, setClickInfo] = useState<ClickInfo | null>(null);
  const [clickLoading, setClickLoading] = useState(false);
  const [clickPlatform, setClickPlatform] = useState<Platform>('GOOGLE');
  const [clickCluster, setClickCluster] = useState('');

  // Custom text search
  const [customValue, setCustomValue] = useState('');
  const [customPlatform, setCustomPlatform] = useState<Platform>('GOOGLE');
  const [customTargetCluster, setCustomTargetCluster] = useState('');
  const [customPreview, setCustomPreview] = useState<MapMarker | null>(null);
  const [customSearching, setCustomSearching] = useState(false);
  const [customError, setCustomError] = useState('');

  const versionRef = useRef(0);

  // Build markers from selected locations
  useEffect(() => {
    versionRef.current++;
    const myVersion = versionRef.current;

    clearGeoQueue();
    setMarkers([]);
    setCustomPreview(null);
    setClickInfo(null);

    const locs = data.locations.filter(l => selectedIds.has(l.clusterId));
    if (locs.length === 0) {
      setLoading(false);
      setGeocodedCount(0);
      setTotalToGeocode(0);
      return;
    }

    const immediate: MapMarker[] = [];
    const toGeocode: Array<{
      parsed: ReturnType<typeof parseLocation>;
      platform: Platform;
      label: string;
    }> = [];

    for (const loc of locs) {
      const parsed = parseLocation(loc.value);
      if (parsed.kind === 'radius_latlng' && parsed.lat !== undefined && parsed.lng !== undefined) {
        immediate.push({
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

    if (toGeocode.length === 0) { setLoading(false); return; }
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
            lat: result.lat,
            lng: result.lng,
            label: item.label,
            platform: item.platform,
            radiusM: item.parsed.radiusMiles ? milesToMeters(item.parsed.radiusMiles) : undefined,
          });
          setMarkers([...acc]);
        }
        if (completed === toGeocode.length) setLoading(false);
      });
    }
  }, [data, selectedIds]);

  // Handle map click → reverse geocode
  const handleMapClick = useCallback(async (latlng: LatLng) => {
    setClickLoading(true);
    setClickInfo(null);
    const result = await reverseGeocode(latlng.lat, latlng.lng);
    setClickLoading(false);
    if (!result) return;
    const locationString = reverseResultToLocationString(result);
    setClickInfo({ latlng, locationString, shortName: result.shortName });
    // Pre-select first selected cluster
    if (!clickCluster && selectedIds.size > 0) {
      setClickCluster([...selectedIds][0]);
    }
  }, [clickCluster, selectedIds]);

  function handleAddFromClick() {
    if (!clickInfo || !clickCluster) return;
    onAddCustomLocation(clickInfo.locationString, clickPlatform, clickCluster);
    setClickInfo(null);
  }

  // Custom text search
  const handleCustomSearch = useCallback(async () => {
    if (!customValue.trim()) return;
    setCustomSearching(true);
    setCustomError('');
    setCustomPreview(null);
    const v = { current: 999999 };
    const result = await geocode(customValue.trim(), v, 999999);
    setCustomSearching(false);
    if (!result) { setCustomError('Location not found. Try a more specific name.'); return; }
    const parsed = parseLocation(customValue.trim());
    setCustomPreview({
      lat: result.lat,
      lng: result.lng,
      label: customValue.trim(),
      platform: 'CUSTOM',
      radiusM: parsed.radiusMiles ? milesToMeters(parsed.radiusMiles) : undefined,
    });
  }, [customValue]);

  function handleAddCustom() {
    if (!customPreview || !customTargetCluster) return;
    onAddCustomLocation(customValue.trim(), customPlatform, customTargetCluster);
    setCustomValue('');
    setCustomPreview(null);
    setCustomError('');
  }

  const filteredMarkers = markers.filter(m =>
    (m.platform === 'GOOGLE' ? showGoogle : true) &&
    (m.platform === 'BING' ? showBing : true)
  );
  const allMarkers = customPreview ? [...filteredMarkers, customPreview] : filteredMarkers;
  const selectedClusters = data.clusters.filter(c => selectedIds.has(c.id));
  const allClusters = [
    ...selectedClusters,
    ...data.clusters.filter(c => !selectedIds.has(c.id)).sort((a, b) => a.name.localeCompare(b.name)),
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-white border-b border-gray-200 flex-shrink-0 flex-wrap">
        <ToggleBtn label="Google" color={GOOGLE_COLOR} active={showGoogle} onToggle={() => setShowGoogle(v => !v)} />
        <ToggleBtn label="Bing" color={BING_COLOR} active={showBing} onToggle={() => setShowBing(v => !v)} />

        <div className="w-px h-4 bg-gray-200 mx-1" />

        <button
          onClick={() => { setClickMode(v => !v); setClickInfo(null); }}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
            clickMode
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
          }`}
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {clickMode ? 'Click on map…' : 'Pick from map'}
        </button>

        {loading && (
          <span className="ml-auto text-xs text-gray-400 animate-pulse">
            Geocoding {geocodedCount}/{totalToGeocode}…
          </span>
        )}
        {!loading && markers.length > 0 && (
          <span className="ml-auto text-xs text-gray-400">{filteredMarkers.length} shown</span>
        )}
        {clickLoading && (
          <span className="ml-auto text-xs text-indigo-500 animate-pulse">Looking up…</span>
        )}
      </div>

      {/* Map */}
      <div className="flex-1 min-h-0 relative">
        {selectedIds.size === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
            Select a cluster to see locations on the map
          </div>
        ) : (
          <MapContainer
            center={[39.5, -98.35]}
            zoom={4}
            className="h-full w-full"
            style={{ cursor: clickMode ? 'crosshair' : '' }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              maxZoom={19}
            />

            <MapClickHandler enabled={clickMode} onMapClick={handleMapClick} />

            {allMarkers.map((m, i) => {
              const color = markerColor(m.platform);
              if (m.radiusM && m.radiusM > 0) {
                return (
                  <Circle
                    key={i}
                    center={[m.lat, m.lng]}
                    radius={m.radiusM}
                    pathOptions={{ color, fillColor: color, fillOpacity: 0.15, weight: 2 }}
                  >
                    <Tooltip sticky>{m.label}</Tooltip>
                  </Circle>
                );
              }
              return (
                <CircleMarker
                  key={i}
                  center={[m.lat, m.lng]}
                  radius={7}
                  pathOptions={{ color, fillColor: color, fillOpacity: 0.8, weight: 2 }}
                >
                  <Tooltip sticky>{m.label}</Tooltip>
                </CircleMarker>
              );
            })}

            {/* Click-to-add popup */}
            {clickInfo && (
              <Popup
                position={clickInfo.latlng}
                eventHandlers={{ remove: () => setClickInfo(null) }}
                closeButton
              >
                <div className="text-xs min-w-[200px] p-1">
                  <p className="font-semibold text-gray-700 mb-1">{clickInfo.shortName}</p>
                  <p className="text-gray-500 mb-2 text-[11px] break-words">{clickInfo.locationString}</p>
                  <div className="flex gap-1.5 mb-2">
                    <select
                      value={clickPlatform}
                      onChange={e => setClickPlatform(e.target.value as Platform)}
                      className="border border-gray-200 rounded px-1.5 py-1 text-xs bg-white flex-1"
                    >
                      <option value="GOOGLE">Google</option>
                      <option value="BING">Bing</option>
                    </select>
                    <select
                      value={clickCluster}
                      onChange={e => setClickCluster(e.target.value)}
                      className="border border-gray-200 rounded px-1.5 py-1 text-xs bg-white flex-1"
                    >
                      <option value="">— cluster —</option>
                      {allClusters.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={handleAddFromClick}
                    disabled={!clickCluster}
                    className="w-full py-1 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-700 disabled:opacity-30 transition-colors"
                  >
                    Add location
                  </button>
                </div>
              </Popup>
            )}

            {allMarkers.length > 0 && <FitBounds markers={allMarkers} />}
          </MapContainer>
        )}
      </div>

      {/* Text search panel */}
      <div className="flex-shrink-0 border-t border-gray-200 bg-white p-3">
        <p className="text-xs font-semibold text-gray-600 mb-2">Search &amp; add by name</p>
        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            placeholder="e.g. Denver, Colorado, United States"
            value={customValue}
            onChange={e => { setCustomValue(e.target.value); setCustomPreview(null); setCustomError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleCustomSearch()}
            className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-indigo-400"
          />
          <button
            onClick={handleCustomSearch}
            disabled={customSearching || !customValue.trim()}
            className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs hover:bg-gray-200 disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            {customSearching ? 'Searching…' : 'Preview'}
          </button>
        </div>

        {customError && <p className="text-xs text-red-500 mt-1">{customError}</p>}

        {customPreview && (
          <div className="flex gap-2 mt-2 flex-wrap items-center">
            <span className="text-xs text-amber-600 font-medium">Found! Add to:</span>
            <select
              value={customPlatform}
              onChange={e => setCustomPlatform(e.target.value as Platform)}
              className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-indigo-400 bg-white"
            >
              <option value="GOOGLE">Google</option>
              <option value="BING">Bing</option>
            </select>
            <select
              value={customTargetCluster}
              onChange={e => setCustomTargetCluster(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-indigo-400 bg-white"
            >
              <option value="">— select cluster —</option>
              {allClusters.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button
              onClick={handleAddCustom}
              disabled={!customTargetCluster}
              className="px-3 py-1 bg-indigo-600 text-white rounded-lg text-xs hover:bg-indigo-700 disabled:opacity-30 transition-colors font-medium"
            >
              Add
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
