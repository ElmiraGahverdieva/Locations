import type { AppData, Cluster, LocationEntry, Platform } from '../types';

function genId(): string {
  return crypto.randomUUID();
}

/** Parse a single CSV line, respecting double-quoted fields. */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let inQuotes = false;
  let current = '';

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      // Handle escaped quote ("") inside a quoted field
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export interface RawRow {
  location: string;
  campaign: string;
  platform: Platform;
}

/**
 * Parse CSV text into raw rows.
 * The first line may have a GitHub resource prefix (e.g. "[Resource from ...] Location,Account,...").
 * We strip that prefix before processing.
 */
export function parseCSVText(text: string): RawRow[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  // Strip optional "[Resource from ...] " prefix on the header line
  const rawHeader = lines[0].replace(/^\[.*?\]\s*/, '');
  const header = parseCSVLine(rawHeader).map(h => h.toLowerCase());

  const locIdx = header.indexOf('location');
  const campIdx = header.indexOf('campaign');
  const platIdx = header.indexOf('platform');

  if (locIdx < 0 || campIdx < 0) return [];

  const rows: RawRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const location = (cols[locIdx] ?? '').trim();
    const campaign = (cols[campIdx] ?? '').trim();
    const rawPlatform = ((cols[platIdx] ?? '')).toUpperCase().trim();
    const platform: Platform = rawPlatform === 'BING' ? 'BING' : 'GOOGLE';

    if (location && campaign) {
      rows.push({ location, campaign, platform });
    }
  }
  return rows;
}

/**
 * Merge raw CSV rows into existing AppData.
 * - Creates new clusters for unknown campaign names.
 * - Deduplicates locations (same cluster + platform + value).
 */
export function mergeCSVRows(existing: AppData, rows: RawRow[]): AppData {
  const clusterMap = new Map<string, Cluster>(
    existing.clusters.map(c => [c.name.toLowerCase(), c])
  );
  const locationSet = new Set<string>(
    existing.locations.map(l => `${l.clusterId}::${l.platform}::${l.value}`)
  );

  const newClusters: Cluster[] = [...existing.clusters];
  const newLocations: LocationEntry[] = [...existing.locations];

  for (const row of rows) {
    const key = row.campaign.toLowerCase();
    let cluster = clusterMap.get(key);
    if (!cluster) {
      cluster = { id: genId(), name: row.campaign };
      clusterMap.set(key, cluster);
      newClusters.push(cluster);
    }

    const locKey = `${cluster.id}::${row.platform}::${row.location}`;
    if (!locationSet.has(locKey)) {
      locationSet.add(locKey);
      newLocations.push({
        id: genId(),
        value: row.location,
        platform: row.platform,
        clusterId: cluster.id,
      });
    }
  }

  return { clusters: newClusters, locations: newLocations };
}
