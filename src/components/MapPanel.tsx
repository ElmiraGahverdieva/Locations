import { useEffect, useRef, useState, useCallback } from 'react';
import { MapContainer, TileLayer, CircleMarker, Circle, Tooltip, useMap } from 'react-leaflet';
import type { AppData, Platform } from '../types';
import { parseLocation, milesToMeters } from '../lib/locationParser';
import { geocode, clearGeoQueue } from '../lib/geocoder';

interface MapMarker {
  lat: number;
  lng: number;
  label: string;
  platform: Platform | 'CUSTOM';
  radiusM?: number; // draw a circle if present
}

interface Props {
  data: AppData;
  selectedIds: Set<string>;
  onAddCustomLocation: (value: string, platform: Platform, clusterId: string) => void;
}

// Colors
const GOOGLE_COLOR = '#16a34a';   // green-600
const BING_COLOR = '#2563eb';     // blue-600
const CUSTOM_COLOR = '#d97706';   // amber-600

function markerColor(platform: MapMarker['platform']) {
  if (platform === 'GOOGLE') return GOOGLE_COLOR;
  if (platform === 'BING') return BING_COLOR;
  return CUSTOM_COLOR;
}

/** Fit the map to all visible markers whenever they change. */
function FitBounds({ markers }: { markers: MapMarker[] }) {
  const map = useMap();
  useEffect(() => {
    if (markers.length === 0) return;
    const lats = markers.map(m => m.lat);
    const lngs = markers.map(m => m.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    map.fitBounds([[minLat, minLng], [maxLat, maxLng]], { padding: [40, 40], maxZoom: 10 });
  }, [markers, map]);
  return null;
}

export default function MapPanel({ data, selectedIds, onAddCustomLocation }: Props) {
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [loading, setLoading] = useState(false);
  const [geocodedCount, setGeocodedCount] = useState(0);
  const [totalToGeocode, setTotalToGeocode] = useState(0);

  // Custom location input state
  const [customValue, setCustomValue] = useState('');
  const [customPlatform, setCustomPlatform] = useState<Platform>('GOOGLE');
  const [customTargetCluster, setCustomTargetCluster] = useState('');
  const [customPreview, setCustomPreview] = useState<MapMarker | null>(null);
  const [customSearching, setCustomSearching] = useState(false);
  const [customError, setCustomError] = useState('');

  const versionRef = useRef(0);

  // Build markers whenever selectedIds changes
  useEffect(() => {
    versionRef.current++;
    const myVersion = versionRef.current;

    clearGeoQueue();
    setMarkers([]);
    setCustomPreview(null);

    const selectedLocations = data.locations.filter(l => selectedIds.has(l.clusterId));
    if (selectedLocations.length === 0) {
      setLoading(false);
      setGeocodedCount(0);
      setTotalToGeocode(0);
      return;
    }

    // Separate immediate (lat/lng) from needs-geocoding
    const immediate: MapMarker[] = [];
    const toGeocode: Array<{ parsed: ReturnType<typeof parseLocation>; platform: Platform; label: string }> = [];

    for (const loc of selectedLocations) {
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

    if (toGeocode.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);

    let completed = 0;
    const accumulatedMarkers: MapMarker[] = [...immediate];

    for (const item of toGeocode) {
      geocode(item.parsed.query!, versionRef, myVersion).then(result => {
        if (versionRef.current !== myVersion) return;
        completed++;
        setGeocodedCount(completed);
        if (result) {
          const marker: MapMarker = {
            lat: result.lat,
            lng: result.lng,
            label: item.label,
            platform: item.platform,
            radiusM: item.parsed.radiusMiles ? milesToMeters(item.parsed.radiusMiles) : undefined,
          };
          accumulatedMarkers.push(marker);
          setMarkers([...accumulatedMarkers]);
        }
        if (completed === toGeocode.length) {
          setLoading(false);
        }
      });
    }
  }, [data, selectedIds]);

  // Custom location search
  const handleCustomSearch = useCallback(async () => {
    if (!customValue.trim()) return;
    setCustomSearching(true);
    setCustomError('');
    setCustomPreview(null);
    const v = { current: 999999 };
    const result = await geocode(customValue.trim(), v, 999999);
    setCustomSearching(false);
    if (!result) {
      setCustomError('Location not found. Try a more specific name.');
      return;
    }
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

  const allMarkers = customPreview ? [...markers, customPreview] : markers;
  const selectedClusters = data.clusters.filter(c => selectedIds.has(c.id));

  return (
    <div className="flex flex-col h-full">
      {/* Legend + status */}
      <div className="flex items-center gap-4 px-4 py-2 bg-white border-b border-gray-200 text-xs flex-shrink-0">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full" style={{ background: GOOGLE_COLOR }} />
          Google
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full" style={{ background: BING_COLOR }} />
          Bing
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full" style={{ background: CUSTOM_COLOR }} />
          Custom
        </span>
        {loading && (
          <span className="ml-auto text-gray-400 animate-pulse">
            Geocoding {geocodedCount}/{totalToGeocode}…
          </span>
        )}
        {!loading && markers.length > 0 && (
          <span className="ml-auto text-gray-400">{markers.length} locations</span>
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
            zoomControl={true}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              subdomains="abcd"
              maxZoom={20}
            />

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
                    <Tooltip>{m.label}</Tooltip>
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
                  <Tooltip>{m.label}</Tooltip>
                </CircleMarker>
              );
            })}

            {allMarkers.length > 0 && <FitBounds markers={allMarkers} />}
          </MapContainer>
        )}
      </div>

      {/* Custom location panel */}
      <div className="flex-shrink-0 border-t border-gray-200 bg-white p-3">
        <p className="text-xs font-semibold text-gray-600 mb-2">Add custom location</p>
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
            {customSearching ? 'Searching…' : 'Preview on map'}
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
              {selectedClusters.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
              {data.clusters
                .filter(c => !selectedIds.has(c.id))
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(c => (
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
