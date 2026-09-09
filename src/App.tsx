import { useCallback, useEffect, useState } from 'react';
import Preview from './components/Preview';
import Sidebar from './components/Sidebar';
import { useCutline } from './hooks/useCutline';
import { sourceFromFile } from './lib/artwork';
import type { Source } from './lib/artwork';
import { load, save } from './lib/storage';
import { targetById } from './lib/targets';
import { BUILD_ID, useUpdateAvailable } from './lib/updates';
import type { TargetId } from './lib/targets';
import type { Bg, Params, Settings } from './types';

const SAMPLE_URL = `${import.meta.env.BASE_URL}samples/logo-green.svg`;

export default function App() {
  const [initial] = useState(load);
  const [source, setSource] = useState<Source | null>(initial.source);
  const [widthMm, setWidthMm] = useState<number | null>(initial.widthMm);
  const [params, setParams] = useState<Params>(initial.params);
  const [settings, setSettings] = useState<Settings>(initial.settings);
  const [bg, setBg] = useState<Bg>('light');

  const result = useCutline(source, widthMm, params, settings);
  const updateAvailable = useUpdateAvailable();

  // A new artwork forgets the width override; the file (or the default) speaks again.
  const replaceSource = useCallback((next: Source | null) => {
    setSource(next);
    setWidthMm(null);
  }, []);

  const onSvgText = useCallback((text: string) => setSource({ kind: 'svg', text }), []);

  const readFile = useCallback(
    (file: File | undefined) => {
      if (file) void sourceFromFile(file).then(src => src && replaceSource(src));
    },
    [replaceSource],
  );

  const applyTarget = useCallback((id: TargetId) => {
    const t = targetById(id);
    setSettings(prev => ({ ...prev, target: id, cutColor: t.cutColor, lineWidthMm: t.lineWidthMm, showCutLine: t.showCutLine }));
    if (t.bleedMm !== null) setParams(prev => ({ ...prev, bleedMm: t.bleedMm! }));
  }, []);

  // Paste anywhere: SVG text, or an image from the clipboard. The source textarea
  // handles its own text paste natively.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      const text = e.clipboardData?.getData('text') || '';
      if (/<svg[\s>]/i.test(text) && target?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        replaceSource({ kind: 'svg', text });
        return;
      }
      const file = [...(e.clipboardData?.files ?? [])].find(f => /^image\//.test(f.type));
      if (file) {
        e.preventDefault();
        readFile(file);
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [replaceSource, readFile]);

  // First visit only: start from the bundled sample so there is something to look at.
  useEffect(() => {
    if (source) return;
    let cancelled = false;
    fetch(SAMPLE_URL)
      .then(r => (r.ok ? r.text() : null))
      .then(text => {
        if (text && !cancelled) setSource({ kind: 'svg', text });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // Mount only. Clearing the source later must not reload the sample.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => save({ source, widthMm, params, settings }), [source, widthMm, params, settings]);

  return (
    <div className="app" data-build={BUILD_ID}>
      <Sidebar
        source={source}
        onSvgText={onSvgText}
        onClear={() => replaceSource(null)}
        onFile={readFile}
        art={result.art}
        widthMm={result.widthMm}
        heightMm={result.heightMm}
        widthSource={result.widthSource}
        onWidthMm={setWidthMm}
        params={params}
        onParams={patch => setParams(prev => ({ ...prev, ...patch }))}
        settings={settings}
        onSettings={patch => setSettings(prev => ({ ...prev, ...patch }))}
        onTarget={applyTarget}
        stats={result.stats}
        notes={result.notes}
        refining={result.refining}
        stickerUrl={result.stickerUrl}
        cutUrl={result.cutUrl}
        onExportPng={() => void result.exportPng()}
        exportingPng={result.exportingPng}
      />
      <Preview
        bg={bg}
        onBg={setBg}
        cutD={result.cutD}
        bleedD={result.bleedD}
        logoUrl={result.logoUrl}
        vb={result.vb}
        margin={result.margin}
        strokeWidth={result.strokeWidth}
        settings={settings}
        error={result.error}
        onFile={readFile}
        updateAvailable={updateAvailable}
      />
    </div>
  );
}
