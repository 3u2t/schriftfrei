

export interface InkPoint {

  x: number;
  y: number;

  t: number;

  pressure: number;
  tiltX: number;
  tiltY: number;
}

export interface InkStroke {
  points: InkPoint[];
  tool: 'pen' | 'mouse' | 'touch' | 'unknown';
}

export interface GlyphVariant {
  strokes: InkStroke[];

  widthFactor: number;

  baselineOffset: number;

  rawHeight?: number;

  /** Importierte Outline-Schrift (TTF/OTF): normierter SVG-Pfad, Höhe = 1, Baseline bei y = 0.8. */
  filled?: string;
}

export type CharMap = Record<string, GlyphVariant[]>;

export interface HandMetrics {

  xHeight: number;

  slant: number;
  letterGap: number;
  wordGap: number;

  baselineWobble: number;

  sizeVariance: number;
}

export interface HandwritingProfile {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  isDemo?: boolean;

  isTemplate?: boolean;
  glyphs: CharMap;
  metrics: HandMetrics;

  coverage: number;
  variantsPerChar: 1 | 2 | 3 | 5;

  sentenceSamples: InkStroke[][];
  sentencesDone: string[];

  suggestedSettings?: Partial<DocSettings>;

  /** Dateiname der importierten Font-Datei (TTF/OTF), falls zutreffend. */
  importedFrom?: string;
}


export type PointerMode = 'all' | 'stylus' | 'pen';

export type PaperKind = 'blank' | 'lined' | 'grid' | 'college' | 'dotted' | 'custom';

export type PenType = 'ballpoint' | 'fountain' | 'fineliner' | 'marker' | 'pencil';
export type Alignment = 'left' | 'center' | 'right' | 'justify';
export type PageFormat = 'a4' | 'a4-landscape' | 'a5' | 'letter' | 'square';

export interface DocSettings {
  fontSize: number;
  lineHeight: number;
  letterGap: number;
  wordGap: number;
  strokeWidth: number;
  naturalness: number;
  randomness: number;
  slant: number;
  paper: PaperKind;
  transparentBg?: boolean;
  seed: number;
  inkColor: string;
  penType: PenType;
  align: Alignment;
  margin: number;
  pageFormat: PageFormat;
  paperTint: string;
  snapLines?: boolean;
}

export interface TextDocument {
  id: string;
  title: string;
  text: string;
  settings: DocSettings;
  updatedAt: number;
  customPaperDataUrl?: string;
}

export const DEFAULT_SETTINGS: DocSettings = {
  fontSize: 34,
  lineHeight: 1.7,
  letterGap: 0.06,
  wordGap: 1.0,
  strokeWidth: 1.4,
  naturalness: 0,
  randomness: 60,
  slant: 0,
  paper: 'blank',
  transparentBg: false,
  seed: 7,
  inkColor: '#1c2742',
  penType: 'ballpoint',
  align: 'left',
  margin: 72,
  pageFormat: 'a4',
  paperTint: '#ffffff',
  snapLines: true,
};


export function migrateSettings(s: Partial<DocSettings>): DocSettings {
  return { ...DEFAULT_SETTINGS, ...s, naturalness: 0 };
}

export const INK_COLORS: { label: string; value: string }[] = [
  { label: 'Tiefblau', value: '#1c2742' },
  { label: 'Königsblau', value: '#1d4ed8' },
  { label: 'Schwarz', value: '#111111' },
  { label: 'Rot', value: '#dc2626' },
  { label: 'Grün', value: '#15803d' },
  { label: 'Violett', value: '#7c3aed' },
];

export const PEN_TYPES: Record<PenType, { label: string; widthMul: number; opacity: number }> = {
  ballpoint: { label: 'Kugelschreiber', widthMul: 1.0, opacity: 1 },
  fountain: { label: 'Füller', widthMul: 1.3, opacity: 1 },
  fineliner: { label: 'Fineliner', widthMul: 0.78, opacity: 1 },
  marker: { label: 'Filzstift', widthMul: 1.85, opacity: 0.92 },
  pencil: { label: 'Bleistift', widthMul: 1.05, opacity: 0.68 },
};

export const PAGE_FORMATS: Record<PageFormat, { label: string; w: number; h: number }> = {
  a4: { label: 'A4 hoch', w: 800, h: 1131 },
  'a4-landscape': { label: 'A4 quer', w: 1131, h: 800 },
  a5: { label: 'A5 hoch', w: 565, h: 800 },
  letter: { label: 'US Letter', w: 816, h: 1056 },
  square: { label: 'Quadrat', w: 900, h: 900 },
};

export function getPageDims(format: PageFormat): { w: number; h: number } {
  return PAGE_FORMATS[format] ?? PAGE_FORMATS.a4;
}

export const PAPER_TINTS: { label: string; value: string }[] = [
  { label: 'Weiß', value: '#ffffff' },
  { label: 'Creme', value: '#faf5e9' },
  { label: 'Natur', value: '#f1ece0' },
];

export const EXPORT_QUALITIES = [
  { id: 'standard', label: 'Standard', scale: 1.5 },
  { id: 'hd', label: 'HD', scale: 2.5 },
  { id: 'ultra', label: 'Ultra', scale: 4 },
] as const;

export type ExportQualityId = (typeof EXPORT_QUALITIES)[number]['id'];

export function qualityScale(id: ExportQualityId): number {
  return EXPORT_QUALITIES.find((q) => q.id === id)?.scale ?? 2.5;
}

export function defaultMetrics(): HandMetrics {
  return {
    xHeight: 0.62,
    slant: 6,
    letterGap: 0.08,
    wordGap: 1.0,
    baselineWobble: 0.35,
    sizeVariance: 0.3,
  };
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
