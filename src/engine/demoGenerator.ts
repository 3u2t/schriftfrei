import type { CharMap, GlyphVariant, HandwritingProfile, InkPoint, InkStroke } from './types';
import { defaultMetrics, uid } from './types';
import { clamp } from './normalize';
import { mulberry32 } from './random';

type Pt = [number, number];
type Skeleton = Pt[][];


const SKELETONS: Record<string, Skeleton> = {
  a: [[[0.36, 0.38], [0.16, 0.46], [0.12, 0.66], [0.3, 0.8], [0.5, 0.68], [0.5, 0.44]], [[0.5, 0.34], [0.52, 0.6], [0.5, 0.8]]],
  b: [[[0.15, 0.02], [0.14, 0.45], [0.15, 0.8]], [[0.15, 0.42], [0.36, 0.36], [0.5, 0.56], [0.34, 0.8], [0.15, 0.74]]],
  c: [[[0.5, 0.42], [0.3, 0.32], [0.12, 0.5], [0.15, 0.7], [0.35, 0.8], [0.5, 0.72]]],
  d: [[[0.12, 0.5], [0.2, 0.72], [0.38, 0.8], [0.5, 0.6], [0.44, 0.4], [0.26, 0.36], [0.12, 0.5]], [[0.5, 0.02], [0.5, 0.8]]],
  e: [[[0.48, 0.56], [0.3, 0.46], [0.14, 0.5], [0.12, 0.68], [0.3, 0.8], [0.5, 0.7]], [[0.12, 0.56], [0.46, 0.56]]],
  f: [[[0.42, 0.04], [0.3, 0.2], [0.3, 0.78], [0.24, 0.94]], [[0.12, 0.36], [0.5, 0.36]]],
  g: [[[0.36, 0.38], [0.16, 0.46], [0.12, 0.66], [0.3, 0.8], [0.5, 0.68], [0.5, 0.5]], [[0.5, 0.6], [0.5, 0.9], [0.3, 1.0], [0.12, 0.9]]],
  h: [[[0.12, 0.02], [0.12, 0.8]], [[0.12, 0.52], [0.3, 0.4], [0.46, 0.5], [0.46, 0.8]]],
  i: [[[0.26, 0.36], [0.26, 0.8]], [[0.24, 0.1], [0.28, 0.14]]],
  j: [[[0.3, 0.36], [0.3, 0.86], [0.2, 1.0], [0.08, 0.94]], [[0.28, 0.1], [0.32, 0.14]]],
  k: [[[0.12, 0.02], [0.12, 0.8]], [[0.46, 0.4], [0.14, 0.6]], [[0.22, 0.62], [0.48, 0.8]]],
  l: [[[0.24, 0.02], [0.22, 0.55], [0.24, 0.8], [0.32, 0.84]]],
  m: [[[0.08, 0.8], [0.08, 0.42], [0.24, 0.34], [0.34, 0.46], [0.34, 0.8]], [[0.34, 0.46], [0.48, 0.34], [0.6, 0.46], [0.6, 0.8]]],
  n: [[[0.1, 0.8], [0.1, 0.42], [0.3, 0.34], [0.46, 0.46], [0.46, 0.8]]],
  o: [[[0.3, 0.34], [0.14, 0.44], [0.12, 0.66], [0.3, 0.8], [0.48, 0.68], [0.48, 0.46], [0.3, 0.34]]],
  p: [[[0.12, 0.34], [0.12, 1.0]], [[0.12, 0.4], [0.34, 0.34], [0.48, 0.52], [0.32, 0.72], [0.12, 0.68]]],
  q: [[[0.14, 0.5], [0.22, 0.7], [0.4, 0.78], [0.5, 0.58], [0.42, 0.4], [0.24, 0.38], [0.14, 0.5]], [[0.46, 0.5], [0.52, 0.9], [0.46, 1.0]]],
  r: [[[0.12, 0.8], [0.12, 0.38]], [[0.12, 0.46], [0.3, 0.34], [0.46, 0.46]]],
  s: [[[0.46, 0.42], [0.26, 0.32], [0.12, 0.46], [0.26, 0.58], [0.44, 0.62], [0.4, 0.78], [0.2, 0.82], [0.08, 0.72]]],
  t: [[[0.32, 0.08], [0.3, 0.5], [0.3, 0.76], [0.38, 0.82]], [[0.1, 0.34], [0.52, 0.34]]],
  u: [[[0.1, 0.36], [0.1, 0.68], [0.28, 0.8], [0.42, 0.66], [0.42, 0.36]]],
  v: [[[0.08, 0.36], [0.26, 0.8], [0.46, 0.36]]],
  w: [[[0.04, 0.36], [0.17, 0.8], [0.29, 0.46], [0.41, 0.8], [0.56, 0.36]]],
  x: [[[0.1, 0.36], [0.46, 0.8]], [[0.46, 0.36], [0.1, 0.8]]],
  y: [[[0.08, 0.36], [0.28, 0.64], [0.5, 0.36]], [[0.28, 0.64], [0.26, 0.9], [0.1, 1.0]]],
  z: [[[0.08, 0.36], [0.48, 0.36], [0.1, 0.8], [0.5, 0.8]]],
  A: [[[0.06, 0.8], [0.3, 0.02], [0.54, 0.8]], [[0.16, 0.55], [0.44, 0.55]]],
  B: [[[0.12, 0.02], [0.12, 0.8]], [[0.12, 0.04], [0.36, 0.04], [0.46, 0.2], [0.3, 0.38], [0.12, 0.4]], [[0.12, 0.4], [0.38, 0.4], [0.5, 0.6], [0.34, 0.8], [0.12, 0.8]]],
  C: [[[0.5, 0.2], [0.32, 0.04], [0.12, 0.24], [0.1, 0.58], [0.3, 0.78], [0.5, 0.64]]],
  D: [[[0.12, 0.02], [0.12, 0.8]], [[0.12, 0.04], [0.36, 0.04], [0.52, 0.3], [0.44, 0.62], [0.3, 0.8], [0.12, 0.8]]],
  E: [[[0.46, 0.04], [0.14, 0.04], [0.12, 0.4], [0.12, 0.8], [0.46, 0.8]], [[0.12, 0.42], [0.38, 0.42]]],
  F: [[[0.46, 0.04], [0.14, 0.04], [0.12, 0.42], [0.12, 0.8]], [[0.12, 0.42], [0.38, 0.42]]],
  G: [[[0.5, 0.2], [0.32, 0.04], [0.12, 0.24], [0.1, 0.58], [0.3, 0.78], [0.5, 0.72], [0.5, 0.5], [0.36, 0.5]]],
  H: [[[0.1, 0.02], [0.1, 0.8]], [[0.5, 0.02], [0.5, 0.8]], [[0.1, 0.42], [0.5, 0.42]]],
  I: [[[0.14, 0.04], [0.46, 0.04]], [[0.3, 0.04], [0.3, 0.8]], [[0.14, 0.8], [0.46, 0.8]]],
  J: [[[0.48, 0.04], [0.46, 0.55], [0.34, 0.78], [0.16, 0.76]]],
  K: [[[0.12, 0.02], [0.12, 0.8]], [[0.5, 0.04], [0.14, 0.5]], [[0.22, 0.56], [0.52, 0.8]]],
  L: [[[0.16, 0.02], [0.14, 0.6], [0.16, 0.8], [0.5, 0.8]]],
  M: [[[0.08, 0.8], [0.1, 0.04], [0.32, 0.5], [0.52, 0.04], [0.54, 0.8]]],
  N: [[[0.1, 0.8], [0.12, 0.04], [0.5, 0.8], [0.5, 0.04]]],
  O: [[[0.32, 0.02], [0.12, 0.16], [0.1, 0.55], [0.3, 0.8], [0.5, 0.64], [0.52, 0.25], [0.32, 0.02]]],
  P: [[[0.12, 0.8], [0.13, 0.04]], [[0.13, 0.04], [0.38, 0.04], [0.48, 0.22], [0.32, 0.42], [0.13, 0.42]]],
  Q: [[[0.32, 0.02], [0.12, 0.16], [0.1, 0.55], [0.3, 0.8], [0.5, 0.64], [0.52, 0.25], [0.32, 0.02]], [[0.38, 0.6], [0.58, 0.84]]],
  R: [[[0.12, 0.8], [0.13, 0.04]], [[0.13, 0.04], [0.38, 0.04], [0.48, 0.22], [0.32, 0.42], [0.13, 0.42]], [[0.3, 0.42], [0.52, 0.8]]],
  S: [[[0.48, 0.18], [0.3, 0.04], [0.12, 0.16], [0.2, 0.36], [0.44, 0.46], [0.46, 0.64], [0.28, 0.8], [0.1, 0.7]]],
  T: [[[0.08, 0.04], [0.54, 0.04]], [[0.31, 0.04], [0.31, 0.8]]],
  U: [[[0.1, 0.04], [0.1, 0.6], [0.3, 0.8], [0.5, 0.6], [0.5, 0.04]]],
  V: [[[0.08, 0.04], [0.3, 0.8], [0.54, 0.04]]],
  W: [[[0.04, 0.04], [0.17, 0.8], [0.3, 0.3], [0.43, 0.8], [0.58, 0.04]]],
  X: [[[0.1, 0.04], [0.52, 0.8]], [[0.52, 0.04], [0.1, 0.8]]],
  Y: [[[0.08, 0.04], [0.31, 0.42]], [[0.54, 0.04], [0.31, 0.42]], [[0.31, 0.42], [0.31, 0.8]]],
  Z: [[[0.08, 0.04], [0.54, 0.04], [0.1, 0.8], [0.56, 0.8]]],
  '0': [[[0.3, 0.02], [0.12, 0.18], [0.1, 0.58], [0.3, 0.8], [0.48, 0.62], [0.5, 0.2], [0.3, 0.02]]],
  '1': [[[0.18, 0.2], [0.32, 0.04], [0.32, 0.8]], [[0.18, 0.8], [0.46, 0.8]]],
  '2': [[[0.12, 0.22], [0.28, 0.04], [0.46, 0.14], [0.4, 0.34], [0.14, 0.7], [0.14, 0.8], [0.5, 0.8]]],
  '3': [[[0.12, 0.16], [0.32, 0.04], [0.46, 0.18], [0.3, 0.38], [0.4, 0.44], [0.48, 0.6], [0.32, 0.8], [0.12, 0.72]]],
  '4': [[[0.4, 0.04], [0.14, 0.5], [0.48, 0.5]], [[0.36, 0.32], [0.36, 0.8]]],
  '5': [[[0.46, 0.04], [0.16, 0.04], [0.14, 0.36], [0.3, 0.44], [0.44, 0.56], [0.36, 0.78], [0.14, 0.76]]],
  '6': [[[0.42, 0.08], [0.24, 0.24], [0.14, 0.52], [0.16, 0.72], [0.36, 0.8], [0.48, 0.62], [0.4, 0.44], [0.2, 0.44]]],
  '7': [[[0.1, 0.04], [0.52, 0.04], [0.3, 0.8]]],
  '8': [[[0.3, 0.36], [0.14, 0.28], [0.12, 0.12], [0.3, 0.04], [0.46, 0.12], [0.44, 0.28], [0.3, 0.36]], [[0.3, 0.36], [0.12, 0.46], [0.14, 0.68], [0.32, 0.8], [0.48, 0.68], [0.46, 0.46], [0.3, 0.36]]],
  '9': [[[0.4, 0.36], [0.2, 0.36], [0.12, 0.18], [0.26, 0.04], [0.44, 0.14], [0.48, 0.42], [0.36, 0.68], [0.18, 0.76]]],
  '.': [[[0.28, 0.72], [0.32, 0.76]]],
  ',': [[[0.3, 0.7], [0.28, 0.78], [0.18, 0.92]]],
  '!': [[[0.3, 0.04], [0.3, 0.56]], [[0.28, 0.7], [0.32, 0.74]]],
  '?': [[[0.14, 0.2], [0.3, 0.04], [0.46, 0.16], [0.38, 0.36], [0.3, 0.48], [0.3, 0.58]], [[0.28, 0.7], [0.32, 0.74]]],
  ':': [[[0.28, 0.34], [0.32, 0.38]], [[0.28, 0.66], [0.32, 0.7]]],
  ';': [[[0.28, 0.34], [0.32, 0.38]], [[0.3, 0.64], [0.28, 0.76], [0.18, 0.9]]],
  '-': [[[0.1, 0.52], [0.5, 0.52]]],
  _: [[[0.08, 0.86], [0.54, 0.86]]],
  '(': [[[0.36, 0.04], [0.18, 0.3], [0.18, 0.6], [0.36, 0.84]]],
  ')': [[[0.14, 0.04], [0.32, 0.3], [0.32, 0.6], [0.14, 0.84]]],
  '/': [[[0.42, 0.02], [0.18, 0.84]]],
  '+': [[[0.3, 0.3], [0.3, 0.7]], [[0.1, 0.5], [0.5, 0.5]]],
  '=': [[[0.1, 0.42], [0.5, 0.42]], [[0.1, 0.62], [0.5, 0.62]]],
  '%': [[[0.44, 0.04], [0.16, 0.8]], [[0.2, 0.22], [0.22, 0.24]], [[0.4, 0.62], [0.42, 0.64]]],
  '&': [[[0.44, 0.7], [0.3, 0.6], [0.14, 0.48], [0.2, 0.34], [0.36, 0.34], [0.44, 0.48], [0.3, 0.66], [0.14, 0.8], [0.34, 0.86], [0.5, 0.72]]],
  '€': [[[0.5, 0.2], [0.32, 0.06], [0.12, 0.26], [0.1, 0.58], [0.3, 0.78], [0.5, 0.64]], [[0.06, 0.36], [0.5, 0.36]], [[0.06, 0.52], [0.5, 0.52]]],
  '’': [[[0.32, 0.12], [0.34, 0.2], [0.28, 0.3]]],
  '‘': [[[0.28, 0.12], [0.26, 0.2], [0.32, 0.3]]],
  '“': [[[0.2, 0.12], [0.22, 0.2], [0.16, 0.3]], [[0.38, 0.12], [0.4, 0.2], [0.34, 0.3]]],
  '”': [[[0.22, 0.12], [0.2, 0.2], [0.26, 0.3]], [[0.4, 0.12], [0.38, 0.2], [0.44, 0.3]]],
  '«': [[[0.2, 0.38], [0.08, 0.57]], [[0.08, 0.57], [0.2, 0.76]], [[0.38, 0.38], [0.26, 0.57]], [[0.26, 0.57], [0.38, 0.76]]],
  '»': [[[0.08, 0.38], [0.2, 0.57]], [[0.2, 0.57], [0.08, 0.76]], [[0.26, 0.38], [0.38, 0.57]], [[0.38, 0.57], [0.26, 0.76]]],
  '…': [[[0.08, 0.72], [0.11, 0.75]], [[0.26, 0.72], [0.29, 0.75]], [[0.44, 0.72], [0.47, 0.75]]],
  '–': [[[0.12, 0.52], [0.4, 0.52]]],
  '—': [[[0.06, 0.52], [0.54, 0.52]]],
  '·': [[[0.28, 0.52], [0.31, 0.55]]],
};

