import { useState } from 'react';
import type { CSSProperties, DragEvent } from 'react';
import type { ViewBox } from '../lib/cutline';
import type { Bg, Settings } from '../types';

interface PreviewProps {
  bg: Bg;
  onBg: (bg: Bg) => void;
  cutD: string | null;
  bleedD: string | null;
  logoUrl: string | null;
  vb: ViewBox | null;
  margin: number;
  strokeWidth: number;
  settings: Settings;
  error: string | null;
  onFile: (file: File | undefined) => void;
  /** A newer build is deployed; offer a reload. */
  updateAvailable: boolean;
  onUpdate: () => void;
}

const BACKGROUNDS: { key: Bg; label: string }[] = [
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
  { key: 'grid', label: 'Grid' },
];

export default function Preview({ bg, onBg, cutD, bleedD, logoUrl, vb, margin, strokeWidth, settings, error, onFile, updateAvailable, onUpdate }: PreviewProps) {
  // dragenter/dragleave fire for every child; count them so the overlay does not flicker.
  const [dragDepth, setDragDepth] = useState(0);
  const dragging = dragDepth > 0;

  const onDragEnter = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setDragDepth(n => n + 1);
  };
  const onDragLeave = () => setDragDepth(n => Math.max(0, n - 1));
  const onDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setDragDepth(0);
    onFile(e.dataTransfer.files?.[0]);
  };

  const sticker = cutD && vb && logoUrl ? { cutD, bleedD, vb, logoUrl } : null;
  const frame = sticker
    ? { x: sticker.vb[0] - margin, y: sticker.vb[1] - margin, w: sticker.vb[2] + 2 * margin, h: sticker.vb[3] + 2 * margin }
    : null;
  const fill = settings.stickerFill;

  return (
    <main
      className="stage"
      data-bg={bg}
      data-dragging={dragging || undefined}
      onDragEnter={onDragEnter}
      onDragOver={e => e.preventDefault()}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="segmented" role="group" aria-label="Preview background">
        {BACKGROUNDS.map(({ key, label }) => (
          <button key={key} type="button" aria-pressed={bg === key} onClick={() => onBg(key)}>
            {label}
          </button>
        ))}
      </div>

      {sticker && frame ? (
        <div className="sticker" style={{ '--ar': frame.w / frame.h } as CSSProperties}>
          <svg viewBox={`${frame.x} ${frame.y} ${frame.w} ${frame.h}`} role="img" aria-label="Sticker preview">
            {fill !== 'none' ? <path d={sticker.bleedD ?? sticker.cutD} fill={fill} fillRule="evenodd" /> : null}
            <image href={sticker.logoUrl} x={sticker.vb[0]} y={sticker.vb[1]} width={sticker.vb[2]} height={sticker.vb[3]} />
            {settings.showCutLine ? (
              <path d={sticker.cutD} fill="none" stroke={settings.cutColor} strokeWidth={strokeWidth} strokeLinejoin="round" />
            ) : null}
          </svg>
        </div>
      ) : (
        <p className="stage-note">{error || 'Paste an SVG or PNG, or drop a file here.'}</p>
      )}

      {updateAvailable ? (
        <button type="button" className="update-pill" onClick={onUpdate}>
          New version available · <b>Reload</b>
        </button>
      ) : null}

      {dragging ? <div className="drop-hint">Drop to load</div> : null}
    </main>
  );
}
