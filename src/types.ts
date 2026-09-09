import type { TargetId } from './lib/targets';

export type Bg = 'light' | 'dark' | 'grid';

/** Contour controls, all in millimetres of the finished sticker. */
export interface Params {
  /** Cut line distance from the artwork. */
  offsetMm: number;
  /** How far the print runs past the cut line. */
  bleedMm: number;
  /** Gaps narrower than this are bridged into one outline. */
  joinMm: number;
  smoothMm: number;
  fillHoles: boolean;
}

/** Output conventions; changing these never re-traces. */
export interface Settings {
  target: TargetId;
  cutColor: string;
  lineWidthMm: number;
  /** Fill colour, or 'none' for a clear sticker. */
  stickerFill: string;
  showCutLine: boolean;
  /** Curve-fit tolerance in mm. 0 keeps the dense one-cubic-per-sample path. */
  simplifyMm: number;
}

export interface Stats {
  islands: number;
  nodes: number;
  /** Finished sticker size (cut contour bounding box), mm. */
  widthMm: number;
  heightMm: number;
}

export interface CutNotes {
  minRadiusMm: number;
  specks: number;
  narrowBridge: boolean;
}

export const DEFAULT_PARAMS: Params = {
  offsetMm: 2,
  bleedMm: 1.5,
  joinMm: 3,
  smoothMm: 0.3,
  fillHoles: true,
};

export const DEFAULT_SETTINGS: Settings = {
  target: 'generic',
  cutColor: '#ff00ff',
  lineWidthMm: 0.1,
  stickerFill: '#ffffff',
  showCutLine: true,
  simplifyMm: 0.05,
};

/** Fallback artwork width when the file does not say. */
export const DEFAULT_WIDTH_MM = 50;

export const CUT_COLOR_SWATCHES = ['#ff00ff', '#ff3b30', '#00b4ff', '#1b1b1b'];

/** Pieces smaller than this are hard to weed. */
export const SPECK_MM = 3;
/** Necks narrower than this tear when weeding. */
export const BRIDGE_MM = 2;