type AccentKind = 'acute' | 'grave' | 'circumflex' | 'diaeresis' | 'cedilla';

/** Akzent-Zeichen für Kleinbuchstaben (x-Höhe oben ≈ 0.34, Basislinie 0.8). */
const ACCENTS_LOWER: Record<AccentKind, Skeleton> = {
  acute: [[[0.24, 0.27], [0.37, 0.12]]],
  grave: [[[0.24, 0.12], [0.37, 0.27]]],
  circumflex: [[[0.19, 0.25], [0.31, 0.12]], [[0.31, 0.12], [0.43, 0.25]]],
  diaeresis: [[[0.21, 0.17], [0.24, 0.2]], [[0.36, 0.17], [0.39, 0.2]]],
  cedilla: [[[0.3, 0.82], [0.29, 0.91], [0.21, 0.98], [0.12, 0.94]]],
};

/** Akzent-Zeichen für Großbuchstaben (Kapitälchen oben ≈ 0.02 – Akzent darüber, ≥ −0.1 wegen Clamp). */
const ACCENTS_UPPER: Record<AccentKind, Skeleton> = {
  acute: [[[0.24, 0.0], [0.37, -0.1]]],
  grave: [[[0.24, -0.1], [0.37, 0.0]]],
  circumflex: [[[0.18, 0.0], [0.3, -0.1]], [[0.3, -0.1], [0.42, 0.0]]],
  diaeresis: [[[0.2, -0.05], [0.23, -0.02]], [[0.35, -0.05], [0.38, -0.02]]],
  cedilla: [[[0.3, 0.82], [0.29, 0.91], [0.21, 0.98], [0.12, 0.94]]],
};

