import { useState } from 'react';
import Slider from './Slider';
import { LANGS, useT } from '../i18n';
import type { I18n } from '../i18n';
import type { Artwork, Source } from '../lib/artwork';
import { TARGETS, targetById } from '../lib/targets';
import type { TargetId } from '../lib/targets';
import { BRIDGE_MM, SPECK_MM } from '../types';
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
  /** Present when the browser can install the app; null otherwise. */
  onInstall: (() => void) | null;
}

type Tab = 'artwork' | 'contour' | 'output';
const TABS: { id: Tab; label: 'tabArtwork' | 'tabContour' | 'tabOutput' }[] = [
  { id: 'artwork', label: 'tabArtwork' },
  { id: 'contour', label: 'tabContour' },
  { id: 'output', label: 'tabOutput' },
];

function statsLabel(i: I18n, stats: Stats) {
  return i.t('stats', { w: i.num(stats.widthMm), h: i.num(stats.heightMm), pieces: i.plural('pieces', stats.islands), nodes: i.plural('nodes', stats.nodes) });
}

function noteLines(i: I18n, notes: CutNotes): string[] {
  const out: string[] = [];
  if (isFinite(notes.minRadiusMm)) out.push(i.t('tightestCorner', { r: i.mm(notes.minRadiusMm, 2) }));
  if (notes.specks > 0) out.push(i.t('specks', { pieces: i.plural('pieces', notes.specks), mm: SPECK_MM }));
  if (notes.narrowBridge) out.push(i.t('narrowBridge', { mm: BRIDGE_MM }));
  return out;
}

export default function Sidebar(p: SidebarProps) {
  const { source, art, params, settings, stats, notes } = p;
  const i = useT();
  const { t, mm, lang, setLang } = i;
  const [tab, setTab] = useState<Tab>('artwork');
  const target = targetById(settings.target);
  const fillIsNone = settings.stickerFill === 'none';

  return (
    <aside className="sidebar">
      <header className="intro">
        <div className="title-row">
          <h1 className="title">{t('appTitle')}</h1>
          <div className="segmented segmented-small" role="group" aria-label={t('language')}>
            {LANGS.map(l => (
              <button key={l.id} type="button" lang={l.id} title={l.name} aria-pressed={lang === l.id} onClick={() => setLang(l.id)}>
                {l.label}
              </button>
            ))}
          </div>
        </div>
        <div className="tabs" role="tablist" aria-label={t('tabsAria')}>
          {TABS.map(tabDef => (
            <button key={tabDef.id} type="button" role="tab" id={`tab-${tabDef.id}`} aria-selected={tab === tabDef.id} aria-controls="tab-panel" onClick={() => setTab(tabDef.id)}>
              {t(tabDef.label)}
            </button>
          ))}
        </div>
      </header>

      <div className="tab-panel" role="tabpanel" id="tab-panel" aria-labelledby={`tab-${tab}`}>
        {tab === 'artwork' ? (
          <>
            <p className="lede">{t('lede')}</p>
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
                aria-label={t('svgSource')}
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
                {t('openFile')}
              </label>
              <button type="button" className="tile tile-quiet" onClick={p.onClear}>
                {t('clear')}
              </button>
            </div>
            <div className="field">
              <div className="size-row">
                <label htmlFor="width-mm">{t('artworkWidth')}</label>
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
                <span className="readout">{art ? t('tall', { h: mm(p.heightMm) }) : ''}</span>
              </div>
              {art ? (
                <p className="help">
                  {p.widthSource === 'file' ? t('widthFromFile') : p.widthSource === 'user' ? t('widthByUser') : t('widthAssumed')}
                </p>
              ) : null}
            </div>
            {art?.warnings.length ? (
              <ul className="warnings">
                {art.warnings.map(w => (
                  <li key={w}>{i.msg(w)}</li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}

        {tab === 'contour' ? (
          <>
            <Slider label={t('offset')} display={mm(params.offsetMm)} value={params.offsetMm} min={0} max={10} step={0.1} help={t('offsetHelp')} onChange={offsetMm => p.onParams({ offsetMm })} />
            <Slider
              label={t('bleed')}
              display={mm(params.bleedMm)}
              value={params.bleedMm}
              min={0}
              max={5}
              step={0.1}
              help={fillIsNone ? t('bleedNone') : t('bleedHelp')}
              onChange={bleedMm => p.onParams({ bleedMm })}
            />
            <Slider
              label={t('joinGaps')}
              display={mm(params.joinMm)}
              value={params.joinMm}
              min={0}
              max={15}
              step={0.1}
              help={t('joinHelp')}
              onChange={joinMm => p.onParams({ joinMm })}
            />
            <Slider label={t('smoothing')} display={mm(params.smoothMm, 2)} value={params.smoothMm} min={0} max={2} step={0.05} onChange={smoothMm => p.onParams({ smoothMm })} />
            <label className="check">
              <input type="checkbox" checked={params.fillHoles} onChange={e => p.onParams({ fillHoles: e.target.checked })} />
              <span>{t('fillHoles')}</span>
            </label>
          </>
        ) : null}

        {tab === 'output' ? (
          <>
            <div className="field">
              <label className="field-head" htmlFor="target">
                <span>{t('target')}</span>
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
              <p className="help">{t(`target.${target.id}`)}</p>
            </div>
            <Slider
              label={t('simplify')}
              display={mm(settings.simplifyMm, 2)}
              value={settings.simplifyMm}
              min={0}
              max={0.5}
              step={0.01}
              help={t('simplifyHelp')}
              onChange={simplifyMm => p.onSettings({ simplifyMm })}
            />
            <p className="help">{t('outputHint')}</p>
          </>
        ) : null}
      </div>

      <footer className="footer">
        <p className="stats" data-refining={p.refining || undefined} aria-live="polite">
          {stats ? statsLabel(i, stats) : ''}
        </p>
        {notes ? (
          <ul className="notes">
            {noteLines(i, notes).map(line => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
        <a className="tile tile-primary" href={p.stickerUrl ?? undefined} download="sticker.svg" aria-disabled={!p.stickerUrl}>
          {t('downloadSticker')}
        </a>
        {target.printPng ? (
          <button type="button" className="tile" disabled={!p.stickerUrl || p.exportingPng} onClick={p.onExportPng}>
            {p.exportingPng ? t('rendering') : t('downloadPng')}
          </button>
        ) : null}
        <a className="tile" href={p.cutUrl ?? undefined} download="cutline.svg" aria-disabled={!p.cutUrl}>
          {t('downloadCut')}
        </a>
        {p.onInstall ? (
          <button type="button" className="tile tile-quiet" onClick={p.onInstall}>
            {t('install')}
          </button>
        ) : null}
      </footer>
    </aside>
  );
}
