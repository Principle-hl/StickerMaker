// Source artwork: SVG text or a transparent raster. Parsed once per source into
// something `rasterize` can draw at any resolution, plus what we could learn
// about its physical size and anything likely to trip up the trace.

import type { ViewBox } from './cutline';

export type Source = { kind: 'svg'; text: string } | { kind: 'raster'; dataUrl: string; name: string };

export interface Artwork {
  kind: 'svg' | 'raster';
  /** Parsed `<svg>` root for SVG sources, null for rasters. */
  root: Element | null;
  vb: ViewBox;
  img: HTMLImageElement;
  /** For rasters: the data URL embedded into exports. */
  dataUrl: string | null;
  name: string | null;
  /** Physical width the file declares, in mm, or null when it only speaks pixels. */
  declaredWidthMm: number | null;
  /** i18n keys (`warn.*`), translated at display time. */
  warnings: string[];
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('err.render')); };
    img.src = url;
  });
}

function stripSizeFromStyle(el: Element) {
  const st = el.getAttribute('style');
  if (!st) return;
  const cleaned = st.replace(/(^|;)\s*(width|height)\s*:[^;]*/gi, '$1').replace(/;;+/g, ';').trim();
  if (cleaned) el.setAttribute('style', cleaned); else el.removeAttribute('style');
}

/** Clone of the source root normalised for embedding: explicit xmlns and viewBox, no preserveAspectRatio or CSS size. */
export function cloneRoot(root: Element, vb: ViewBox): Element {
  const clone = root.cloneNode(true) as Element;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('viewBox', vb.join(' '));
  clone.removeAttribute('preserveAspectRatio');
  stripSizeFromStyle(clone);
  return clone;
}

const MM_PER_UNIT: Record<string, number> = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6 };

/** Millimetres for an SVG length with a physical unit; null for px, unitless or percentages. */
function lengthMm(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.trim().match(/^([\d.]+)\s*([a-z%]*)$/i);
  if (!m) return null;
  const value = parseFloat(m[1]);
  const per = MM_PER_UNIT[m[2].toLowerCase()];
  return per && isFinite(value) && value > 0 ? value * per : null;
}

/** PNG pHYs chunk → mm width. 72 dpi is treated as "unknown": it is the default most tools write when nobody set a size. */
function pngWidthMm(bytes: Uint8Array, widthPx: number): number | null {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 8 || sig.some((b, i) => bytes[i] !== b)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 8;
  while (p + 8 <= bytes.length) {
    const length = view.getUint32(p);
    const type = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]);
    if (type === 'pHYs' && length >= 9) {
      const ppm = view.getUint32(p + 8);
      const unit = bytes[p + 16];
      if (unit === 1 && ppm > 0) {
        const dpi = ppm * 0.0254;
        if (Math.abs(dpi - 72) < 1) return null;
        return (widthPx / ppm) * 1000;
      }
      return null;
    }
    if (type === 'IDAT' || type === 'IEND') return null;
    p += 12 + length;
  }
  return null;
}

async function loadSvg(text: string): Promise<Artwork> {
  const doc = new DOMParser().parseFromString(text.trim(), 'image/svg+xml');
  const root = doc.documentElement;
  if (doc.querySelector('parsererror') || root.nodeName.toLowerCase() !== 'svg') throw new Error('err.notSvg');
  root.querySelectorAll('metadata, script').forEach(n => n.remove());

  const warnings: string[] = [];
  let vb = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  if (vb.length !== 4 || vb.some(n => !isFinite(n)) || vb[2] <= 0 || vb[3] <= 0) {
    const w = parseFloat(root.getAttribute('width') || '') || 100, h = parseFloat(root.getAttribute('height') || '') || 100;
    vb = [0, 0, w, h];
    if (!root.getAttribute('width') || !root.getAttribute('height')) warnings.push('warn.noViewBox');
  }
  const box: ViewBox = [vb[0], vb[1], vb[2], vb[3]];

  if (root.querySelector('text, tspan')) warnings.push('warn.text');
  const linked = [...root.querySelectorAll('image')].some(el => {
    const href = el.getAttribute('href') || el.getAttribute('xlink:href') || '';
    return href && !href.startsWith('data:');
  });
  if (linked) warnings.push('warn.linkedImage');

  const clone = cloneRoot(root, box);
  clone.setAttribute('width', String(box[2]));
  clone.setAttribute('height', String(box[3]));
  const str = new XMLSerializer().serializeToString(clone).replace(/currentColor/g, '#000');
  const img = await loadImage(new Blob([str], { type: 'image/svg+xml;charset=utf-8' }));

  return {
    kind: 'svg',
    root,
    vb: box,
    img,
    dataUrl: null,
    name: null,
    declaredWidthMm: lengthMm(root.getAttribute('width')),
    warnings,
  };
}

async function loadRaster(dataUrl: string, name: string): Promise<Artwork> {
  const blob = await fetch(dataUrl).then(r => r.blob());
  const img = await loadImage(blob);
  const w = img.naturalWidth, h = img.naturalHeight;
  if (!w || !h) throw new Error('err.noSize');

  const warnings: string[] = [];
  // Opaque images trace as a rectangle. Sample the alpha channel to say so up front.
  const cv = document.createElement('canvas');
  const size = 64;
  cv.width = size; cv.height = size;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  let transparent = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] <= 96) transparent++;
  if (transparent === 0) warnings.push('warn.opaque');

  const bytes = new Uint8Array(await blob.arrayBuffer());
  return {
    kind: 'raster',
    root: null,
    vb: [0, 0, w, h],
    img,
    dataUrl,
    name,
    declaredWidthMm: pngWidthMm(bytes, w),
    warnings,
  };
}

export function loadArtwork(source: Source): Promise<Artwork> {
  return source.kind === 'svg' ? loadSvg(source.text) : loadRaster(source.dataUrl, source.name);
}

/** Standalone SVG of just the artwork at 1:1 in its own viewBox. Used for the preview's artwork layer. */
export function artworkSvg(art: Artwork): string {
  const [x, y, w, h] = art.vb;
  if (art.kind === 'raster') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}"><image href="${art.dataUrl}" x="${x}" y="${y}" width="${w}" height="${h}"/></svg>`;
  }
  const clone = cloneRoot(art.root!, art.vb);
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));
  return new XMLSerializer().serializeToString(clone);
}

/** The artwork as an element placed at 1:1 inside a parent SVG (for exports). */
export function artworkElement(art: Artwork): string {
  const [x, y, w, h] = art.vb;
  if (art.kind === 'raster') {
    return `<image id="Artwork" href="${art.dataUrl}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
  }
  const el = cloneRoot(art.root!, art.vb);
  el.setAttribute('id', 'Artwork');
  el.setAttribute('x', String(x)); el.setAttribute('y', String(y));
  el.setAttribute('width', String(w)); el.setAttribute('height', String(h));
  return new XMLSerializer().serializeToString(el);
}

/** Read a dropped/opened/pasted file into a Source, or null when it is not something we can use. */
export async function sourceFromFile(file: File): Promise<Source | null> {
  const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
  if (isSvg) return { kind: 'svg', text: await file.text() };
  // Some browsers and drag sources report no MIME type; trust the extension then.
  if (/^image\//.test(file.type) || /\.(png|webp|jpe?g|gif|bmp|avif)$/i.test(file.name)) {
    const dataUrl = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.onerror = () => rej(r.error);
      r.readAsDataURL(file);
    });
    return { kind: 'raster', dataUrl, name: file.name };
  }
  return null;
}
