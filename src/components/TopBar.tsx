import { useT } from '../i18n';
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

const BACKGROUNDS: { key: Bg; label: 'light' | 'dark' | 'grid' }[] = [
  { key: 'light', label: 'light' },
  { key: 'dark', label: 'dark' },
  { key: 'grid', label: 'grid' },
];

/** Output look (cut line, colours, width, fill) on the left; view controls on the right. */
export default function TopBar({ settings, onSettings, bg, onBg, zoom, onZoomIn, onZoomOut, onFit, onActualSize }: TopBarProps) {
  const { t, mm } = useT();
  const fillIsNone = settings.stickerFill === 'none';

  return (
    <div className="topbar">
      <label className="check topbar-item">
        <input type="checkbox" checked={settings.showCutLine} onChange={e => onSettings({ showCutLine: e.target.checked })} />
        <span>{t('cutLine')}</span>
      </label>

      <div className="chips topbar-item" role="group" aria-label={t('cutColour')}>
        {CUT_COLOR_SWATCHES.map(color => (
          <button
            key={color}
            type="button"
            className="chip"
            style={{ background: color }}
            aria-label={t('cutColourN', { c: color })}
            aria-pressed={settings.cutColor.toLowerCase() === color}
            onClick={() => onSettings({ cutColor: color })}
          />
        ))}
        <input type="color" className="chip chip-input" value={settings.cutColor} aria-label={t('customCutColour')} onChange={e => onSettings({ cutColor: e.target.value })} />
      </div>

      <label className="topbar-item topbar-slider">
        <span>{t('width')}</span>
        <input
          type="range"
          min={0.05}
          max={1}
          step={0.05}
          value={settings.lineWidthMm}
          aria-label={t('lineWidth')}
          onChange={e => onSettings({ lineWidthMm: +e.target.value })}
        />
        <span className="readout">{mm(settings.lineWidthMm, 2)}</span>
      </label>

      <div className="topbar-item topbar-fill">
        <span>{t('fill')}</span>
        <div className="chips" role="group" aria-label={t('stickerFill')}>
          <button
            type="button"
            className="chip"
            style={{ background: '#ffffff' }}
            aria-label={t('whiteFill')}
            aria-pressed={settings.stickerFill === '#ffffff'}
            onClick={() => onSettings({ stickerFill: '#ffffff' })}
          />
          <button type="button" className="chip chip-none" aria-label={t('noFill')} aria-pressed={fillIsNone} onClick={() => onSettings({ stickerFill: 'none' })} />
          <input
            type="color"
            className="chip chip-input"
            value={fillIsNone ? '#ffffff' : settings.stickerFill}
            aria-label={t('customFill')}
            onChange={e => onSettings({ stickerFill: e.target.value })}
          />
        </div>
      </div>

      <div className="topbar-spacer" />

      <div className="segmented" role="group" aria-label={t('bgAria')}>
        {BACKGROUNDS.map(({ key, label }) => (
          <button key={key} type="button" aria-pressed={bg === key} onClick={() => onBg(key)}>
            {t(label)}
          </button>
        ))}
      </div>

      <div className="segmented" role="group" aria-label={t('zoomAria')}>
        <button type="button" onClick={onZoomOut} aria-label={t('zoomOut')} title={t('zoomOut')}>
          −
        </button>
        <button type="button" className="zoom-readout" onClick={onActualSize} title={t('actualSize')}>
          {Math.round(zoom * 100)}%
        </button>
        <button type="button" onClick={onZoomIn} aria-label={t('zoomIn')} title={t('zoomIn')}>
          +
        </button>
        <button type="button" onClick={onFit} title={t('fitTitle')}>
          {t('fit')}
        </button>
      </div>
    </div>
  );
}