interface AccentedSpec {
  base: string;
  accent: AccentKind;
  upper: boolean;
  /** z. B. bei î/ï: i-Punkt (letzter Basis-Strich) entfällt, Akzent ersetzt ihn. */
  dropDot?: boolean;
}

const ACCENTED: Record<string, AccentedSpec> = {
  'à': { base: 'a', accent: 'grave', upper: false },
  'â': { base: 'a', accent: 'circumflex', upper: false },
  'ä': { base: 'a', accent: 'diaeresis', upper: false },
  'ç': { base: 'c', accent: 'cedilla', upper: false },
  'é': { base: 'e', accent: 'acute', upper: false },
  'è': { base: 'e', accent: 'grave', upper: false },
  'ê': { base: 'e', accent: 'circumflex', upper: false },
  'ë': { base: 'e', accent: 'diaeresis', upper: false },
  'î': { base: 'i', accent: 'circumflex', upper: false, dropDot: true },
  'ï': { base: 'i', accent: 'diaeresis', upper: false, dropDot: true },
  'ô': { base: 'o', accent: 'circumflex', upper: false },
  'ù': { base: 'u', accent: 'grave', upper: false },
  'û': { base: 'u', accent: 'circumflex', upper: false },
  'ü': { base: 'u', accent: 'diaeresis', upper: false },
  'ÿ': { base: 'y', accent: 'diaeresis', upper: false },
  'À': { base: 'A', accent: 'grave', upper: true },
  'Â': { base: 'A', accent: 'circumflex', upper: true },
  'Ä': { base: 'A', accent: 'diaeresis', upper: true },
  'Ç': { base: 'C', accent: 'cedilla', upper: true },
  'É': { base: 'E', accent: 'acute', upper: true },
  'È': { base: 'E', accent: 'grave', upper: true },
  'Ê': { base: 'E', accent: 'circumflex', upper: true },
  'Ë': { base: 'E', accent: 'diaeresis', upper: true },
  'Î': { base: 'I', accent: 'circumflex', upper: true },
  'Ï': { base: 'I', accent: 'diaeresis', upper: true },
  'Ô': { base: 'O', accent: 'circumflex', upper: true },
  'Ù': { base: 'U', accent: 'grave', upper: true },
  'Û': { base: 'U', accent: 'circumflex', upper: true },
  'Ü': { base: 'U', accent: 'diaeresis', upper: true },
  'Ÿ': { base: 'Y', accent: 'diaeresis', upper: true },
};

