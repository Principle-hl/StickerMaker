import { erode, toPath, trace } from '../lib/cutline';
import type { Point, Poly, TraceInput } from '../lib/cutline';
import { countSpecks, minCornerRadius, splitsWhenEroded } from '../lib/check';
import { cubicsPath, fitClosed } from '../lib/fit';

export interface TraceJob extends TraceInput {
  id: number;
  fill: boolean;
  /** Curve-fit tolerance in mask px; 0 keeps the dense Catmull-Rom path. */
  simplifyPx: number;
  /** Thresholds in mask px; null skips the checks (preview tier). */
  check: { speckPx: number; bridgePx: number } | null;
}

export interface TraceOk {
  id: number;
  cutD: string;
  bleedD: string | null;
  islands: number;
  nodes: number;
  /** Cut contour bounding box in SVG units: x, y, w, h. */
  bbox: [number, number, number, number];
  check: { minRadiusPx: number; specks: number; narrowBridge: boolean } | null;
}

export type TraceReply = TraceOk | { id: number; error: string };

function bbox(polys: Poly[], cv: (p: Point) => Point): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of polys) for (const q of p) {
    const [x, y] = cv(q);
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return isFinite(x0) ? [x0, y0, x1 - x0, y1 - y0] : [0, 0, 0, 0];
}

self.onmessage = (e: MessageEvent<TraceJob>) => {
  const { id, fill, simplifyPx, check, ...info } = e.data;
  try {
    const res = trace(info, fill);
    const { s, pad, vb } = info;
    const cv = ([x, y]: Point): Point => [(x - pad) / s + vb[0], (y - pad) / s + vb[1]];

    let cutD: string, nodes: number, bleedD: string | null = null;
    if (simplifyPx > 0) {
      const runs = res.polys.map(p => fitClosed(p, simplifyPx));
      cutD = cubicsPath(runs, cv);
      nodes = runs.reduce((a, r) => a + r.length, 0);
      if (res.bleedPolys) bleedD = cubicsPath(res.bleedPolys.map(p => fitClosed(p, simplifyPx)), cv);
    } else {
      cutD = toPath(res.polys, info);
      nodes = res.nodes;
      if (res.bleedPolys) bleedD = toPath(res.bleedPolys, info);
    }

    let checks: TraceOk['check'] = null;
    if (check) {
      const eroded = erode(res.mask, info.W, info.H, check.bridgePx / 2);
      checks = {
        minRadiusPx: minCornerRadius(res.polys),
        specks: countSpecks(res.polys, check.speckPx),
        narrowBridge: splitsWhenEroded(res.mask, eroded, info.W, info.H),
      };
    }

    const reply: TraceOk = { id, cutD, bleedD, islands: res.islands, nodes, bbox: bbox(res.polys, cv), check: checks };
    self.postMessage(reply);
  } catch (err) {
    const reply: TraceReply = { id, error: err instanceof Error ? err.message : String(err) };
    self.postMessage(reply);
  }
};
