import type { AppData } from '../types';

const KEY = 'geotarget_v1';

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as AppData;
  } catch {
    // corrupted data — fall through to empty state
  }
  return { clusters: [], locations: [] };
}

export function saveData(data: AppData): void {
  localStorage.setItem(KEY, JSON.stringify(data));
}

export function clearData(): void {
  localStorage.removeItem(KEY);
}
