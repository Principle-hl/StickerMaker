// Sticker cut-line generation: rasterize SVG → offset/close/fill → smooth contour → bezier path.
const INF = 1e20;

function loadImage(blob) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Browser could not render this SVG')); };
    img.src = url;
  });
}

function stripSizeFromStyle(el) {
  const st = el.getAttribute('style');
  if (!st) return;
  const cleaned = st.replace(/(^|;)\s*(width|height)\s*:[^;]*/gi, '$1').replace(/;;+/g, ';').trim();
  if (cleaned) el.setAttribute('style', cleaned); else el.removeAttribute('style');
}

export async function rasterize(svgText, pct, target = 1400) {
  const doc = new DOMParser().parseFromString(svgText.trim(), 'image/svg+xml');
  const root = doc.documentElement;
  if (doc.querySelector('parsererror') || root.nodeName.toLowerCase() !== 'svg') throw new Error('That is not a valid SVG');
  root.querySelectorAll('metadata, script').forEach(n => n.remove());
  let vb = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  if (vb.length !== 4 || vb.some(n => !isFinite(n)) || vb[2] <= 0 || vb[3] <= 0) {
    const w = parseFloat(root.getAttribute('width')) || 100, h = parseFloat(root.getAttribute('height')) || 100;
    vb = [0, 0, w, h];
  }
  const [vx, vy, vw, vh] = vb;
  let s = target / Math.max(vw, vh);
  let off = pct.offset / 100 * target, join = pct.join / 100 * target, sm = pct.smooth / 100 * target;
  let pad = Math.ceil(off + join + sm * 3 + 6);
  let W = Math.ceil(vw * s) + 2 * pad, H = Math.ceil(vh * s) + 2 * pad;
  const k = Math.min(1, Math.sqrt(3.2e6 / (W * H)));
  if (k < 1) { s *= k; off *= k; join *= k; sm *= k; pad = Math.ceil(pad * k); W = Math.ceil(vw * s) + 2 * pad; H = Math.ceil(vh * s) + 2 * pad; }

  const clone = root.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('viewBox', vb.join(' '));
  clone.setAttribute('width', vw * s);
  clone.setAttribute('height', vh * s);
  clone.removeAttribute('preserveAspectRatio');
  stripSizeFromStyle(clone);
  const str = new XMLSerializer().serializeToString(clone).replace(/currentColor/g, '#000');
  const img = await loadImage(new Blob([str], { type: 'image/svg+xml;charset=utf-8' }));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, pad, pad, vw * s, vh * s);
  const data = ctx.getImageData(0, 0, W, H).data;
  const mask = new Uint8Array(W * H); let ink = 0;
  for (let i = 0, n = W * H; i < n; i++) if (data[i * 4 + 3] > 96) { mask[i] = 1; ink++; }
  if (!ink) throw new Error('SVG rendered empty — no visible shapes');
  return { root, vb, s, pad, W, H, mask, px: { offset: off, join, smooth: Math.max(1, sm) }, marginUnits: pad / s };
}

// ---- Exact Euclidean distance transform (Felzenszwalb & Huttenlocher) ----
function edt1d(f, d, v, z, n) {
  let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
}
function distTo(mask, W, H, val) {
  const g = new Float64Array(W * H);
  for (let i = 0; i < W * H; i++) g[i] = mask[i] === val ? 0 : INF;
  const n = Math.max(W, H), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < W; x++) { for (let y = 0; y < H; y++) f[y] = g[y * W + x]; edt1d(f, d, v, z, H); for (let y = 0; y < H; y++) g[y * W + x] = d[y]; }
  for (let y = 0; y < H; y++) { const r = y * W; for (let x = 0; x < W; x++) f[x] = g[r + x]; edt1d(f, d, v, z, W); for (let x = 0; x < W; x++) g[r + x] = d[x]; }
  return g;
}
const thresh = (d, r2, le) => { const m = new Uint8Array(d.length); for (let i = 0; i < d.length; i++) m[i] = le ? (d[i] <= r2 ? 1 : 0) : (d[i] > r2 ? 1 : 0); return m; };

