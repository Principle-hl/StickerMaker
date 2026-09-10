import { useCallback, useEffect, useRef, useState } from 'react';
import { artworkSvg, loadArtwork } from '../lib/artwork';
import type { Artwork, Source } from '../lib/artwork';
import { rasterGeometry, rasterize } from '../lib/cutline';
import type { RasterInfo, ViewBox } from '../lib/cutline';
import { cutlineSvg, downloadBlob, printPng, stickerSvg } from '../lib/export';
import type { StickerDoc } from '../lib/export';
import { targetById } from '../lib/targets';
import { SUPERSEDED, Tracer } from '../lib/tracer';
import type { TraceOutput } from '../lib/tracer';
import { BRIDGE_MM, DEFAULT_WIDTH_MM, SPECK_MM } from '../types';
import type { CutNotes, Params, Settings, Stats } from '../types';

/** Mask resolution for the tier that answers every slider tick. ~60 ms on a laptop. */
const PREVIEW_TARGET = 600;
/** Mask resolution for the export-quality pass, run once the sliders rest. */
const FINAL_TARGET = 1400;
/** How long the sliders must rest before the full-resolution pass starts. */
const FINAL_DELAY_MS = 180;
/** Keystroke coalescing for the source textarea. */
const TYPING_DELAY_MS = 100;

export type Quality = 'preview' | 'final';

interface Loaded {
  art: Artwork;
  /** Blob URL of the artwork alone, for the preview's artwork layer. */
  logoUrl: string;
}

interface Traced {
  cutD: string;
  bleedD: string | null;
  stats: Stats;
  notes: CutNotes | null;
  quality: Quality;
  logoUrl: string;
  art: Artwork;
  vb: ViewBox;
  /** Frame margin in SVG units. Always the full-resolution value so the frame never jumps between tiers. */
  margin: number;
  unitsPerMm: number;
}

export interface CutlineResult {
  art: Artwork | null;
  /** Artwork width actually in use, mm (user override, file, or the default). */
  widthMm: number;
  heightMm: number;
  widthSource: 'user' | 'file' | 'assumed';
  cutD: string | null;
  bleedD: string | null;
  logoUrl: string | null;
  vb: ViewBox | null;
  margin: number;
  /** SVG units per mm for the contour on screen (0 until one exists). */
  unitsPerMm: number;
  stats: Stats | null;
  notes: CutNotes | null;
  quality: Quality | null;
  /** True while the full-resolution pass is pending or running. */
  refining: boolean;
  error: string | null;
  /** Cut line stroke width in SVG units. */
  strokeWidth: number;
  stickerUrl: string | null;
  cutUrl: string | null;
  /** Renders and downloads the print layer as a 300 dpi PNG. */
  exportPng: () => Promise<void>;
  exportingPng: boolean;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function useCutline(source: Source | null, widthMmOverride: number | null, params: Params, settings: Settings): CutlineResult {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [traced, setTraced] = useState<Traced | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refining, setRefining] = useState(false);
  const [urls, setUrls] = useState<{ sticker: string; cut: string } | null>(null);
  const [exportingPng, setExportingPng] = useState(false);

  // Workers are created on first use (inside an effect, so StrictMode's mount/unmount/mount
  // rehearsal disposes and recreates them cleanly) and torn down on unmount.
  const tracersRef = useRef<{ preview: Tracer; final: Tracer } | null>(null);
  const getTracers = () => (tracersRef.current ??= { preview: new Tracer(), final: new Tracer() });
  useEffect(
    () => () => {
      tracersRef.current?.preview.dispose();
      tracersRef.current?.final.dispose();
      tracersRef.current = null;
    },
    [],
  );
  // Each params/artwork change bumps the generation; results from older generations are dropped.
  const genRef = useRef(0);

