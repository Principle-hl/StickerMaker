// Sticker cut-line generation: rasterize SVG → offset/close/fill → smooth contour → bezier path.
//
// The maths (distance transform, closing, hole fill, blur, marching squares, resample,
// smoothing, bezier fit) is ported verbatim from the design handoff's `cutline.js`.
// Additions on top of it: the raster stage takes a pre-loaded image so one load serves
// every resolution; the trace stage takes a plain-object input so it can run in a Web
// Worker; and an optional bleed contour (the traced shape dilated once more) is produced
// for the print layer. Artwork parsing lives in artwork.ts, exports in export.ts.
const INF = 1e20;

export type ViewBox = [number, number, number, number];
export type Point = [number, number];
export type Poly = Point[];

/** Slider values, expressed as a percentage of the logo's longer side. */
export interface Pct {
  offset: number;
  join: number;
  smooth: number;
  /** Print runs this far past the cut line. Optional; 0 means the fill follows the cut. */
  bleed?: number;
}

export interface TraceResult {
  polys: Poly[];
  islands: number;
  nodes: number;
  /** Cut shape dilated by the bleed radius, when a bleed was asked for. */
  bleedPolys: Poly[] | null;
  /** The binary shape the cut contour was traced from (after offset, closing, hole fill). */
  mask: Uint8Array;
}

/** What `rasterize` needs from the artwork: its box and a renderable image. */
export interface Drawable {
  vb: ViewBox;
  img: CanvasImageSource;
}

/** Everything the raster pass learned about the source artwork. */
export interface RasterInfo extends RasterGeometry {
  vb: ViewBox;
  mask: Uint8Array;
}

/** Scale, padding and mask size for a given artwork, slider set and target resolution. */
export interface RasterGeometry {
  /** SVG units → mask pixels. */
  s: number;
  /** Mask padding in pixels. */
  pad: number;
  W: number;
  H: number;
  /** Slider values converted to mask pixels. */
  px: { offset: number; join: number; smooth: number; bleed: number };
  /** Mask padding in SVG units. */
  marginUnits: number;
}

/** The subset of RasterInfo that `trace` and `toPath` need; structured-cloneable, so it can cross to a worker. */
export type TraceInput = Pick<RasterInfo, 'W' | 'H' | 'px' | 'mask' | 's' | 'pad' | 'vb'>;

export function rasterGeometry(vb: ViewBox, pct: Pct, target = 1400): RasterGeometry {
  const [, , vw, vh] = vb;
  let s = target / Math.max(vw, vh);
  let off = pct.offset / 100 * target, join = pct.join / 100 * target, sm = pct.smooth / 100 * target, bl = (pct.bleed ?? 0) / 100 * target;
  let pad = Math.ceil(off + bl + join + sm * 3 + 6);
  let W = Math.ceil(vw * s) + 2 * pad, H = Math.ceil(vh * s) + 2 * pad;
  const k = Math.min(1, Math.sqrt(3.2e6 / (W * H)));
  if (k < 1) { s *= k; off *= k; join *= k; sm *= k; bl *= k; pad = Math.ceil(pad * k); W = Math.ceil(vw * s) + 2 * pad; H = Math.ceil(vh * s) + 2 * pad; }
  return { s, pad, W, H, px: { offset: off, join, smooth: Math.max(1, sm), bleed: bl }, marginUnits: pad / s };
}

export function rasterize(art: Drawable, pct: Pct, target = 1400): RasterInfo {
  const { vb, img } = art;
  const [, , vw, vh] = vb;
  const geo = rasterGeometry(vb, pct, target);
  const { s, pad, W, H } = geo;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, pad, pad, vw * s, vh * s);
  const data = ctx.getImageData(0, 0, W, H).data;
  const mask = new Uint8Array(W * H); let ink = 0;
  for (let i = 0, n = W * H; i < n; i++) if (data[i * 4 + 3] > 96) { mask[i] = 1; ink++; }
  if (!ink) throw new Error('err.empty');
  return { ...geo, vb, mask };
}

