import { DEFAULT_PARAMS, DEFAULT_SETTINGS } from '../types';
import type { Params, Settings } from '../types';
import type { Source } from './artwork';

const KEY = 'sticker-cut-line:v2';
/** Rasters above this are not persisted; localStorage quotas are small. */
const MAX_PERSISTED_SOURCE = 1.5e6;

export interface Persisted {
  source: Source | null;
  widthMm: number | null;
  params: Params;
  settings: Settings;
}

/** localStorage is unavailable in private/sandboxed contexts; never let it break the app. */
function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

const EMPTY: Persisted = { source: null, widthMm: null, params: DEFAULT_PARAMS, settings: DEFAULT_SETTINGS };

export function load(): Persisted {
  return safe(() => {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const p = JSON.parse(raw) as Partial<Persisted>;
    return {
      source: p.source ?? null,
      widthMm: typeof p.widthMm === 'number' ? p.widthMm : null,
      params: { ...DEFAULT_PARAMS, ...p.params },
      settings: { ...DEFAULT_SETTINGS, ...p.settings },
    };
  }, EMPTY);
}

export function save(state: Persisted) {
  const size = state.source ? (state.source.kind === 'svg' ? state.source.text.length : state.source.dataUrl.length) : 0;
  const source = size > MAX_PERSISTED_SOURCE ? null : state.source;
  safe(() => localStorage.setItem(KEY, JSON.stringify({ ...state, source })), undefined);
}
