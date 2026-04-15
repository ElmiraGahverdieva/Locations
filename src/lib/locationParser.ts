export type LocationKind =
  | 'radius_latlng'   // "15 miles around Lat: 32.72 Long: -117.16"
  | 'radius_text'     // "30 miles around Los Angeles, California, United States"
  | 'zip'             // "92374, California, United States"
  | 'named';          // "Los Angeles, California, United States (city)"

export interface ParsedLocation {
  kind: LocationKind;
  raw: string;
  // radius_latlng
  lat?: number;
  lng?: number;
  radiusMiles?: number;
  // radius_text / named / zip
  query?: string;
}

// "15 miles around Lat: 32.72 Long: -117.16"
const RE_RADIUS_LATLNG = /^(\d+(?:\.\d+)?)\s+miles?\s+around\s+lat:\s*(-?\d+(?:\.\d+)?)\s+long:\s*(-?\d+(?:\.\d+)?)/i;

// "30 miles around Los Angeles, California, United States"
const RE_RADIUS_TEXT = /^(\d+(?:\.\d+)?)\s+miles?\s+around\s+(.+)$/i;

// ZIP: starts with a 5-digit number (possibly preceded by non-digit chars)
const RE_ZIP = /^(\d{5}),\s*(.+)/;

export function parseLocation(raw: string): ParsedLocation {
  const s = raw.trim();

  const mLL = RE_RADIUS_LATLNG.exec(s);
  if (mLL) {
    return {
      kind: 'radius_latlng',
      raw: s,
      radiusMiles: parseFloat(mLL[1]),
      lat: parseFloat(mLL[2]),
      lng: parseFloat(mLL[3]),
    };
  }

  const mRT = RE_RADIUS_TEXT.exec(s);
  if (mRT) {
    return {
      kind: 'radius_text',
      raw: s,
      radiusMiles: parseFloat(mRT[1]),
      query: mRT[2].trim(),
    };
  }

  const mZip = RE_ZIP.exec(s);
  if (mZip) {
    return { kind: 'zip', raw: s, query: s };
  }

  return { kind: 'named', raw: s, query: s };
}

/** Miles to meters */
export function milesToMeters(miles: number): number {
  return miles * 1609.344;
}