function accentedSkeleton(spec: AccentedSpec): Skeleton | null {
  const base = SKELETONS[spec.base];
  if (!base) return null;
  const marks = (spec.upper ? ACCENTS_UPPER : ACCENTS_LOWER)[spec.accent];
  const body = spec.dropDot ? base.slice(0, -1) : base;
  return [...body, ...marks];
}

/** Zwei Skelette horizontal gestaucht zu einer Ligatur (æ/œ/Æ/Œ) verschmelzen. */
function fuse(a: Skeleton, b: Skeleton): Skeleton {
  const fit = (sk: Skeleton, x0: number, w: number): Skeleton =>
    sk.map((s) => s.map(([x, y]): Pt => [x0 + x * w, y]));
  return [...fit(a, 0, 0.52), ...fit(b, 0.48, 0.52)];
}

for (const [ch, spec] of Object.entries(ACCENTED)) {
  const sk = accentedSkeleton(spec);
  if (sk) SKELETONS[ch] = sk;
}
SKELETONS['æ'] = fuse(SKELETONS['a'], SKELETONS['e']);
SKELETONS['œ'] = fuse(SKELETONS['o'], SKELETONS['e']);
SKELETONS['Æ'] = fuse(SKELETONS['A'], SKELETONS['E']);
SKELETONS['Œ'] = fuse(SKELETONS['O'], SKELETONS['E']);
// Gerade Tastatur-Zeichen auf die typografischen Formen mappen.
SKELETONS["'"] = SKELETONS['’'];
SKELETONS['"'] = SKELETONS['“'];

