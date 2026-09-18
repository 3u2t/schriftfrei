import type { CharMap, DocSettings, HandMetrics, HandwritingProfile } from '../engine/types';
import { defaultMetrics, uid } from '../engine/types';
import { DEMO_CHARSET, demoGlyphFor } from '../engine/demoGenerator';

export interface FontStyle {
  id: string;
  name: string;
  desc: string;
  seed: number;
  wobble: number;
  metrics: Partial<HandMetrics>;
  suggested: Partial<DocSettings>;
}


export const FONT_STYLES: FontStyle[] = [
  {
    id: 'klassisch',
    name: 'Klassisch',
    desc: 'Ausgewogene Alltagshandschrift mit leichter Neigung.',
    seed: 42,
    wobble: 0.012,
    metrics: { slant: 7, baselineWobble: 0.4, sizeVariance: 0.35 },
    suggested: { penType: 'ballpoint', inkColor: '#1c2742', naturalness: 70, randomness: 60, slant: 0 },
  },
  {
    id: 'schwungvoll',
    name: 'Schwungvoll',
    desc: 'Lebhaft, stark geneigt – wie mit Füller geschrieben.',
    seed: 7,
    wobble: 0.02,
    metrics: { slant: 15, baselineWobble: 0.55, sizeVariance: 0.5, wordGap: 1.1 },
    suggested: { penType: 'fountain', inkColor: '#1d4ed8', naturalness: 75, randomness: 70, slant: 0 },
  },
  {
    id: 'druckschrift',
    name: 'Druckschrift',
    desc: 'Gerade, ruhig und sehr gut lesbar – ideal für Schule & Formulare.',
    seed: 123,
    wobble: 0.006,
    metrics: { slant: 0, baselineWobble: 0.12, sizeVariance: 0.12, letterGap: 0.14 },
    suggested: { penType: 'fineliner', inkColor: '#111111', naturalness: 35, randomness: 30, slant: 0 },
  },
  {
    id: 'locker',
    name: 'Locker',
    desc: 'Entspannte Notizschrift mit viel Charakter.',
    seed: 2026,
    wobble: 0.028,
    metrics: { slant: 4, baselineWobble: 0.6, sizeVariance: 0.55, wordGap: 1.15 },
    suggested: { penType: 'ballpoint', inkColor: '#1c2742', naturalness: 80, randomness: 85, slant: 0 },
  },
];


export function createStyleProfile(styleId: string): HandwritingProfile {
  const style = FONT_STYLES.find((s) => s.id === styleId) ?? FONT_STYLES[0];
  const glyphs: CharMap = {};
  // 3 Varianten pro Zeichen (leicht unterschiedliche Seeds/Wobble), damit im
  // Editor nicht jedes „e" identisch aussieht – Hauptfaktor für echten Look.
  for (const ch of DEMO_CHARSET) {
    glyphs[ch] = [
      demoGlyphFor(ch, style.seed, style.wobble),
      demoGlyphFor(ch, style.seed + 101, style.wobble * 1.25),
      demoGlyphFor(ch, style.seed + 202, style.wobble * 0.85),
    ];
  }
  const now = Date.now();
  return {
    id: uid('profile'),
    name: style.name,
    createdAt: now,
    updatedAt: now,
    isTemplate: true,
    glyphs,
    metrics: { ...defaultMetrics(), ...style.metrics },
    coverage: 100,
    variantsPerChar: 3,
    sentenceSamples: [],
    sentencesDone: [],
    suggestedSettings: style.suggested,
  };
}

export function styleSampleText(styleName: string): string {
  return `Hallo, das ist die Schrift „${styleName}".\nDès Noël, garçon Æsop: 12 plus 5 €, 100 % – ça roule?`;
}
