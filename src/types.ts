export type Platform = 'GOOGLE' | 'BING';

export interface Cluster {
  id: string;
  name: string;
}

export interface LocationEntry {
  id: string;
  value: string;
  platform: Platform;
  clusterId: string;
}

export interface AppData {
  clusters: Cluster[];
  locations: LocationEntry[];
}
