import Slider from './Slider';
import type { Artwork, Source } from '../lib/artwork';
import { TARGETS, targetById } from '../lib/targets';
import type { TargetId } from '../lib/targets';
import { BRIDGE_MM, CUT_COLOR_SWATCHES, SPECK_MM } from '../types';
import type { CutNotes, Params, Settings, Stats } from '../types';

interface SidebarProps {
  source: Source | null;
  onSvgText: (text: string) => void;
  onClear: () => void;
  onFile: (file: File | undefined) => void;
  art: Artwork | null;
  widthMm: number;
  heightMm: number;
  widthSource: 'user' | 'file' | 'assumed';
  onWidthMm: (mm: number | null) => void;
  params: Params;
  onParams: (patch: Partial<Params>) => void;
  settings: Settings;
  onSettings: (patch: Partial<Settings>) => void;
  onTarget: (id: TargetId) => void;
  stats: Stats | null;
  notes: CutNotes | null;
  /** True while the shown contour is the quick pass and the full-resolution one is still coming. */
  refining: boolean;
  stickerUrl: string | null;
  cutUrl: string | null;
  onExportPng: () => void;
  exportingPng: boolean;
}

const mm1 = (v: number) => `${v.toFixed(1)} mm`;
const mm2 = (v: number) => `${v.toFixed(2)} mm`;

function statsLabel(stats: Stats) {
  const islands = `${stats.islands} ${stats.islands === 1 ? 'piece' : 'pieces'}`;
  return `${mm1(stats.widthMm).replace(' mm', '')} × ${mm1(stats.heightMm)} · ${islands} · ${stats.nodes} nodes`;
}

function noteLines(notes: CutNotes): string[] {
  const out: string[] = [];
  if (isFinite(notes.minRadiusMm)) out.push(`Tightest corner ${mm2(notes.minRadiusMm)}`);
  if (notes.specks > 0) out.push(`${notes.specks} ${notes.specks === 1 ? 'piece' : 'pieces'} under ${SPECK_MM} mm, hard to weed`);
  if (notes.narrowBridge) out.push(`A bridge narrower than ${BRIDGE_MM} mm joins two pieces`);
  return out;
}

