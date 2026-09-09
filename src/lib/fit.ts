// Cubic bezier curve fitting for closed polylines (Schneider, "An Algorithm for
// Automatically Fitting Digitized Curves", Graphics Gems 1990). Replaces the
// one-cubic-per-sample Catmull-Rom output with the fewest cubics that stay
// within a tolerance of the polyline, which is what cutters want.

import type { Point, Poly } from './cutline';

export interface Cubic {
  p0: Point;
  c1: Point;
  c2: Point;
  p1: Point;
}

const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const add = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1]];
const scale = (a: Point, k: number): Point => [a[0] * k, a[1] * k];
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
const len = (a: Point) => Math.hypot(a[0], a[1]);
const normalize = (a: Point): Point => {
  const l = len(a);
  return l > 0 ? [a[0] / l, a[1] / l] : [0, 0];
};

function bezierPoint(b: Cubic, t: number): Point {
  const mt = 1 - t;
  const a = mt * mt * mt, bb = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t;
  return [
    a * b.p0[0] + bb * b.c1[0] + c * b.c2[0] + d * b.p1[0],
    a * b.p0[1] + bb * b.c1[1] + c * b.c2[1] + d * b.p1[1],
  ];
}

/** Fit one closed polyline. The seam at index 0 gets a central-difference tangent so it stays smooth. */
export function fitClosed(poly: Poly, tolerance: number): Cubic[] {
  const n = poly.length;
  if (n < 3) return [];
  const d = poly.concat([poly[0]]);
  const tHat1 = normalize(sub(d[1], d[n - 1]));
  const tHat2: Point = [-tHat1[0], -tHat1[1]];
  const out: Cubic[] = [];
  fitCubic(d, 0, n, tHat1, tHat2, tolerance, out);
  return out;
}

function fitCubic(d: Point[], first: number, last: number, tHat1: Point, tHat2: Point, error: number, out: Cubic[]) {
  if (last - first === 1) {
    const dist = len(sub(d[last], d[first])) / 3;
    out.push({ p0: d[first], c1: add(d[first], scale(tHat1, dist)), c2: add(d[last], scale(tHat2, dist)), p1: d[last] });
    return;
  }
  let u = chordLengthParameterize(d, first, last);
  let bez = generateBezier(d, first, last, u, tHat1, tHat2);
  let { maxError, splitPoint } = computeMaxError(d, first, last, bez, u);
  if (maxError < error) {
    out.push(bez);
    return;
  }
  // Close enough that a few Newton-Raphson reparameterisations may bring it in.
  if (maxError < error * 4) {
    for (let i = 0; i < 4; i++) {
      u = reparameterize(d, first, u, bez);
      bez = generateBezier(d, first, last, u, tHat1, tHat2);
      ({ maxError, splitPoint } = computeMaxError(d, first, last, bez, u));
      if (maxError < error) {
        out.push(bez);
        return;
      }
    }
  }
  const tHatCenter = normalize(sub(d[splitPoint - 1], d[splitPoint + 1]));
  fitCubic(d, first, splitPoint, tHat1, tHatCenter, error, out);
  fitCubic(d, splitPoint, last, [-tHatCenter[0], -tHatCenter[1]], tHat2, error, out);
}

function chordLengthParameterize(d: Point[], first: number, last: number): number[] {
  const u = [0];
  for (let i = first + 1; i <= last; i++) u.push(u[u.length - 1] + len(sub(d[i], d[i - 1])));
  const total = u[u.length - 1] || 1;
  return u.map(v => v / total);
}

function generateBezier(d: Point[], first: number, last: number, u: number[], tHat1: Point, tHat2: Point): Cubic {
  let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
  for (let i = first; i <= last; i++) {
    const t = u[i - first], mt = 1 - t;
    const b0 = mt * mt * mt, b1 = 3 * mt * mt * t, b2 = 3 * mt * t * t, b3 = t * t * t;
    const a0 = scale(tHat1, b1), a1 = scale(tHat2, b2);
    c00 += dot(a0, a0);
    c01 += dot(a0, a1);
    c11 += dot(a1, a1);
    const tmp = sub(d[i], add(scale(d[first], b0 + b1), scale(d[last], b2 + b3)));
    x0 += dot(a0, tmp);
    x1 += dot(a1, tmp);
  }
  const detC0C1 = c00 * c11 - c01 * c01;
  const detC0X = c00 * x1 - c01 * x0;
  const detXC1 = x0 * c11 - x1 * c01;
  let alphaL = detC0C1 === 0 ? 0 : detXC1 / detC0C1;
  let alphaR = detC0C1 === 0 ? 0 : detC0X / detC0C1;
  const segLength = len(sub(d[last], d[first]));
  const epsilon = 1e-6 * segLength;
  if (alphaL < epsilon || alphaR < epsilon) alphaL = alphaR = segLength / 3;
  return { p0: d[first], c1: add(d[first], scale(tHat1, alphaL)), c2: add(d[last], scale(tHat2, alphaR)), p1: d[last] };
}

function computeMaxError(d: Point[], first: number, last: number, bez: Cubic, u: number[]) {
  let maxError = 0, splitPoint = (last - first + 1) >> 1;
  splitPoint += first;
  for (let i = first + 1; i < last; i++) {
    const p = bezierPoint(bez, u[i - first]);
    const dist = len(sub(p, d[i]));
    if (dist >= maxError) {
      maxError = dist;
      splitPoint = i;
    }
  }
  return { maxError, splitPoint };
}

function reparameterize(d: Point[], first: number, u: number[], bez: Cubic): number[] {
  return u.map((t, k) => newtonRaphsonRootFind(bez, d[first + k], t));
}

function newtonRaphsonRootFind(q: Cubic, p: Point, u: number): number {
  const q1 = [scale(sub(q.c1, q.p0), 3), scale(sub(q.c2, q.c1), 3), scale(sub(q.p1, q.c2), 3)];
  const q2 = [scale(sub(q1[1], q1[0]), 2), scale(sub(q1[2], q1[1]), 2)];
  const qu = bezierPoint(q, u);
  const mt = 1 - u;
  const q1u: Point = [
    mt * mt * q1[0][0] + 2 * mt * u * q1[1][0] + u * u * q1[2][0],
    mt * mt * q1[0][1] + 2 * mt * u * q1[1][1] + u * u * q1[2][1],
  ];
  const q2u: Point = [mt * q2[0][0] + u * q2[1][0], mt * q2[0][1] + u * q2[1][1]];
  const diff = sub(qu, p);
  const numerator = dot(diff, q1u);
  const denominator = dot(q1u, q1u) + dot(diff, q2u);
  if (denominator === 0) return u;
  return Math.min(1, Math.max(0, u - numerator / denominator));
}

/** Path data for a set of closed cubic runs, mapping points through `cv` (e.g. mask px → SVG units). */
export function cubicsPath(runs: Cubic[][], cv: (p: Point) => Point): string {
  const f = (v: number) => (Math.round(v * 100) / 100).toString();
  const pt = (p: Point) => {
    const q = cv(p);
    return `${f(q[0])} ${f(q[1])}`;
  };
  let d = '';
  for (const run of runs) {
    if (!run.length) continue;
    d += `M${pt(run[0].p0)}`;
    for (const c of run) d += `C${pt(c.c1)} ${pt(c.c2)} ${pt(c.p1)}`;
    d += 'Z';
  }
  return d;
}