export interface StrokeBounds {
  min: number;
  max: number;
}

const DEFAULT_BOUNDS: StrokeBounds = { min: -0.1, max: 1.1 };

function interpolateStroke(skel: Pt[], seed: number, wobble: number, bounds: StrokeBounds = DEFAULT_BOUNDS): InkStroke {
  const rnd = mulberry32(seed);

  const dense: Pt[] = [];
  const P = (i: number): Pt => skel[Math.min(skel.length - 1, Math.max(0, i))];
  if (skel.length === 1) {
    dense.push(skel[0], [skel[0][0] + 0.03, skel[0][1] + 0.03]);
  } else if (skel.length === 2) {
    for (let k = 0; k <= 10; k++) {
      const t = k / 10;
      dense.push([P(0)[0] + (P(1)[0] - P(0)[0]) * t, P(0)[1] + (P(1)[1] - P(0)[1]) * t]);
    }
  } else {
    for (let i = 0; i < skel.length - 1; i++) {
      const p0 = P(i - 1);
      const p1 = P(i);
      const p2 = P(i + 1);
      const p3 = P(i + 2);
      const steps = 8;
      for (let k = 0; k < steps; k++) {
        const t = k / steps;
        const t2 = t * t;
        const t3 = t2 * t;
        dense.push([
          0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
        ]);
      }
    }
    dense.push(skel[skel.length - 1]);
  }
  const points: InkPoint[] = dense.map((p, i) => ({
    x: clamp(p[0] + (rnd() - 0.5) * wobble, bounds.min, bounds.max),
    y: clamp(p[1] + (rnd() - 0.5) * wobble, bounds.min, bounds.max),
    t: i * 9,
    pressure: clamp(0.5 + Math.sin((i / Math.max(1, dense.length)) * Math.PI * 2) * 0.18 + (rnd() - 0.5) * 0.12, 0.15, 1),
    tiltX: 8,
    tiltY: 12,
  }));
  return { points, tool: 'pen' };
}


export function skeletonFor(ch: string): Skeleton | null {
  return SKELETONS[ch] ?? null;
}


const variantCache = new Map<string, GlyphVariant>();
const VARIANT_CACHE_MAX = 3000;

