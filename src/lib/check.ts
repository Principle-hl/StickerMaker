// Cut checks: things a cutter or a weeding hand will struggle with. All work in
// mask pixels; the caller converts thresholds in and results out.

import type { Poly } from './cutline';

export interface CutCheck {
  /** Smallest corner radius found along the cut contour, in px. Infinity when every corner is gentle. */
  minRadius: number;
  /** Contours whose bounding box is smaller than the speck threshold. */
  specks: number;
  /** True when eroding the shape by half the bridge width splits it into more pieces. */
  narrowBridge: boolean;
}

function circumradius(a: [number, number], b: [number, number], c: [number, number]): number {
  const la = Math.hypot(b[0] - c[0], b[1] - c[1]);
  const lb = Math.hypot(a[0] - c[0], a[1] - c[1]);
  const lc = Math.hypot(a[0] - b[0], a[1] - b[1]);
  const area2 = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]));
  if (area2 < 1e-9) return Infinity;
  return (la * lb * lc) / (2 * area2);
}

/** Corner radius from the circle through each point and its neighbours two samples away. */
export function minCornerRadius(polys: Poly[]): number {
  let min = Infinity;
  for (const p of polys) {
    const n = p.length;
    if (n < 5) continue;
    for (let i = 0; i < n; i++) {
      const r = circumradius(p[(i - 2 + n) % n], p[i], p[(i + 2) % n]);
      if (r < min) min = r;
    }
  }
  return min;
}

export function countSpecks(polys: Poly[], maxSize: number): number {
  let count = 0;
  for (const p of polys) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of p) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    if (Math.max(x1 - x0, y1 - y0) < maxSize) count++;
  }
  return count;
}

/** Label 4-connected foreground components of a binary mask (labels start at 1, 0 = background). */
export function labelComponents(m: Uint8Array, W: number, H: number): { labels: Int32Array; count: number } {
  const labels = new Int32Array(W * H);
  const stack = new Int32Array(W * H);
  let count = 0;
  for (let start = 0; start < W * H; start++) {
    if (!m[start] || labels[start]) continue;
    const label = ++count;
    let sp = 0;
    stack[sp++] = start;
    labels[start] = label;
    while (sp > 0) {
      const i = stack[--sp], x = i % W, y = (i - x) / W;
      const visit = (j: number) => {
        if (m[j] && !labels[j]) {
          labels[j] = label;
          stack[sp++] = j;
        }
      };
      if (x > 0) visit(i - 1);
      if (x < W - 1) visit(i + 1);
      if (y > 0) visit(i - W);
      if (y < H - 1) visit(i + W);
    }
  }
  return { labels, count };
}

/**
 * True when some piece of `shape` falls into two or more pieces of `eroded`
 * (its eroded version): that piece is held together by a neck thinner than
 * the erosion width. Pieces that vanish entirely do not count.
 */
export function splitsWhenEroded(shape: Uint8Array, eroded: Uint8Array, W: number, H: number): boolean {
  const before = labelComponents(shape, W, H);
  const after = labelComponents(eroded, W, H);
  // For each eroded component, the original component it sits inside.
  const parentOf = new Int32Array(after.count + 1);
  for (let i = 0; i < W * H; i++) {
    const a = after.labels[i];
    if (a && !parentOf[a]) parentOf[a] = before.labels[i];
  }
  const seen = new Uint8Array(before.count + 1);
  for (let a = 1; a <= after.count; a++) {
    const b = parentOf[a];
    if (!b) continue;
    if (seen[b]) return true;
    seen[b] = 1;
  }
  return false;
}
