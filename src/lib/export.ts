// Export builders. Every file carries real millimetre dimensions so it lands at
// 1:1 in Illustrator, CorelDRAW, Silhouette Studio or a RIP.

import { artworkElement } from './artwork';
import type { Artwork } from './artwork';
import type { ViewBox } from './cutline';

export interface StickerDoc {
  art: Artwork;
  vb: ViewBox;
  /** Frame margin around the artwork, in SVG units. */
  margin: number;
  unitsPerMm: number;
  /** Cut contour path data, SVG units. */
  cutD: string;
  /** Contour the fill follows (cut ⊕ bleed), or null to fill the cut contour. */
  bleedD: string | null;
}

export interface StickerOptions {
  cutName: string;
  cutColor: string;
  showCutLine: boolean;
  /** Stroke width in SVG units. */
  strokeWidth: number;
  /** Fill colour, or 'none' for a clear sticker. */
  fill: string;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

function frame(doc: StickerDoc) {
  const [vx, vy, vw, vh] = doc.vb, m = doc.margin;
  const w = vw + 2 * m, h = vh + 2 * m;
  return {
    viewBox: `${r2(vx - m)} ${r2(vy - m)} ${r2(w)} ${r2(h)}`,
    widthMm: w / doc.unitsPerMm,
    heightMm: h / doc.unitsPerMm,
  };
}

const open = (doc: StickerDoc) => {
  const f = frame(doc);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f.viewBox}" width="${f.widthMm.toFixed(3)}mm" height="${f.heightMm.toFixed(3)}mm">`;
};

function fillPath(doc: StickerDoc, fill: string) {
  if (fill === 'none') return '';
  return `\n  <path id="${doc.bleedD ? 'Bleed' : 'Fill'}" fill="${fill}" fill-rule="evenodd" d="${doc.bleedD ?? doc.cutD}"/>`;
}

function cutPath(doc: StickerDoc, o: StickerOptions) {
  return `\n  <path id="${o.cutName}" fill="none" stroke="${o.cutColor}" stroke-width="${r2(o.strokeWidth)}" stroke-linejoin="round" d="${doc.cutD}"/>`;
}

/** Print layer plus (optionally) the cut line on top. */
export function stickerSvg(doc: StickerDoc, o: StickerOptions): string {
  return `${open(doc)}\n  <g id="Print">${fillPath(doc, o.fill)}\n    ${artworkElement(doc.art)}\n  </g>${o.showCutLine ? cutPath(doc, o) : ''}\n</svg>\n`;
}

/** Just the cut contour, same frame as the sticker so the two register. */
export function cutlineSvg(doc: StickerDoc, o: StickerOptions): string {
  return `${open(doc)}${cutPath(doc, o)}\n</svg>\n`;
}

/** Print layer only (no cut line), rasterized at `dpi`. Transparent outside the fill. */
export async function printPng(doc: StickerDoc, fill: string, dpi = 300): Promise<Blob> {
  const svg = `${open(doc)}${fillPath(doc, fill)}\n  ${artworkElement(doc.art)}\n</svg>`;
  const f = frame(doc);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('err.printRender'));
      i.src = url;
    });
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round((f.widthMm / 25.4) * dpi));
    cv.height = Math.max(1, Math.round((f.heightMm / 25.4) * dpi));
    cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height);
    return await new Promise<Blob>((res, rej) => cv.toBlob(b => (b ? res(b) : rej(new Error('err.png'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