export function demoGlyphFor(ch: string, seed = 42, wobble = 0.012): GlyphVariant {
  const key = `${ch} ${seed} ${wobble}`;
  const hit = variantCache.get(key);
  if (hit) return hit;
  let v: GlyphVariant;
  const skel = SKELETONS[ch];
  if (!skel) {
    // Generisch: lateinische Buchstaben per Unicode-Komposition (geht für
    // fast alle Diakritika, z. B. Spanisch, Vietnamesisch). CJK/Arabisch & Co.
    // fallen bewusst weiter auf die Box zurück.
    const composed = composeLatin(ch);
    v = composed
      ? skeletonToVariant(composed, seed, wobble, COMPOSED_BOUNDS)
      : {
          strokes: [interpolateStroke([[0.15, 0.3], [0.45, 0.3], [0.45, 0.8], [0.15, 0.8], [0.15, 0.3]], seed, 0.01)],
          widthFactor: 0.5,
          baselineOffset: 0,
        };
  } else {
    v = skeletonToVariant(skel, seed, wobble, boundsFor(skel));
  }
  // Hinweis: Rückgabe ist gecacht – bitte nicht mutieren.
  if (variantCache.size >= VARIANT_CACHE_MAX) variantCache.clear();
  variantCache.set(key, v);
  return v;
}

/** Erweiterte Box für komponierte Glyphen (gestapelte Akzente über Versalien). */
const COMPOSED_BOUNDS: StrokeBounds = { min: -0.3, max: 1.35 };

function boundsFor(skel: Skeleton): StrokeBounds | undefined {
  let mn = Infinity;
  let mx = -Infinity;
  for (const s of skel) {
    for (const [, y] of s) {
      if (y < mn) mn = y;
      if (y > mx) mx = y;
    }
  }
  return mn < -0.1 || mx > 1.1 ? COMPOSED_BOUNDS : undefined;
}

function skeletonToVariant(skel: Skeleton, seed: number, wobble: number, bounds?: StrokeBounds): GlyphVariant {
  const strokes = skel.map((s, i) => interpolateStroke(s, seed + i * 131, wobble, bounds));
  let minX = Infinity;
  let maxX = -Infinity;
  for (const s of strokes) {
    for (const p of s.points) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
    }
  }
  const widthFactor = clamp(maxX - minX || 0.4, 0.2, 1.2);
  return { strokes, widthFactor, baselineOffset: 0 };
}

export const DEMO_CHARSET: string[] = Object.keys(SKELETONS);


export function createDemoProfile(): HandwritingProfile {
  const glyphs: CharMap = {};
  for (const ch of DEMO_CHARSET) glyphs[ch] = [demoGlyphFor(ch)];

  const now = Date.now();
  return {
    id: 'demo',
    name: 'Demo-Handschrift',
    createdAt: now,
    updatedAt: now,
    isDemo: true,
    glyphs,
    metrics: { ...defaultMetrics(), slant: 7, baselineWobble: 0.4, sizeVariance: 0.35 },
    coverage: 100,
    variantsPerChar: 1,
    sentenceSamples: [],
    sentencesDone: [],
  };
}


export function createEmptyProfile(name = 'Meine Handschrift'): HandwritingProfile {
  const now = Date.now();
  return {
    id: uid('profile'),
    name,
    createdAt: now,
    updatedAt: now,
    glyphs: {},
    metrics: defaultMetrics(),
    coverage: 0,
    variantsPerChar: 2,
    sentenceSamples: [],
    sentencesDone: [],
  };
}


// ---------- Generische lateinische Komposition (alle Diakritika) ----------
// Idee: Jedes lateinische Zeichen per NFD in Basisbuchstabe + kombinierende
// Zeichen zerlegen (z. B. ñ → n + ˜) und die Akzente als Skelett-Striche an
// die Basis hängen. So funktionieren Spanisch, Portugiesisch, Italienisch,
// Skandinavisch, Osteuropäisch, Türkisch, Vietnamesisch usw. automatisch.
// Nicht-lateinische Schriften (Chinesisch, Arabisch, …) sind bewusst
// ausgenommen und fallen weiter auf die Box zurück.

function ringMark(cx: number, cy: number, r: number): Skeleton {
  const pts: Pt[] = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  pts.push(pts[0]);
  return [pts];
}

/** Akzente über der Basis (Kleinbuchstaben-Zone, auf x ≈ 0.31 zentriert). */
const COMBINING_ABOVE: Record<string, Skeleton> = {
  '\u0300': ACCENTS_LOWER.grave,
  '\u0301': ACCENTS_LOWER.acute,
  '\u0302': ACCENTS_LOWER.circumflex,
  '\u0303': [[[0.18, 0.2], [0.26, 0.13], [0.34, 0.2], [0.42, 0.13]]],
  '\u0304': [[[0.17, 0.18], [0.45, 0.18]]],
  '\u0306': [[[0.19, 0.13], [0.31, 0.24], [0.43, 0.13]]],
  '\u0307': [[[0.29, 0.16], [0.32, 0.19]]],
  '\u0308': ACCENTS_LOWER.diaeresis,
  '\u0309': [[[0.34, 0.12], [0.37, 0.19], [0.32, 0.24]]],
  '\u030A': ringMark(0.31, 0.16, 0.055),
  '\u030B': [[[0.2, 0.27], [0.29, 0.12]], [[0.33, 0.27], [0.42, 0.12]]],
  '\u030C': [[[0.19, 0.12], [0.31, 0.25]], [[0.31, 0.25], [0.43, 0.12]]],
  '\u031B': [[[0.4, 0.3], [0.5, 0.2], [0.52, 0.08]]],
};

