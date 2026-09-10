# Sticker cut line

Turn a logo into a print-ready sticker in the browser. Paste an SVG or drop a
transparent PNG, set the size in millimetres, tune the contour, and download the
sticker with a `CutContour` path, the cut line on its own, or a 300 dpi print
layer for Cricut and Silhouette.

Everything runs client-side. Nothing is uploaded anywhere.

**Live:** https://principle-hl.github.io/StickerMaker/

## What it does

- **Contour.** A smooth, rounded outline around all shapes at a chosen offset.
  Separate shapes are bridged into one outline ("join gaps"), enclosed holes in
  letters are filled, corners are rounded by the offset itself, not by hand.
- **Bleed.** The fill runs past the cut line by a chosen amount, so a little
  registration drift never leaves a white sliver.
- **Real sizes.** One "Artwork width" field in mm, prefilled from the file when
  it declares a size. Every control and every export is in millimetres, so
  files land 1:1 in Illustrator, CorelDRAW, Silhouette Studio or a RIP.
- **Targets.** Generic SVG, Roland VersaWorks, Mimaki RasterLink, Summa /
  Graphtec via Onyx or Caldera, Cricut Design Space, Silhouette Studio. A target
  applies its conventions once and tells you how that workflow consumes the files.
- **Cutter-friendly paths.** Curve fitting keeps the path within a tolerance you
  set (default 0.05 mm) and brings node counts down by roughly 10×.
- **Cut check.** Tightest corner radius, pieces under 3 mm (hard to weed), and
  necks under 2 mm (tear when weeding).
- **Instant.** A quick trace answers every slider tick in well under 100 ms; a
  full-resolution pass follows once you pause. Tracing runs in Web Workers, so
  the UI never stutters.
- **Three languages.** English, German and Slovenian, picked from the browser
  language and switchable in the top bar. Decimals follow the language
  (`2,0 mm` in German and Slovenian).
- **A real canvas.** Pan by dragging or scrolling, zoom with ⌘/Ctrl+scroll,
  pinch, or the − / + buttons; Shift+1 fits, Shift+0 is actual size (100% is
  true millimetres on a 96 dpi screen). Changing the offset or bleed grows the
  frame around the artwork instead of rescaling it.

## Exports

| File | Contents |
| --- | --- |
| `sticker.svg` | `<g id="Print">` with the fill (`id="Bleed"` or `id="Fill"`) and the artwork, then the cut path (`id="CutContour"`, magenta stroke) when the target keeps it. Page size in mm. |
| `cutline.svg` | The cut path alone, same page size, so the two register. |
| `print.png` | Fill plus artwork at 300 dpi, transparent outside, no cut line. Offered for print-then-cut targets. |

For VersaWorks, RasterLink, Onyx and Caldera, open `sticker.svg` in Illustrator,
apply the `CutContour` spot swatch to the cut path and save as PDF or EPS. A
direct PDF export with a real spot colour is the next thing on the list.

## Installing it as an app

It is a progressive web app. Open the live URL and:

- **Chrome / Edge / Brave:** click "Install as an app" at the bottom of the
  sidebar, or the install icon in the address bar.
- **Safari on macOS:** File → Add to Dock. **Safari on iOS:** Share → Add to
  Home Screen.

You get a Dock icon and a window of its own, and it keeps working offline. When a
new build is deployed, open windows show "New version available · Reload"; the
reload is safe because everything you set is kept in localStorage.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production bundle into dist/
npm run preview    # serve dist/ locally
```

Deploys happen automatically: every push to `main` builds and publishes to
GitHub Pages (`.github/workflows/deploy.yml`). Updates reach open windows two
ways: the service worker notices a new `sw.js` and waits for the user to say
"Reload", and, as a fallback for browsers without a worker, the page polls a
never-cached `version.json`. Both feed the same prompt.

## How it works

1. **Rasterize.** The artwork is drawn to a canvas at a working resolution;
   alpha above a threshold becomes a binary mask.
2. **Offset.** An exact Euclidean distance transform dilates the mask by the
   offset, which rounds convex corners for free.
3. **Join.** A morphological closing by the join radius bridges gaps and rounds
   concave corners.
4. **Holes.** Background not reachable from the border is filled.
5. **Contour.** A three-pass box blur, marching squares at 0.5, even resampling
   and two Laplacian passes give a clean polyline; a second dilation by the bleed
   gives the fill contour.
6. **Fit.** Schneider curve fitting turns each polyline into the fewest cubics
   within the tolerance.
7. **Check.** Corner radius from local circumcircles, speck size from bounding
   boxes, narrow necks by eroding the shape and seeing whether a piece splits.

Steps 2 to 7 run in a worker; the preview tier uses a ~600 px mask, the final
tier 1400 px.

## Source map

| Path | What it is |
| --- | --- |
| `src/lib/cutline.ts` | Distance transform, closing, hole fill, blur, marching squares, resampling, Catmull-Rom path. |
| `src/lib/fit.ts` | Schneider cubic curve fitting for closed polylines. |
| `src/lib/check.ts` | Corner radius, speck and narrow-bridge checks. |
| `src/lib/artwork.ts` | SVG and raster parsing, physical size detection, warnings, embedding for exports. |
| `src/lib/targets.ts` | Output target presets. |
| `src/lib/export.ts` | Sticker SVG, cut line SVG, print PNG. |
| `src/lib/tracer.ts`, `src/workers/trace.worker.ts` | Worker wrapper with latest-wins scheduling; the worker itself. |
| `src/hooks/useCutline.ts` | The pipeline: mm → mask units, preview and final tiers, export blobs. |
| `src/lib/updates.ts`, `src/lib/install.ts` | New-build detection (service worker + `version.json`); the install button. |
| `src/components/` | Sidebar (Artwork / Contour / Output tabs, downloads), TopBar (cut line, colours, width, fill, background, zoom) and Canvas (inline SVG sticker on a pan/zoom world, drop target). |
| `src/hooks/useViewport.ts` | Figma-style pan and zoom: wheel, pinch, drag, keyboard; transform written to the DOM, not through state. |
| `docs/handoff.md` | The original design handoff and prototype this was built from. |

## Roadmap

- PDF export with a real `CutContour` separation (no Illustrator step for pro RIPs).
- Kiss-cut plus through-cut contours for sheet stickers.
- Batch export and sheet nesting.

## License

MIT. See [LICENSE](LICENSE).