// ---- Exact Euclidean distance transform (Felzenszwalb & Huttenlocher) ----
function edt1d(f: Float64Array, d: Float64Array, v: Int32Array, z: Float64Array, n: number) {
  let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
}
function distTo(mask: Uint8Array, W: number, H: number, val: number): Float64Array {
  const g = new Float64Array(W * H);
  for (let i = 0; i < W * H; i++) g[i] = mask[i] === val ? 0 : INF;
  const n = Math.max(W, H), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < W; x++) { for (let y = 0; y < H; y++) f[y] = g[y * W + x]; edt1d(f, d, v, z, H); for (let y = 0; y < H; y++) g[y * W + x] = d[y]; }
  for (let y = 0; y < H; y++) { const r = y * W; for (let x = 0; x < W; x++) f[x] = g[r + x]; edt1d(f, d, v, z, W); for (let x = 0; x < W; x++) g[r + x] = d[x]; }
  return g;
}
const thresh = (d: Float64Array, r2: number, le: boolean) => {
  const m = new Uint8Array(d.length);
  for (let i = 0; i < d.length; i++) m[i] = le ? (d[i] <= r2 ? 1 : 0) : (d[i] > r2 ? 1 : 0);
  return m;
};

function fillHoles(m: Uint8Array, W: number, H: number): Uint8Array {
  const seen = new Uint8Array(W * H), q = new Int32Array(W * H); let qh = 0, qt = 0;
  const push = (i: number) => { if (!seen[i] && !m[i]) { seen[i] = 1; q[qt++] = i; } };
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
  while (qh < qt) {
    const i = q[qh++], x = i % W, y = (i - x) / W;
    if (x > 0) push(i - 1); if (x < W - 1) push(i + 1); if (y > 0) push(i - W); if (y < H - 1) push(i + W);
  }
  const out = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) out[i] = (m[i] || !seen[i]) ? 1 : 0;
  return out;
}

function boxBlur(src: Float32Array, dst: Float32Array, W: number, H: number, r: number, horizontal: boolean) {
  const len = horizontal ? W : H, lines = horizontal ? H : W, norm = 1 / (2 * r + 1);
  for (let l = 0; l < lines; l++) {
    const at = (i: number) => horizontal ? l * W + i : i * W + l;
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += src[at(Math.min(len - 1, Math.max(0, i)))];
    for (let i = 0; i < len; i++) {
      dst[at(i)] = sum * norm;
      sum += src[at(Math.min(len - 1, i + r + 1))] - src[at(Math.max(0, i - r))];
    }
  }
}
function blur(m: Uint8Array, W: number, H: number, radius: number): Float32Array {
  const r = Math.max(1, Math.round(radius));
  let a = Float32Array.from(m), b = new Float32Array(W * H);
  for (let p = 0; p < 3; p++) { boxBlur(a, b, W, H, r, true); boxBlur(b, a, W, H, r, false); }
  return a;
}

// ---- Marching squares with linear interpolation, linked into closed polygons ----
const CASES: ([number, number][] | null)[] = [null, [[3, 2]], [[2, 1]], [[3, 1]], [[0, 1]], null, [[0, 2]], [[0, 3]], [[0, 3]], [[0, 2]], null, [[0, 1]], [[3, 1]], [[2, 1]], [[3, 2]], null];
function march(F: Float32Array, W: number, H: number, t: number): Poly[] {
  const NE = W * H * 2, ex = new Float32Array(NE), ey = new Float32Array(NE), adj = new Int32Array(NE * 2).fill(-1);
  const segA: number[] = [], segB: number[] = [];
  const lerp = (a: number, b: number) => (b === a ? 0.5 : (t - a) / (b - a));
  for (let j = 0; j < H - 1; j++) for (let i = 0; i < W - 1; i++) {
    const a = F[j * W + i], b = F[j * W + i + 1], c = F[(j + 1) * W + i + 1], d = F[(j + 1) * W + i];
    const idx = (a >= t ? 8 : 0) | (b >= t ? 4 : 0) | (c >= t ? 2 : 0) | (d >= t ? 1 : 0);
    if (idx === 0 || idx === 15) continue;
    let segs = CASES[idx]!;
    if (idx === 5) segs = (a + b + c + d) / 4 >= t ? [[0, 3], [1, 2]] : [[0, 1], [3, 2]];
    if (idx === 10) segs = (a + b + c + d) / 4 >= t ? [[0, 1], [3, 2]] : [[0, 3], [2, 1]];
    const keys = [(j * W + i) * 2, ((j * W + i + 1) * 2) + 1, ((j + 1) * W + i) * 2, (j * W + i) * 2 + 1];
    ex[keys[0]] = i + lerp(a, b); ey[keys[0]] = j;
    ex[keys[1]] = i + 1; ey[keys[1]] = j + lerp(b, c);
    ex[keys[2]] = i + lerp(d, c); ey[keys[2]] = j + 1;
    ex[keys[3]] = i; ey[keys[3]] = j + lerp(a, d);
    for (const [p, q] of segs) {
      const si = segA.length, ka = keys[p], kb = keys[q];
      segA.push(ka); segB.push(kb);
      adj[adj[ka * 2] < 0 ? ka * 2 : ka * 2 + 1] = si;
      adj[adj[kb * 2] < 0 ? kb * 2 : kb * 2 + 1] = si;
    }
  }
  const n = segA.length, seen = new Uint8Array(n), polys: Poly[] = [];
  for (let s0 = 0; s0 < n; s0++) {
    if (seen[s0]) continue;
    const poly: Poly = []; let seg = s0, e = segA[s0]; const start = e;
    for (;;) {
      seen[seg] = 1;
      const other = segA[seg] === e ? segB[seg] : segA[seg];
      poly.push([ex[other], ey[other]]);
      if (other === start) break;
      const n1 = adj[other * 2], n2 = adj[other * 2 + 1], next = n1 === seg ? n2 : n1;
      if (next < 0 || seen[next]) break;
      seg = next; e = other;
    }
    polys.push(poly);
  }
  return polys;
}

