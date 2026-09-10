import { useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import type { Artwork } from '../lib/artwork';
import type { ViewBox } from '../lib/cutline';
import type { Rect, Viewport } from '../hooks/useViewport';
import { useT } from '../i18n';
import type { Bg, Settings } from '../types';

/** World pixels per millimetre: zoom 1 is actual size on a 96 dpi screen. */
export const PX_PER_MM = 96 / 25.4;

interface CanvasProps {
  bg: Bg;
  viewport: Viewport;
  art: Artwork | null;
  cutD: string | null;
  bleedD: string | null;
  logoUrl: string | null;
  vb: ViewBox | null;
  margin: number;
  unitsPerMm: number;
  strokeWidth: number;
  settings: Settings;
  error: string | null;
  onFile: (file: File | undefined) => void;
  updateAvailable: boolean;
  onUpdate: () => void;
}

export default function Canvas(p: CanvasProps) {
  const { viewport, art } = p;
  const { t, msg } = useT();
  // dragenter/dragleave fire for every child; count them so the overlay does not flicker.
  const [dragDepth, setDragDepth] = useState(0);
  const dropping = dragDepth > 0;

  const sticker = p.cutD && p.vb && p.logoUrl ? { cutD: p.cutD, bleedD: p.bleedD, vb: p.vb, logoUrl: p.logoUrl } : null;

  // The frame in world px, anchored so the artwork's own origin never moves when
  // the margin grows or shrinks: only the frame around it changes.
  const upm = p.unitsPerMm || 1;
  const frame: Rect | null =
    sticker && p.vb
      ? {
          x: ((p.vb[0] - p.margin) / upm) * PX_PER_MM,
          y: ((p.vb[1] - p.margin) / upm) * PX_PER_MM,
          w: ((p.vb[2] + 2 * p.margin) / upm) * PX_PER_MM,
          h: ((p.vb[3] + 2 * p.margin) / upm) * PX_PER_MM,
        }
      : null;

  viewport.setContent(frame);

  // Fit once per artwork, the first time it has a contour. Afterwards the view is the user's.
  const fittedFor = useRef<Artwork | null>(null);
  useEffect(() => {
    if (frame && art && fittedFor.current !== art) {
      fittedFor.current = art;
      viewport.fit();
    }
  }, [frame, art, viewport]);

  const onDragEnter = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setDragDepth(n => n + 1);
  };
  const onDragLeave = () => setDragDepth(n => Math.max(0, n - 1));
  const onDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setDragDepth(0);
    p.onFile(e.dataTransfer.files?.[0]);
  };

  const fill = p.settings.stickerFill;

  return (
    <main
      ref={viewport.stageRef}
      className="stage"
      data-bg={p.bg}
      data-dropping={dropping || undefined}
      data-dragging={viewport.dragging || undefined}
      onDragEnter={onDragEnter}
      onDragOver={e => e.preventDefault()}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      {...viewport.pointerHandlers}
    >
      <div ref={viewport.worldRef} className="world">
        {sticker && frame ? (
          <div className="sticker" style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h }}>
            <svg
              viewBox={`${sticker.vb[0] - p.margin} ${sticker.vb[1] - p.margin} ${sticker.vb[2] + 2 * p.margin} ${sticker.vb[3] + 2 * p.margin}`}
              role="img"
              aria-label={t('preview')}
            >
              {fill !== 'none' ? <path d={sticker.bleedD ?? sticker.cutD} fill={fill} fillRule="evenodd" /> : null}
              <image href={sticker.logoUrl} x={sticker.vb[0]} y={sticker.vb[1]} width={sticker.vb[2]} height={sticker.vb[3]} />
              {p.settings.showCutLine ? (
                <path d={sticker.cutD} fill="none" stroke={p.settings.cutColor} strokeWidth={p.strokeWidth} strokeLinejoin="round" />
              ) : null}
            </svg>
          </div>
        ) : null}
      </div>

      {!sticker ? <p className="stage-note">{p.error ? msg(p.error) : t('emptyCanvas')}</p> : null}

      {p.updateAvailable ? (
        <button type="button" className="update-pill" onClick={p.onUpdate}>
          {t('updateAvailable')} · <b>{t('reload')}</b>
        </button>
      ) : null}

      {dropping ? <div className="drop-hint">{t('dropToLoad')}</div> : null}
    </main>
  );
}