  // 1. Source → parsed artwork + rendered image. One image load per source.
  useEffect(() => {
    if (!source || (source.kind === 'svg' && !source.text.trim())) {
      setLoaded(null);
      setTraced(null);
      setError(null);
      setRefining(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const art = await loadArtwork(source);
        if (cancelled) return;
        const logoUrl = URL.createObjectURL(new Blob([artworkSvg(art)], { type: 'image/svg+xml' }));
        setLoaded(prev => {
          if (prev) URL.revokeObjectURL(prev.logoUrl);
          return { art, logoUrl };
        });
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setLoaded(null);
        setTraced(null);
        setRefining(false);
        setError(message(err));
      }
    }, source.kind === 'svg' ? TYPING_DELAY_MS : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [source]);

  useEffect(() => () => {
    if (loaded) URL.revokeObjectURL(loaded.logoUrl);
  }, [loaded]);

  // Physical scale. Everything the user touches is in mm; the algorithm wants percent of the longer side.
  const art = loaded?.art ?? null;
  const widthSource: CutlineResult['widthSource'] = widthMmOverride ? 'user' : art?.declaredWidthMm ? 'file' : 'assumed';
  const widthMm = widthMmOverride ?? art?.declaredWidthMm ?? DEFAULT_WIDTH_MM;
  const heightMm = art ? (widthMm * art.vb[3]) / art.vb[2] : 0;

  // 2. Artwork, scale or contour params → preview trace now, full-resolution trace once things settle.
  const { offsetMm, bleedMm, joinMm, smoothMm, fillHoles } = params;
  const { simplifyMm } = settings;
  useEffect(() => {
    if (!loaded) return;
    const { art, logoUrl } = loaded;
    const { preview, final } = getTracers();
    const [, , vw, vh] = art.vb;
    const unitsPerMm = vw / widthMm;
    const base = Math.max(vw, vh);
    const pctOf = (mm: number) => ((mm * unitsPerMm) / base) * 100;
    const pct = { offset: pctOf(offsetMm), bleed: pctOf(bleedMm), join: pctOf(joinMm), smooth: pctOf(smoothMm) };
    const gen = ++genRef.current;
    const margin = rasterGeometry(art.vb, pct, FINAL_TARGET).marginUnits;
    let finalDone = false;

    const apply = (info: RasterInfo, out: TraceOutput, quality: Quality) => {
      if (gen !== genRef.current) return;
      const pxToMm = 1 / (unitsPerMm * info.s);
      setTraced({
        cutD: out.cutD,
        bleedD: out.bleedD,
        stats: { islands: out.islands, nodes: out.nodes, widthMm: out.bbox[2] / unitsPerMm, heightMm: out.bbox[3] / unitsPerMm },
        notes: out.check
          ? { minRadiusMm: out.check.minRadiusPx * pxToMm, specks: out.check.specks, narrowBridge: out.check.narrowBridge }
          : null,
        quality,
        logoUrl,
        art,
        vb: art.vb,
        margin,
        unitsPerMm,
      });
      setError(null);
    };
    const fail = (err: unknown) => {
      if (err === SUPERSEDED || gen !== genRef.current) return;
      setError(message(err));
      setRefining(false);
    };
    const jobFor = (info: RasterInfo, withChecks: boolean) => {
      const mmToPx = unitsPerMm * info.s;
      return {
        fill: fillHoles,
        simplifyPx: simplifyMm * mmToPx,
        check: withChecks ? { speckPx: SPECK_MM * mmToPx, bridgePx: BRIDGE_MM * mmToPx } : null,
      };
    };

    try {
      const info = rasterize(art, pct, PREVIEW_TARGET);
      preview
        .run(info, jobFor(info, false))
        .then(out => {
          if (!finalDone) apply(info, out, 'preview');
        })
        .catch(fail);
    } catch (err) {
      setTraced(null);
      setRefining(false);
      setError(message(err));
      return;
    }

    setRefining(true);
    const timer = setTimeout(() => {
      try {
        const info = rasterize(art, pct, FINAL_TARGET);
        final
          .run(info, jobFor(info, true))
          .then(out => {
            finalDone = true;
            apply(info, out, 'final');
            if (gen === genRef.current) setRefining(false);
          })
          .catch(fail);
      } catch (err) {
        fail(err);
      }
    }, FINAL_DELAY_MS);

    return () => {
      clearTimeout(timer);
      final.cancel();
    };
  }, [loaded, widthMm, offsetMm, bleedMm, joinMm, smoothMm, fillHoles, simplifyMm]);

  // 3. Contour + output settings → downloadable SVGs. String work only, no re-trace.
  const { target, showCutLine, cutColor, lineWidthMm, stickerFill } = settings;
  const strokeWidth = traced ? lineWidthMm * traced.unitsPerMm : 0;
  const doc: StickerDoc | null = traced
    ? { art: traced.art, vb: traced.vb, margin: traced.margin, unitsPerMm: traced.unitsPerMm, cutD: traced.cutD, bleedD: traced.bleedD }
    : null;
  useEffect(() => {
    if (!doc) {
      setUrls(null);
      return;
    }
    const opts = { cutName: targetById(target).cutName, cutColor, showCutLine, strokeWidth, fill: stickerFill };
    const mk = (svg: string) => URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const sticker = mk(stickerSvg(doc, opts));
    // "Cut line only" always carries the contour, even when it is hidden in the sticker.
    const cut = mk(cutlineSvg(doc, { ...opts, showCutLine: true }));
    setUrls({ sticker, cut });
    return () => {
      URL.revokeObjectURL(sticker);
      URL.revokeObjectURL(cut);
    };
    // doc is rebuilt each render; its inputs are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traced, target, showCutLine, cutColor, strokeWidth, stickerFill]);

  const exportPng = useCallback(async () => {
    if (!doc || exportingPng) return;
    setExportingPng(true);
    try {
      downloadBlob(await printPng(doc, stickerFill), 'print.png');
    } catch (err) {
      setError(message(err));
    } finally {
      setExportingPng(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traced, stickerFill, exportingPng]);

  return {
    art,
    widthMm,
    heightMm,
    widthSource,
    cutD: traced?.cutD ?? null,
    bleedD: traced?.bleedD ?? null,
    logoUrl: traced?.logoUrl ?? null,
    vb: traced?.vb ?? null,
    margin: traced?.margin ?? 0,
    unitsPerMm: traced?.unitsPerMm ?? 0,
    stats: traced?.stats ?? null,
    notes: traced?.notes ?? null,
    quality: traced?.quality ?? null,
    refining,
    error,
    strokeWidth,
    stickerUrl: urls?.sticker ?? null,
    cutUrl: urls?.cut ?? null,
    exportPng,
    exportingPng,
  };
}