/** Akzente unter der Basis (alle auf x ≈ 0.31 zentriert). */
const COMBINING_BELOW: Record<string, Skeleton> = {
  '\u0327': ACCENTS_LOWER.cedilla,
  '\u0328': [[[0.36, 0.82], [0.34, 0.92], [0.26, 0.96], [0.2, 0.93]]],
  '\u0326': [[[0.3, 0.85], [0.28, 0.91], [0.22, 0.94]]],
  '\u0323': [[[0.29, 0.88], [0.32, 0.91]]],
};

/** Marken ohne horizontale Zentrierung (positionsgebunden, z. B. Horn rechts). */
const FIXED_MARKS = new Set(['\u031B']);

/** Buchstaben ohne NFKD-/NFD-Zerlegung (Sonderformen, manuell gebaut). */
const LATIN_SPECIALS: Record<string, Skeleton> = {
  'ß': [[[0.38, 0.02], [0.22, 0.06], [0.15, 0.25], [0.22, 0.45], [0.4, 0.5]], [[0.4, 0.5], [0.5, 0.6], [0.42, 0.78], [0.22, 0.82], [0.12, 0.72]], [[0.12, 0.72], [0.14, 0.9], [0.28, 1.0], [0.4, 0.96]]],
  'ẞ': [[[0.38, 0.02], [0.22, 0.06], [0.15, 0.25], [0.22, 0.45], [0.4, 0.5]], [[0.4, 0.5], [0.5, 0.6], [0.42, 0.78], [0.22, 0.82], [0.12, 0.72]], [[0.12, 0.72], [0.14, 0.9], [0.28, 1.0], [0.4, 0.96]]],
  'ð': [...SKELETONS['d'], [[0.3, 0.3], [0.62, 0.3]]],
  'Ð': [...SKELETONS['D'], [[0.04, 0.42], [0.56, 0.42]]],
  'þ': [[[0.15, 0.0], [0.14, 0.5], [0.15, 0.85]], [[0.15, 0.35], [0.35, 0.3], [0.48, 0.45], [0.35, 0.65], [0.15, 0.62]]],
  'Þ': [[[0.14, 0.0], [0.13, 0.5], [0.14, 0.85]], [[0.14, 0.06], [0.38, 0.06], [0.5, 0.24], [0.34, 0.44], [0.14, 0.44]]],
  'ø': [...SKELETONS['o'], [[0.12, 0.78], [0.5, 0.32]]],
  'Ø': [...SKELETONS['O'], [[0.1, 0.75], [0.55, 0.05]]],
  'đ': [...SKELETONS['d'], [[0.28, 0.35], [0.6, 0.35]]],
  'Đ': [...SKELETONS['D'], [[0.04, 0.4], [0.56, 0.4]]],
  'ħ': [...SKELETONS['h'], [[0.02, 0.45], [0.5, 0.45]]],
  'Ħ': [...SKELETONS['H'], [[0.02, 0.42], [0.56, 0.42]]],
  'ł': [...SKELETONS['l'], [[0.08, 0.55], [0.42, 0.45]]],
  'Ł': [...SKELETONS['L'], [[0.04, 0.45], [0.52, 0.35]]],
  'ı': SKELETONS['i'].slice(0, 1),
  'ĳ': fuse(SKELETONS['i'].slice(0, 1), SKELETONS['j'].slice(0, 1)),
  'Ĳ': fuse(SKELETONS['I'], SKELETONS['J']),
  'ŋ': [...SKELETONS['n'], [[0.46, 0.55], [0.46, 0.85], [0.35, 1.0], [0.25, 0.97]]],
  'Ŋ': [...SKELETONS['N'], [[0.5, 0.8], [0.5, 0.95], [0.4, 1.02], [0.32, 0.98]]],
  'ſ': [SKELETONS['f'][0]],
  'ĸ': SKELETONS['k'],
  'ŉ': SKELETONS['n'],
  'ŀ': [...SKELETONS['l'], [[0.2, 0.5], [0.23, 0.53]]],
  'Ŀ': [...SKELETONS['L'], [[0.24, 0.4], [0.27, 0.43]]],
  'ǝ': [[[0.42, 0.4], [0.25, 0.32], [0.12, 0.45], [0.15, 0.65], [0.32, 0.75], [0.45, 0.68]], [[0.12, 0.55], [0.4, 0.55]]],
  'Ə': [[[0.44, 0.1], [0.24, 0.02], [0.1, 0.2], [0.12, 0.55], [0.32, 0.78], [0.48, 0.68]], [[0.1, 0.42], [0.42, 0.42]]],
  'ƒ': [...SKELETONS['f'], [[0.24, 0.88], [0.3, 1.0]]],
  '¿': [[[0.14, 0.6], [0.3, 0.76], [0.46, 0.64], [0.38, 0.44], [0.3, 0.32], [0.3, 0.22]], [[0.28, 0.06], [0.32, 0.1]]],
  '¡': [[[0.3, 0.24], [0.3, 0.76]], [[0.28, 0.06], [0.32, 0.1]]],
  'ª': [[[0.36, 0.12], [0.24, 0.14], [0.2, 0.24], [0.3, 0.3], [0.38, 0.26], [0.38, 0.16]]],
  'º': [[[0.3, 0.1], [0.22, 0.14], [0.2, 0.24], [0.3, 0.3], [0.4, 0.24], [0.4, 0.14], [0.3, 0.1]]],
};