function fillHoles(m, W, H) {
  const seen = new Uint8Array(W * H), q = new Int32Array(W * H); let qh = 0, qt = 0;
  const push = i => { if (!seen[i] && !m[i]) { seen[i] = 1; q[qt++] = i; } };
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

function boxBlur(src, dst, W, H, r, horizontal) {
  const len = horizontal ? W : H, lines = horizontal ? H : W, norm = 1 / (2 * r + 1);
  for (let l = 0; l < lines; l++) {
    const at = i => horizontal ? l * W + i : i * W + l;
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += src[at(Math.min(len - 1, Math.max(0, i)))];
    for (let i = 0; i < len; i++) {
      dst[at(i)] = sum * norm;
      sum += src[at(Math.min(len - 1, i + r + 1))] - src[at(Math.max(0, i - r))];
    }
  }
}
function blur(m, W, H, radius) {
  const r = Math.max(1, Math.round(radius));
  let a = Float32Array.from(m), b = new Float32Array(W * H);
  for (let p = 0; p < 3; p++) { boxBlur(a, b, W, H, r, true); boxBlur(b, a, W, H, r, false); }
  return a;
}

// ---- Marching squares with linear interpolation, linked into closed polygons ----
const CASES = [null, [[3, 2]], [[2, 1]], [[3, 1]], [[0, 1]], null, [[0, 2]], [[0, 3]], [[0, 3]], [[0, 2]], null, [[0, 1]], [[3, 1]], [[2, 1]], [[3, 2]], null];
function march(F, W, H, t) {
  const NE = W * H * 2, ex = new Float32Array(NE), ey = new Float32Array(NE), adj = new Int32Array(NE * 2).fill(-1);
  const segA = [], segB = [];
  const lerp = (a, b) => (b === a ? 0.5 : (t - a) / (b - a));
  for (let j = 0; j < H - 1; j++) for (let i = 0; i < W - 1; i++) {
    const a = F[j * W + i], b = F[j * W + i + 1], c = F[(j + 1) * W + i + 1], d = F[(j + 1) * W + i];
    const idx = (a >= t ? 8 : 0) | (b >= t ? 4 : 0) | (c >= t ? 2 : 0) | (d >= t ? 1 : 0);
    if (idx === 0 || idx === 15) continue;
    let segs = CASES[idx];
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
  const n = segA.length, seen = new Uint8Array(n), polys = [];
  for (let s0 = 0; s0 < n; s0++) {
    if (seen[s0]) continue;
    const poly = []; let seg = s0, e = segA[s0]; const start = e;
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

function resample(pts, spacing) {
  const n = pts.length; let L = 0; const segs = [];
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); segs.push(l); L += l; }
  const count = Math.max(8, Math.round(L / spacing)), step = L / count, out = [];
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
function laplace(pts, iters) {
  let p = pts; const n = p.length;
  for (let k = 0; k < iters; k++) p = p.map((c, i) => { const a = p[(i - 1 + n) % n], b = p[(i + 1) % n]; return [0.25 * a[0] + 0.5 * c[0] + 0.25 * b[0], 0.25 * a[1] + 0.5 * c[1] + 0.25 * b[1]]; });
  return p;
}

export function trace(info, fill) {
  const { W, H, px } = info; let m = info.mask;
  if (px.offset > 0.5) m = thresh(distTo(m, W, H, 1), px.offset * px.offset, true);
  if (px.join > 0.5) { const r2 = px.join * px.join; const dil = thresh(distTo(m, W, H, 1), r2, true); m = thresh(distTo(dil, W, H, 0), r2, false); }
  if (fill) m = fillHoles(m, W, H);
  const field = blur(m, W, H, px.smooth);
  const spacing = Math.max(3, px.offset * 0.3, px.smooth * 1.5);
  const polys = march(field, W, H, 0.5).filter(p => p.length >= 12).map(p => laplace(resample(p, spacing), 2));
  return { polys, islands: polys.length, nodes: polys.reduce((a, p) => a + p.length, 0) };
}

export function toPath(polys, info) {
  const { s, pad, vb } = info, cv = ([x, y]) => [(x - pad) / s + vb[0], (y - pad) / s + vb[1]];
  const f = v => (Math.round(v * 100) / 100).toString();
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

export function buildSvg(info, d, { cutColor = '#ff00ff', fill = '#ffffff', includeLogo = true, strokeWidth } = {}) {
  const [vx, vy, vw, vh] = info.vb, m = info.marginUnits, r = v => Math.round(v * 100) / 100;
  const sw = strokeWidth ?? Math.max(vw, vh) * 0.0025;
  let inner = '';
  if (includeLogo) {
    const el = info.root.cloneNode(true);
    el.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    el.setAttribute('x', vx); el.setAttribute('y', vy); el.setAttribute('width', vw); el.setAttribute('height', vh);
    el.setAttribute('viewBox', info.vb.join(' ')); el.removeAttribute('preserveAspectRatio');
    stripSizeFromStyle(el);
    inner = '\n  ' + new XMLSerializer().serializeToString(el);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r(vx - m)} ${r(vy - m)} ${r(vw + 2 * m)} ${r(vh + 2 * m)}" width="${r(vw + 2 * m)}" height="${r(vh + 2 * m)}">\n  <path id="CutContour" fill="${fill}" fill-rule="evenodd" stroke="${cutColor}" stroke-width="${r(sw)}" stroke-linejoin="round" d="${d}"/>${inner}\n</svg>\n`;
}
