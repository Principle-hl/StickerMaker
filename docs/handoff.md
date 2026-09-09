# Handoff: Sticker Cut Line Generator

> Archived design handoff the app was built from. The prototype files it refers to are in `prototype/`, the screenshots in `screenshots/` (`handoff-01.png` … `handoff-04.png`). The current behaviour is documented in the top-level README.

## Overview
A single-screen tool that turns any SVG logo into a print-ready sticker: it generates a smooth, rounded contour around all shapes (offset/bleed), bridges separate shapes into one "liquid" outline, fills enclosed holes (letters e, o, a…), and exports an SVG with a sticker fill, the original artwork, and a CutContour path. Everything runs client-side in the browser.

## About the Design Files
The files in this bundle are **design references created in HTML** — a working prototype showing intended look and behavior. The task is to **recreate this in the target codebase's environment** (React/Next, Vue, Svelte, etc.) using its established patterns. If no codebase exists yet, a Vite + React (or Next.js) app with TypeScript is a good fit — the app is static and needs no backend.

**Exception:** `cutline.js` is real, framework-agnostic algorithm code (no DOM framework dependency beyond `canvas`, `DOMParser`, `Image`). Port it as-is into the app as a module (optionally to TypeScript); do not rewrite the math.

## Fidelity
**High-fidelity.** Colors, typography, spacing and interactions are final. Recreate the UI pixel-perfectly.

## Screens / Views

### Single screen: Generator
**Purpose:** paste/drop an SVG, tune four parameters, preview the sticker, download.

**Layout:** full-viewport flex row, `flex-wrap: wrap`, `min-height: 100vh`, background `#171614`.
- **Sidebar `<aside>`** — `flex: 1 1 280px; max-width: 360px; padding: 24px 22px; border-right: 1px solid #2a2825`; column flex, `gap: 22px`. Wraps under the preview on narrow screens.
- **Preview `<main>`** — `flex: 3 1 420px; min-height: 480px; padding: 56px 40px 40px`; centered content; background switches Light/Dark/Grid (see tokens). Accepts drag-and-drop of `.svg` files.

**Sidebar components (top → bottom):**
1. Title "Sticker cut line" — 17px / 600 / letter-spacing -0.01em, `#ece9e2`.
   Subtitle — 13px, `#9a958c`, margin-top 4px: "Paste any SVG (⌘V anywhere on this page), drop a file, or edit the code below. The contour updates live."
2. SVG source `<textarea>` — 120px tall, resizable vertically, bg `#0f0e0d`, text `#c9c4ba`, border `1px solid #2a2825`, radius 6px, padding 10px, font JetBrains Mono 11px / 1.45, `white-space: pre`; focus outline `1px solid #ff4fd8`. Placeholder `<svg …>`.
   Row below (gap 8px): "Open SVG file…" (label for hidden file input, `flex:1`, 13px/500, padding 8px 10px, border `1px solid #3a372f`, radius 6px) and "Clear" button (13px, padding 8px 12px, same border, text `#9a958c`, transparent bg).
3. Controls block (column, gap 16px). Each slider: label row (13px, space-between) with name left and live value right in JetBrains Mono `#9a958c`; `<input type="range">` full width, margin-top 6px, `accent-color: #ff4fd8`.
   - **Offset (bleed)** — 0–12, step 0.1, default 3. Value shown as `18.0 u` (SVG units) once a logo is loaded, otherwise `3%`.
   - **Join gaps** — 0–15, step 0.1, default 4. Helper text below (12px, `#6f6a62`): "Bridges separate shapes into one liquid outline."
   - **Smoothing** — 0–3, step 0.05, default 0.5.
   - Checkbox row (gap 10px, 13px) "Fill enclosed holes (e, o, a…)" — 16×16, accent `#ff4fd8`, default checked.
   All slider values are **percent of the logo's longer side**; the displayed unit value = pct/100 × max(viewBox w, h).
4. Footer (pushed to bottom with `margin-top: auto`, column gap 10px):
   - Stats line — JetBrains Mono 12px `#9a958c`, e.g. `1 island · 842 nodes · 601×199 u`.
   - Primary "Download sticker SVG" — block, centered, 14px/600, padding 11px, radius 6px, bg `#ece9e2`, text `#171614`; hover bg `#ffffff`. Downloads `sticker.svg`.
   - Secondary "Cut line only" — 13px/500, padding 10px, radius 6px, border `1px solid #3a372f`, text `#ece9e2`; hover border `#ff4fd8`. Downloads `cutline.svg`.

**Preview components:**
- Background segmented control, absolute top 16px / right 16px: container padding 3px, radius 7px, bg `#171614`, border `1px solid #2a2825`, gap 2px. Buttons "Light / Dark / Grid": Instrument Sans 500 12px, padding 5px 10px, radius 5px, text `#ece9e2`; active bg `#3a372f`, inactive transparent.
- Result image `<img>` of the generated sticker SVG (blob URL): `max-width: 100%; max-height: calc(100vh - 120px); filter: drop-shadow(0 6px 18px rgba(0,0,0,.18))`.
- Empty/error state: centered 14px `#9a958c` text, max-width 320px — "Paste an SVG or drop a file here." or the error message.
- Busy badge, absolute top 16px / left 16px: "tracing…" JetBrains Mono 12px `#9a958c`, bg `#171614`, border `1px solid #2a2825`, radius 6px, padding 6px 10px.

