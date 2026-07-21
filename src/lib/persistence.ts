/**
 * Model persistence to the browser's localStorage. Client-side only — models
 * never leave the machine, consistent with the local-only data policy. Generic
 * over the snapshot shape so it stays decoupled from the store.
 */
const KEY = 'vm.models.v1';

export interface SavedModel<T = unknown> {
  id: string;
  name: string;
  savedAt: number;
  snapshot: T;
}

export function loadAll<T = unknown>(): SavedModel<T>[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    const list = raw ? (JSON.parse(raw) as SavedModel<T>[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveAll<T = unknown>(list: SavedModel<T>[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // localStorage unavailable or over quota — fail silently; in-memory state stands.
  }
}