export default function Sidebar(p: SidebarProps) {
  const { source, art, params, settings, stats, notes } = p;
  const target = targetById(settings.target);
  const fillIsNone = settings.stickerFill === 'none';

  return (
    <aside className="sidebar">
      <header className="intro">
        <h1 className="title">Sticker cut line</h1>
        <p className="lede">Paste an SVG or PNG anywhere on this page, drop a file, or edit the code below.</p>
      </header>

      <section className="group" aria-labelledby="g-artwork">
        <h2 className="eyebrow" id="g-artwork">
          Artwork
        </h2>
        {source?.kind === 'raster' ? (
          <div className="code raster-card">
            <span className="raster-name">{source.name}</span>
            {art ? (
              <span className="raster-meta">
                {art.vb[2]} × {art.vb[3]} px
              </span>
            ) : null}
          </div>
        ) : (
          <textarea
            className="code"
            value={source?.kind === 'svg' ? source.text : ''}
            onChange={e => p.onSvgText(e.target.value)}
            spellCheck={false}
            placeholder="<svg …>"
            aria-label="SVG source"
          />
        )}
        <div className="row">
          <input
            id="artfile"
            className="visually-hidden"
            type="file"
            accept=".svg,image/svg+xml,image/png,image/webp,image/jpeg"
            onChange={e => {
              p.onFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <label className="tile tile-grow" htmlFor="artfile">
            Open file…
          </label>
          <button type="button" className="tile tile-quiet" onClick={p.onClear}>
            Clear
          </button>
        </div>
        <div className="field">
          <div className="size-row">
            <label htmlFor="width-mm">Artwork width</label>
            <span className="num-wrap">
              <input
                id="width-mm"
                className="num"
                type="number"
                inputMode="decimal"
                min={1}
                step={0.1}
                value={+p.widthMm.toFixed(2)}
                disabled={!art}
                onChange={e => {
                  const v = parseFloat(e.target.value);
                  p.onWidthMm(isFinite(v) && v > 0 ? v : null);
                }}
              />
              <span className="unit">mm</span>
            </span>
            <span className="readout">{art ? `${mm1(p.heightMm)} tall` : ''}</span>
          </div>
          {art ? (
            <p className="help">
              {p.widthSource === 'file' ? 'Size read from the file.' : p.widthSource === 'user' ? 'Set by you.' : 'No size in the file; 50 mm assumed. Set the real width.'}
            </p>
          ) : null}
        </div>
        {art?.warnings.length ? (
          <ul className="warnings">
            {art.warnings.map(w => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="group" aria-labelledby="g-contour">
        <h2 className="eyebrow" id="g-contour">
          Contour
        </h2>
        <Slider label="Offset" display={mm1(params.offsetMm)} value={params.offsetMm} min={0} max={10} step={0.1} onChange={offsetMm => p.onParams({ offsetMm })} />
        <Slider
          label="Bleed"
          display={mm1(params.bleedMm)}
          value={params.bleedMm}
          min={0}
          max={5}
          step={0.1}
          help={fillIsNone ? 'No fill, so there is nothing to bleed.' : undefined}
          onChange={bleedMm => p.onParams({ bleedMm })}
        />
        <Slider
          label="Join gaps"
          display={mm1(params.joinMm)}
          value={params.joinMm}
          min={0}
          max={15}
          step={0.1}
          help="Bridges separate shapes into one outline."
          onChange={joinMm => p.onParams({ joinMm })}
        />
        <Slider label="Smoothing" display={mm2(params.smoothMm)} value={params.smoothMm} min={0} max={2} step={0.05} onChange={smoothMm => p.onParams({ smoothMm })} />
        <label className="check">
          <input type="checkbox" checked={params.fillHoles} onChange={e => p.onParams({ fillHoles: e.target.checked })} />
          <span>Fill enclosed holes (e, o, a…)</span>
        </label>
      </section>

      <section className="group" aria-labelledby="g-output">
        <h2 className="eyebrow" id="g-output">
          Output
        </h2>
        <div className="field">
          <label className="field-head" htmlFor="target">
            <span>Target</span>
          </label>
          <span className="select-wrap">
            <select id="target" className="select" value={settings.target} onChange={e => p.onTarget(e.target.value as TargetId)}>
              {TARGETS.map(t => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </span>
          <p className="help">{target.note}</p>
        </div>
        <div className="color-row">
          <span>Cut colour</span>
          <div className="chips">
            {CUT_COLOR_SWATCHES.map(color => (
              <button
                key={color}
                type="button"
                className="chip"
                style={{ background: color }}
                aria-label={`Cut colour ${color}`}
                aria-pressed={settings.cutColor.toLowerCase() === color}
                onClick={() => p.onSettings({ cutColor: color })}
              />
            ))}
            <input type="color" className="chip chip-input" value={settings.cutColor} aria-label="Custom cut colour" onChange={e => p.onSettings({ cutColor: e.target.value })} />
          </div>
          <span className="readout">{settings.cutColor}</span>
        </div>
        <div className="color-row">
          <span>Sticker fill</span>
          <div className="chips">
            <button
              type="button"
              className="chip"
              style={{ background: '#ffffff' }}
              aria-label="White fill"
              aria-pressed={settings.stickerFill === '#ffffff'}
              onClick={() => p.onSettings({ stickerFill: '#ffffff' })}
            />
            <button type="button" className="chip chip-none" aria-label="No fill (clear sticker)" aria-pressed={fillIsNone} onClick={() => p.onSettings({ stickerFill: 'none' })} />
            <input
              type="color"
              className="chip chip-input"
              value={fillIsNone ? '#ffffff' : settings.stickerFill}
              aria-label="Custom fill colour"
              onChange={e => p.onSettings({ stickerFill: e.target.value })}
            />
          </div>
          <span className="readout">{fillIsNone ? 'clear' : settings.stickerFill}</span>
        </div>
        <Slider label="Line width" display={mm2(settings.lineWidthMm)} value={settings.lineWidthMm} min={0.05} max={1} step={0.05} onChange={lineWidthMm => p.onSettings({ lineWidthMm })} />
        <Slider
          label="Simplify"
          display={mm2(settings.simplifyMm)}
          value={settings.simplifyMm}
          min={0}
          max={0.5}
          step={0.01}
          help="Fewer nodes; stays within this distance of the trace."
          onChange={simplifyMm => p.onSettings({ simplifyMm })}
        />
        <label className="check">
          <input type="checkbox" checked={settings.showCutLine} onChange={e => p.onSettings({ showCutLine: e.target.checked })} />
          <span>Include the cut line in the sticker file</span>
        </label>
      </section>

      <footer className="footer">
        <p className="stats" data-refining={p.refining || undefined} aria-live="polite">
          {stats ? statsLabel(stats) : ''}
        </p>
        {notes ? (
          <ul className="notes">
            {noteLines(notes).map(line => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
        <a className="tile tile-primary" href={p.stickerUrl ?? undefined} download="sticker.svg" aria-disabled={!p.stickerUrl}>
          Download sticker SVG
        </a>
        {target.printPng ? (
          <button type="button" className="tile" disabled={!p.stickerUrl || p.exportingPng} onClick={p.onExportPng}>
            {p.exportingPng ? 'Rendering…' : 'Download print PNG (300 dpi)'}
          </button>
        ) : null}
        <a className="tile" href={p.cutUrl ?? undefined} download="cutline.svg" aria-disabled={!p.cutUrl}>
          Download cut line SVG
        </a>
      </footer>
    </aside>
  );
}
