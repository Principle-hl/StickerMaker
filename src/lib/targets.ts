// Output targets: the conventions a given RIP or cutting app expects. Choosing a
// target applies its defaults once; every control stays editable afterwards.

export type TargetId = 'generic' | 'roland' | 'mimaki' | 'summa' | 'cricut' | 'silhouette';

export interface Target {
  id: TargetId;
  label: string;
  /** Name of the cut path object (its `id` in the SVG). Pro RIPs key off this name. */
  cutName: string;
  cutColor: string;
  lineWidthMm: number;
  /** Whether the cut line belongs in the sticker file at all. */
  showCutLine: boolean;
  /** Print-then-cut apps consume a print PNG and cut around its silhouette. */
  printPng: boolean;
  /** Suggested bleed for this workflow; null leaves the user's value alone. */
  bleedMm: number | null;
  /** English note; the UI shows the translated `target.<id>` string. */
  note: string;
}

export const TARGETS: Target[] = [
  {
    id: 'generic',
    label: 'Generic SVG',
    cutName: 'CutContour',
    cutColor: '#ff00ff',
    lineWidthMm: 0.1,
    showCutLine: true,
    printPng: false,
    bleedMm: null,
    note: 'Sticker and cut line as SVG with real millimetre sizes. The cut path is a magenta stroke named CutContour.',
  },
  {
    id: 'roland',
    label: 'Roland VersaWorks',
    cutName: 'CutContour',
    cutColor: '#ff00ff',
    lineWidthMm: 0.09,
    showCutLine: true,
    printPng: false,
    bleedMm: null,
    note: 'VersaWorks cuts along objects in the CutContour spot colour. Open the SVG in Illustrator, apply the CutContour swatch to the cut path and save as PDF or EPS.',
  },
  {
    id: 'mimaki',
    label: 'Mimaki RasterLink',
    cutName: 'CutContour',
    cutColor: '#ff00ff',
    lineWidthMm: 0.09,
    showCutLine: true,
    printPng: false,
    bleedMm: null,
    note: 'RasterLink reads a spot colour named CutContour. Apply it to the cut path in Illustrator and save as PDF or EPS.',
  },
  {
    id: 'summa',
    label: 'Summa / Graphtec via Onyx or Caldera',
    cutName: 'CutContour',
    cutColor: '#ff00ff',
    lineWidthMm: 0.09,
    showCutLine: true,
    printPng: false,
    bleedMm: null,
    note: 'The RIP picks up the CutContour spot colour and adds the registration marks itself. Apply the swatch in Illustrator and save as PDF.',
  },
  {
    id: 'cricut',
    label: 'Cricut Design Space',
    cutName: 'CutContour',
    cutColor: '#ff00ff',
    lineWidthMm: 0.1,
    showCutLine: false,
    printPng: true,
    bleedMm: 0,
    note: 'Print Then Cut: upload the print PNG. Design Space cuts around its edge and adds its own marks, so the cut line stays out of the print and bleed is 0.',
  },
  {
    id: 'silhouette',
    label: 'Silhouette Studio',
    cutName: 'CutContour',
    cutColor: '#ff00ff',
    lineWidthMm: 0.1,
    showCutLine: false,
    printPng: true,
    bleedMm: 0,
    note: 'Print & Cut: import the print PNG and trace its outer edge for the cut line. Studio adds the registration marks, so the cut line stays out of the print.',
  },
];

export const targetById = (id: TargetId): Target => TARGETS.find(t => t.id === id) ?? TARGETS[0];