function resample(pts: Poly, spacing: number): Poly {
  const n = pts.length; let L = 0; const segs: number[] = [];
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); segs.push(l); L += l; }
  const count = Math.max(8, Math.round(L / spacing)), step = L / count, out: Poly = [];
  let target = 0, acc = 0;
  for (let i = 0; i < n && out.length < count; i++) {
    const a = pts[i], b = pts[(i + 1) % n], l = segs[i];
    while (l > 0 && target <= acc + l && out.length < count) {
      const t = (target - acc) / l; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); target += step;
    }
    acc += l;
  }
  return out;
}
function laplace(pts: Poly, iters: number): Poly {
  let p = pts; const n = p.length;
  for (let k = 0; k < iters; k++) p = p.map((c, i): Point => { const a = p[(i - 1 + n) % n], b = p[(i + 1) % n]; return [0.25 * a[0] + 0.5 * c[0] + 0.25 * b[0], 0.25 * a[1] + 0.5 * c[1] + 0.25 * b[1]]; });
  return p;
}

export function trace(info: Pick<TraceInput, 'W' | 'H' | 'px' | 'mask'>, fill: boolean): TraceResult {
  const { W, H, px } = info; let m = info.mask;
  if (px.offset > 0.5) m = thresh(distTo(m, W, H, 1), px.offset * px.offset, true);
  if (px.join > 0.5) { const r2 = px.join * px.join; const dil = thresh(distTo(m, W, H, 1), r2, true); m = thresh(distTo(dil, W, H, 0), r2, false); }
  if (fill) m = fillHoles(m, W, H);
  const field = blur(m, W, H, px.smooth);
  const spacing = Math.max(3, px.offset * 0.3, px.smooth * 1.5);
  const contour = (f: Float32Array) => march(f, W, H, 0.5).filter(p => p.length >= 12).map(p => laplace(resample(p, spacing), 2));
  const polys = contour(field);
  let bleedPolys: Poly[] | null = null;
  if (px.bleed > 0.5) {
    const mb = thresh(distTo(m, W, H, 1), px.bleed * px.bleed, true);
    bleedPolys = contour(blur(mb, W, H, px.smooth));
  }
  return { polys, islands: polys.length, nodes: polys.reduce((a, p) => a + p.length, 0), bleedPolys, mask: m };
}

export function toPath(polys: Poly[], info: Pick<TraceInput, 's' | 'pad' | 'vb'>): string {
  const { s, pad, vb } = info, cv = ([x, y]: Point): Point => [(x - pad) / s + vb[0], (y - pad) / s + vb[1]];
  const f = (v: number) => (Math.round(v * 100) / 100).toString();
  let d = '';
  for (const poly of polys) {
    const P = poly.map(cv), n = P.length;
    d += `M${f(P[0][0])} ${f(P[0][1])}`;
    for (let i = 0; i < n; i++) {
      const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
      d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
    }
    d += 'Z';
  }
  return d;
}

/** Shrink a shape by `r` px (used by the narrow-bridge check). */
export function erode(m: Uint8Array, W: number, H: number, r: number): Uint8Array {
  return thresh(distTo(m, W, H, 0), r * r, false);
}
