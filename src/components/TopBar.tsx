import { CUT_COLOR_SWATCHES } from '../types';
import type { Bg, Settings } from '../types';

interface TopBarProps {
  settings: Settings;
  onSettings: (patch: Partial<Settings>) => void;
  bg: Bg;
  onBg: (bg: Bg) => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onActualSize: () => void;
}

const BACKGROUNDS: { key: Bg; label: string }[] = [
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
  { key: 'grid', label: 'Grid' },
];

/** Output look (cut line, colours, width, fill) on the left; view controls on the right. */
export default function TopBar({ settings, onSettings, bg, onBg, zoom, onZoomIn, onZoomOut, onFit, onActualSize }: TopBarProps) {
  const fillIsNone = settings.stickerFill === 'none';

  return (
    <div className="topbar">
      <label className="check topbar-item">
        <input type="checkbox" checked={settings.showCutLine} onChange={e => onSettings({ showCutLine: e.target.checked })} />
        <span>Cut line</span>
      </label>

      <div className="chips topbar-item" role="group" aria-label="Cut colour">
        {CUT_COLOR_SWATCHES.map(color => (
          <button
            key={color}
            type="button"
            className="chip"
            style={{ background: color }}
            aria-label={`Cut colour ${color}`}
            aria-pressed={settings.cutColor.toLowerCase() === color}
            onClick={() => onSettings({ cutColor: color })}
          />
        ))}
        <input type="color" className="chip chip-input" value={settings.cutColor} aria-label="Custom cut colour" onChange={e => onSettings({ cutColor: e.target.value })} />
      </div>

      <label className="topbar-item topbar-slider">
        <span>Width</span>
        <input
          type="range"
          min={0.05}
          max={1}
          step={0.05}
          value={settings.lineWidthMm}
          aria-label="Line width"
          onChange={e => onSettings({ lineWidthMm: +e.target.value })}
        />
        <span className="readout">{settings.lineWidthMm.toFixed(2)} mm</span>
      </label>

      <div className="topbar-item topbar-fill">
        <span>Fill</span>
        <div className="chips" role="group" aria-label="Sticker fill">
          <button
            type="button"
            className="chip"
            style={{ background: '#ffffff' }}
            aria-label="White fill"
            aria-pressed={settings.stickerFill === '#ffffff'}
            onClick={() => onSettings({ stickerFill: '#ffffff' })}
          />
          <button type="button" className="chip chip-none" aria-label="No fill (clear sticker)" aria-pressed={fillIsNone} onClick={() => onSettings({ stickerFill: 'none' })} />
          <input
            type="color"
            className="chip chip-input"
            value={fillIsNone ? '#ffffff' : settings.stickerFill}
            aria-label="Custom fill colour"
            onChange={e => onSettings({ stickerFill: e.target.value })}
          />
        </div>
      </div>

      <div className="topbar-spacer" />

      <div className="segmented" role="group" aria-label="Canvas background">
        {BACKGROUNDS.map(({ key, label }) => (
          <button key={key} type="button" aria-pressed={bg === key} onClick={() => onBg(key)}>
            {label}
          </button>
        ))}
      </div>

      <div className="segmented" role="group" aria-label="Zoom">
        <button type="button" onClick={onZoomOut} aria-label="Zoom out" title="Zoom out (−)">
          −
        </button>
        <button type="button" className="zoom-readout" onClick={onActualSize} title="Actual size (Shift+0)">
          {Math.round(zoom * 100)}%
        </button>
        <button type="button" onClick={onZoomIn} aria-label="Zoom in" title="Zoom in (+)">
          +
        </button>
        <button type="button" onClick={onFit} title="Fit (Shift+1)">
          Fit
        </button>
      </div>
    </div>
  );
}