const UPPER_SHIFT = 0.22;
const STACK_STEP = 0.14;

function shiftSkel(skel: Skeleton, dx: number, dy: number): Skeleton {
  return skel.map((s) => s.map(([x, y]): Pt => [x + dx, y + dy]));
}

/** Akzent-Skelett in die Versalien-Zone heben (maximal bis y = −0.1). */
function upperize(skel: Skeleton): Skeleton {
  let minY = Infinity;
  for (const s of skel) {
    for (const [, y] of s) if (y < minY) minY = y;
  }
  return shiftSkel(skel, 0, -Math.min(UPPER_SHIFT, minY + 0.1));
}

function composeLatinInner(ch: string): Skeleton | null {
  const special = LATIN_SPECIALS[ch];
  if (special) return special;
  const nfd = ch.normalize('NFD');
  if (nfd.length < 2 || nfd === ch) return null;
  const baseCh = nfd[0];
  if (!/\p{L}/u.test(baseCh)) return null;
  const base = SKELETONS[baseCh];
  if (!base) return null;
  const marks: { mark: string; skel: Skeleton; below: boolean }[] = [];
  for (const mc of nfd.slice(1)) {
    if (COMBINING_ABOVE[mc]) marks.push({ mark: mc, skel: COMBINING_ABOVE[mc], below: false });
    else if (COMBINING_BELOW[mc]) marks.push({ mark: mc, skel: COMBINING_BELOW[mc], below: true });
    else return null;
  }
  if (marks.length === 0) return null;

  let bmin = Infinity;
  let bmax = -Infinity;
  let bminY = Infinity;
  for (const s of base) {
    for (const [x, y] of s) {
      if (x < bmin) bmin = x;
      if (x > bmax) bmax = x;
      if (y < bminY) bminY = y;
    }
  }
  const bcx = (bmin + bmax) / 2;
  const tall = bminY < 0.22;
  const out: Skeleton = [...base];
  let ai = 0;
  let bi = 0;
  for (const { mark, skel, below } of marks) {
    let sk = skel;
    if (!FIXED_MARKS.has(mark)) sk = shiftSkel(sk, bcx - 0.31, 0);
    if (below) {
      sk = shiftSkel(sk, 0, STACK_STEP * bi);
      bi++;
    } else {
      if (tall) sk = upperize(sk);
      sk = shiftSkel(sk, 0, -STACK_STEP * ai);
      ai++;
    }
    out.push(...sk);
  }
  return out;
}

const composedCache = new Map<string, Skeleton | null>();

/** Komponiert ein lateinisches Zeichen aus Basis + Akzenten (gecacht, null wenn unmöglich). */
export function composeLatin(ch: string): Skeleton | null {
  const hit = composedCache.get(ch);
  if (hit !== undefined) return hit;
  const res = composeLatinInner(ch);
  composedCache.set(ch, res);
  return res;
}

function materializeRange(from: number, to: number, skip?: Set<number>): string[] {
  const added: string[] = [];
  for (let cp = from; cp <= to; cp++) {
    if (skip?.has(cp)) continue;
    const ch = String.fromCodePoint(cp);
    if (SKELETONS[ch]) continue;
    if (/^\p{C}/u.test(ch)) continue;
    const sk = composeLatinInner(ch);
    if (sk && sk.length > 0) {
      SKELETONS[ch] = sk;
      added.push(ch);
    }
  }
  return added;
}

/** Alle zusätzlich materialisierten lateinischen Buchstaben (für Training/Import). */
export const EXTENDED_LATIN: string[] = [
  ...materializeRange(0xa0, 0xff, new Set([0xd7, 0xf7])),
  ...materializeRange(0x100, 0x17f),
  ...materializeRange(0x180, 0x24f),
  ...materializeRange(0x1e00, 0x1eff),
];
