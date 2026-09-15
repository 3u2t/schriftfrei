import * as opentype from 'opentype.js';
import type { CharMap, HandwritingProfile } from '../engine/types';
import { defaultMetrics, uid } from '../engine/types';
import { ALL_TRAIN_CHARS, DIGITS, FRENCH, LOWER, SIGNS, UPPER } from '../training/charset';

const CORE_CHARS = new Set([...LOWER, ...UPPER, ...DIGITS, ...SIGNS, ...FRENCH]);

const FONT_SIZE = 1000;

function fmt(n: number): string {
  const r = Math.round(n * 10000) / 10000;
  return Number.isInteger(r) ? String(r) : String(r);
}

/**
 * Wandelt einen opentype.js-Pfad (Screen-Koordinaten, Baseline bei y=0)
 * in einen normierten SVG-Pfad um: Höhe = 1, Baseline bei y = 0.8.
 */
function toNormalizedD(path: opentype.Path, emPx: number): string | null {
  const parts: string[] = [];
  for (const cmd of path.commands) {
    const t = (cmd as { type: string }).type;
    if (t === 'M') {
      const c = cmd as unknown as { x: number; y: number };
      parts.push(`M ${fmt(c.x / emPx)} ${fmt(0.8 + c.y / emPx)}`);
    } else if (t === 'L') {
      const c = cmd as unknown as { x: number; y: number };
      parts.push(`L ${fmt(c.x / emPx)} ${fmt(0.8 + c.y / emPx)}`);
    } else if (t === 'Q') {
      const c = cmd as unknown as { x1: number; y1: number; x: number; y: number };
      parts.push(`Q ${fmt(c.x1 / emPx)} ${fmt(0.8 + c.y1 / emPx)} ${fmt(c.x / emPx)} ${fmt(0.8 + c.y / emPx)}`);
    } else if (t === 'C') {
      const c = cmd as unknown as { x1: number; y1: number; x2: number; y2: number; x: number; y: number };
      parts.push(
        `C ${fmt(c.x1 / emPx)} ${fmt(0.8 + c.y1 / emPx)} ${fmt(c.x2 / emPx)} ${fmt(0.8 + c.y2 / emPx)} ${fmt(c.x / emPx)} ${fmt(0.8 + c.y / emPx)}`,
      );
    } else if (t === 'Z') {
      parts.push('Z');
    }
  }
  if (parts.length === 0) return null;
  return parts.join(' ');
}

export interface FontImportResult {
  profile: HandwritingProfile;
  imported: number;
  total: number;
  missing: string[];
  /** Fehlende Kernzeichen (Deutsch/Französisch/Zeichen) – Extended-Latein ist Bonus. */
  coreMissing: string[];
}

export async function fontFileToProfile(file: File): Promise<FontImportResult> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!['ttf', 'otf', 'woff', 'woff2'].includes(ext)) {
    throw new Error('Bitte eine Font-Datei wählen (.ttf, .otf, .woff oder .woff2).');
  }
  if (file.size > 15 * 1024 * 1024) {
    throw new Error('Die Datei ist zu groß (max. 15 MB).');
  }
  let buffer: ArrayBuffer;
  try {
    buffer = await file.arrayBuffer();
  } catch {
    throw new Error('Die Datei konnte nicht gelesen werden.');
  }
  let font: opentype.Font;
  try {
    font = opentype.parse(buffer);
  } catch {
    throw new Error('Diese Font-Datei konnte nicht gelesen werden. Falls es .woff2 ist: bitte als .ttf/.otf exportieren und erneut versuchen.');
  }

  const upm = font.unitsPerEm || 1000;
  const asc = font.ascender ?? upm * 0.8;
  const desc = font.descender ?? upm * -0.2;
  const emUnits = asc - desc > 0 ? asc - desc : upm;
  const emPx = (emUnits * FONT_SIZE) / upm;

  const family =
    (font.names?.fontFamily as unknown as { en?: string } | undefined)?.en ||
    file.name.replace(/\.(ttf|otf|woff2?)$/i, '');

  const glyphs: CharMap = {};
  const missing: string[] = [];

  for (const ch of ALL_TRAIN_CHARS) {
    if (ch === ' ') continue;
    let glyph: opentype.Glyph;
    try {
      glyph = font.charToGlyph(ch);
    } catch {
      missing.push(ch);
      continue;
    }
    // .notdef überspringen (kein echtes Zeichen)
    if (!glyph || glyph.index === 0) {
      const hasPath = (glyph?.path?.commands?.length ?? 0) > 0;
      if (!hasPath) {
        missing.push(ch);
        continue;
      }
    }
    let path: opentype.Path;
    try {
      path = font.getPath(ch, 0, 0, FONT_SIZE);
    } catch {
      missing.push(ch);
      continue;
    }
    if (!path.commands || path.commands.length === 0) {
      missing.push(ch);
      continue;
    }
    const d = toNormalizedD(path, emPx);
    if (!d) {
      missing.push(ch);
      continue;
    }
    const advUnits = glyph.advanceWidth ?? upm * 0.5;
    const advPx = (advUnits * FONT_SIZE) / upm;
    const widthFactor = Math.min(1.6, Math.max(0.2, advPx / emPx));
    glyphs[ch] = [{ strokes: [], widthFactor, baselineOffset: 0, filled: d }];
  }

  const imported = Object.keys(glyphs).length;
  if (imported === 0) {
    throw new Error('In dieser Font-Datei wurden keine lesbaren Zeichen gefunden.');
  }

  const now = Date.now();
  const profile: HandwritingProfile = {
    id: uid('profile'),
    name: `${family} (Import)`.slice(0, 80),
    createdAt: now,
    updatedAt: now,
    isDemo: false,
    isTemplate: false,
    glyphs,
    metrics: { ...defaultMetrics(), slant: 0, baselineWobble: 0, sizeVariance: 0 },
    coverage: Math.min(100, Math.round((imported / ALL_TRAIN_CHARS.length) * 100)),
    variantsPerChar: 1,
    sentenceSamples: [],
    sentencesDone: [],
    importedFrom: file.name.slice(0, 120),
  };

  return { profile, imported, total: ALL_TRAIN_CHARS.length, missing, coreMissing: missing.filter((c) => CORE_CHARS.has(c)) };
}
