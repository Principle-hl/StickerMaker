// Export builders. Every file carries real millimetre dimensions so it lands at
// 1:1 in Illustrator, CorelDRAW, Silhouette Studio or a RIP.

import { artworkElement, artworkSvg } from './artwork';
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

/** How the print PNG will be rendered: pixels per SVG unit and the resulting size. */
export interface PrintPlan {
  /** Canvas px per SVG unit. Exactly 1 for a raster at its own resolution (pixel-exact copy). */
  scale: number;
  dpi: number;
  width: number;
  height: number;
  /** Margin in whole canvas px, so the artwork lands on integer coordinates. */
  marginPx: number;
}

/** Never export below print resolution; a raster above it keeps every source pixel. */
const MIN_DPI = 300;

export function printPlan(doc: StickerDoc): PrintPlan {
  const [, , vw, vh] = doc.vb;
  const minScale = MIN_DPI / 25.4 / doc.unitsPerMm;
  // For rasters, units are source pixels: scale 1 means one source pixel per output pixel.
  const scale = doc.art.kind === 'raster' ? Math.max(1, minScale) : minScale;
  const marginPx = Math.ceil(doc.margin * scale);
  return {
    scale,
    dpi: scale * doc.unitsPerMm * 25.4,
    width: Math.round(vw * scale) + 2 * marginPx,
    height: Math.round(vh * scale) + 2 * marginPx,
    marginPx,
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('err.printRender'));
    i.src = src;
  });
}

// ---- PNG pHYs: physical size, so the file opens at the right millimetres ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Insert a pHYs chunk (pixels per metre) right after IHDR. Canvas PNGs carry no size at all. */
export async function withDpi(blob: Blob, dpi: number): Promise<Blob> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const ihdrEnd = 8 + 4 + 4 + 13 + 4;
  if (bytes.length < ihdrEnd || String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR') return blob;
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(4 + 4 + 9 + 4);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // 'pHYs'
  view.setUint32(8, ppm);
  view.setUint32(12, ppm);
  chunk[16] = 1; // unit: metre
  view.setUint32(17, crc32(chunk.subarray(4, 17)));
  const out = new Uint8Array(bytes.length + chunk.length);
  out.set(bytes.subarray(0, ihdrEnd), 0);
  out.set(chunk, ihdrEnd);
  out.set(bytes.subarray(ihdrEnd), ihdrEnd + chunk.length);
  return new Blob([out], { type: 'image/png' });
}

/**
 * Print layer only (fill + artwork, no cut line), transparent outside the fill.
 * Drawn straight onto a canvas: the fill as a vector path, the artwork with
 * `drawImage` under a single scale transform. A raster at its own resolution is
 * copied pixel for pixel; an SVG is rasterized by the browser at the target dpi.
 */
export async function printPng(doc: StickerDoc, fill: string): Promise<Blob> {
  const plan = printPlan(doc);
  const [vx, vy, vw, vh] = doc.vb;
  const art = doc.art;
  // The mask image had currentColor forced to black; the print wants the true colours.
  const image =
    art.kind === 'raster' && art.dataUrl
      ? await loadImage(art.dataUrl)
      : await (async () => {
          const url = URL.createObjectURL(new Blob([artworkSvg(art)], { type: 'image/svg+xml;charset=utf-8' }));
          try {
            return await loadImage(url);
          } finally {
            URL.revokeObjectURL(url);
          }
        })();

  const cv = document.createElement('canvas');
  cv.width = Math.max(1, plan.width);
  cv.height = Math.max(1, plan.height);
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  // Units → px, with the artwork's corner on an integer pixel.
  ctx.setTransform(plan.scale, 0, 0, plan.scale, plan.marginPx - vx * plan.scale, plan.marginPx - vy * plan.scale);
  if (fill !== 'none') {
    ctx.fillStyle = fill;
    ctx.fill(new Path2D(doc.bleedD ?? doc.cutD), 'evenodd');
  }
  ctx.drawImage(image, vx, vy, vw, vh);

  const blob = await new Promise<Blob>((res, rej) => cv.toBlob(b => (b ? res(b) : rej(new Error('err.png'))), 'image/png'));
  return withDpi(blob, plan.dpi);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