## Interactions & Behavior
- **Input sources:** (a) global `paste` listener — if clipboard text matches `/<svg[\s>]/i` and the target isn't the textarea, load it; (b) hidden `<input type=file accept=".svg,image/svg+xml">`; (c) drag-drop onto `<main>` (`preventDefault` on dragover); (d) typing in the textarea.
- **Recompute:** any input or slider change → debounce 120 ms → run pipeline. Use a monotonically increasing run id and discard stale results (rasterize is async). Show the "tracing…" badge while busy.
- **Download links:** `<a download>` pointing to blob URLs; revoke old blob URLs when regenerating.
- **Errors** (invalid XML, not an `<svg>` root, SVG renders empty, browser can't render): replace preview with the message; clear downloads and stats.
- **App-level settings** (were "Tweaks" in the prototype; expose as a small settings popover or extra sidebar section):
  - Show cut line (boolean, default true) — when off the sticker export/preview has fill + logo only; the "Cut line only" download still includes the contour.
  - Cut color (default `#ff00ff`; suggested swatches `#ff00ff #ff3b30 #00b4ff #1b1b1b`).
  - Line width (0.5–10, step 0.5, default 1, unit ‰ of longer side → `strokeWidth = max(w,h) * value / 1000`).
  - Sticker fill (free color, default `#ffffff`).
  Changing these only re-runs `buildSvg` (cheap) — no re-trace.
- No animations beyond native hover color changes.

## Algorithm (cutline.js — port verbatim)
1. `rasterize(svgText, {offset, join, smooth}, target=1400)` — parse with DOMParser, strip `<metadata>/<script>`, resolve viewBox (fallback width/height, then 100×100), scale so longer side ≈ 1400 px (capped at 3.2 MP total), pad by `offset + join + 3·smooth + 6` px, replace `currentColor`→`#000`, draw to canvas, alpha > 96 → binary mask.
2. `trace(info, fillHoles)`:
   - Dilate by offset (exact Euclidean distance transform, Felzenszwalb–Huttenlocher) → rounded convex corners.
   - Morphological **closing** by join radius (dilate then erode) → bridges gaps, rounds concave corners ("liquid" look).
   - Flood-fill background from the border; unreached background = holes → fill.
   - 3-pass box blur (≈ Gaussian) → float field; marching squares at 0.5 with linear interpolation, segments linked into closed polygons; drop polygons < 12 points.
   - Resample at even spacing `max(3, 0.3·offset, 1.5·smooth)` px, 2 Laplacian smoothing passes.
3. `toPath(polys, info)` — map back to SVG units, closed Catmull-Rom → cubic Béziers, 2 decimals.
4. `buildSvg(info, d, {cutColor, fill, includeLogo, strokeWidth})` — outer `<svg>` with viewBox expanded by the margin; `<path id="CutContour" fill-rule="evenodd" stroke-linejoin="round">` first, then the original SVG nested with `x y width height viewBox` for 1:1 placement. Default stroke width `max(w,h)·0.0025`.
Performance: ~200–500 ms for a 600-unit logo on a laptop. Consider moving `trace` into a Web Worker (it is pure typed-array math; only `rasterize` needs the DOM).

## State Management
```
svgText: string          offsetPct: number (3)   joinPct: number (4)
smoothPct: number (0.5)  fillHoles: boolean (true)
bg: 'light' | 'dark' | 'grid'
stickerUrl, cutUrl: string | null   stats: {islands, nodes, w, h} | null
error: string | null     busy: boolean
settings: { showCutLine: true, cutColor: '#ff00ff', lineWidth: 1, stickerFill: '#ffffff' }
```
Keep `last = {info, d, res}` outside React state so settings changes can rebuild without re-tracing. Nice-to-have for the full app: persist settings + last SVG in localStorage; batch mode (multiple files → zip); PNG/PDF export; mm-based offset when the SVG declares physical units.

## Design Tokens
Colors: app bg `#171614`; panel border `#2a2825`; control border `#3a372f`; input bg `#0f0e0d`; text `#ece9e2`; muted `#9a958c`; faint `#6f6a62`; code text `#c9c4ba`; accent `#ff4fd8`; preview light `#f3f1ec`; preview dark `#232120`; preview grid `conic-gradient(#e4e1da 25%, #f7f5f0 0 50%, #e4e1da 0 75%, #f7f5f0 0) 0 0 / 24px 24px`; cut line `#ff00ff`.
Type: UI — Instrument Sans 400/500/600 (Google Fonts), fallback Helvetica/Arial; mono — JetBrains Mono 400/500. Sizes 11 / 12 / 13 / 14 / 17 px.
Spacing: 2, 3, 4, 6, 8, 10, 16, 22, 24, 40, 56 px. Radius: 5, 6, 7 px. Shadow: preview `drop-shadow(0 6px 18px rgba(0,0,0,.18))`.

## Assets
- `uploads/Logo Green.svg`, `uploads/Logo Dark Full.svg` — user's sample logos (loaded by default in the prototype; the real app should start empty or with a bundled sample).
- Fonts from Google Fonts; no icons or images.

## Screenshots
`screenshots/01-light-preview.png`, `02-dark-preview.png`, `03-grid-preview.png` — the generator with Logo Green loaded, one per preview background.

## Files
- `Sticker Cut Line.dc.html` — the prototype UI (template + logic class). Requires the prototype runtime (`support.js`) to open — read it for markup, styles and behavior, don't ship it.
- `cutline.js` — the algorithm module. Port directly.
- `uploads/` — sample SVGs.
