import type { CharMap, GlyphVariant, HandwritingProfile, HandMetrics, InkStroke } from '../engine/types';
import { defaultMetrics, uid } from '../engine/types';

export const PROFILE_EXPORT_VERSION = 1;
const FILE_SUFFIX = '.schriftfrei.json';

interface ProfileExportFile {
  app: 'schriftfrei';
  kind: 'handwriting-profile';
  version: number;
  exportedAt: number;
  profile: HandwritingProfile;
}

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function sanitizeStroke(s: unknown): InkStroke | null {
  if (typeof s !== 'object' || s === null) return null;
  const o = s as Record<string, unknown>;
  if (!Array.isArray(o.points) || o.points.length === 0) return null;
  const points = [];
  for (const p of o.points) {
    if (typeof p !== 'object' || p === null) return null;
    const q = p as Record<string, unknown>;
    if (!isFiniteNum(q.x) || !isFiniteNum(q.y)) return null;
    points.push({
      x: q.x,
      y: q.y,
      t: isFiniteNum(q.t) ? q.t : 0,
      pressure: isFiniteNum(q.pressure) ? Math.min(1, Math.max(0, q.pressure)) : 0.5,
      tiltX: isFiniteNum(q.tiltX) ? q.tiltX : 0,
      tiltY: isFiniteNum(q.tiltY) ? q.tiltY : 0,
    });
  }
  const tool = o.tool === 'pen' || o.tool === 'mouse' || o.tool === 'touch' ? o.tool : 'unknown';
  return { points, tool };
}

function sanitizeVariant(v: unknown): GlyphVariant | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.strokes)) return null;
  const strokes = [];
  for (const s of o.strokes) {
    const clean = sanitizeStroke(s);
    if (clean && clean.points.length >= 1) strokes.push(clean);
  }
  if (strokes.length === 0) return null;
  return {
    strokes,
    widthFactor: isFiniteNum(o.widthFactor) ? Math.min(2, Math.max(0.1, o.widthFactor)) : 0.5,
    baselineOffset: isFiniteNum(o.baselineOffset) ? Math.min(0.5, Math.max(-0.5, o.baselineOffset)) : 0,
  };
}

function sanitizeMetrics(m: unknown): HandMetrics {
  const base = defaultMetrics();
  if (typeof m !== 'object' || m === null) return base;
  const o = m as Record<string, unknown>;
  const pick = (key: keyof HandMetrics, min: number, max: number): number => {
    const v = o[key];
    return isFiniteNum(v) ? Math.min(max, Math.max(min, v)) : base[key];
  };
  return {
    xHeight: pick('xHeight', 0.3, 0.9),
    slant: pick('slant', -20, 30),
    letterGap: pick('letterGap', 0, 0.6),
    wordGap: pick('wordGap', 0.3, 2.5),
    baselineWobble: pick('baselineWobble', 0, 1),
    sizeVariance: pick('sizeVariance', 0, 1),
  };
}


export function parseProfileFile(text: string): HandwritingProfile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Diese Datei ist kein gültiges Handschriftprofil (kein JSON).');
  }
  if (typeof raw !== 'object' || raw === null) throw new Error('Ungültiges Dateiformat.');
  const file = raw as Record<string, unknown>;
  if (file.app !== 'schriftfrei' || file.kind !== 'handwriting-profile' || typeof file.profile !== 'object' || file.profile === null) {
    throw new Error('Diese Datei enthält kein Schriftfrei-Handschriftprofil.');
  }
  if (isFiniteNum(file.version) && file.version > PROFILE_EXPORT_VERSION) {
    throw new Error('Dieses Profil wurde mit einer neueren App-Version erstellt. Bitte aktualisiere die App.');
  }
  const p = file.profile as Record<string, unknown>;
  const glyphs: CharMap = {};
  if (typeof p.glyphs === 'object' && p.glyphs !== null) {
    for (const [ch, list] of Object.entries(p.glyphs as Record<string, unknown>)) {
      if (ch.length === 0 || !Array.isArray(list)) continue;
      const variants = [];
      for (const v of list.slice(0, 5)) {
        const clean = sanitizeVariant(v);
        if (clean) variants.push(clean);
      }
      if (variants.length > 0) glyphs[ch] = variants;
    }
  }
  if (Object.keys(glyphs).length === 0) {
    throw new Error('Das Profil enthält keine gültigen Schriftzeichen.');
  }
  const sentencesDone = Array.isArray(p.sentencesDone) ? (p.sentencesDone as unknown[]).filter((s): s is string => typeof s === 'string') : [];
  const sentenceSamples: InkStroke[][] = [];
  if (Array.isArray(p.sentenceSamples)) {
    for (const sample of (p.sentenceSamples as unknown[]).slice(0, 50)) {
      if (!Array.isArray(sample)) continue;
      const strokes = [];
      for (const s of sample) {
        const clean = sanitizeStroke(s);
        if (clean) strokes.push(clean);
      }
      if (strokes.length > 0) sentenceSamples.push(strokes);
    }
  }
  const vpc = p.variantsPerChar === 1 || p.variantsPerChar === 3 || p.variantsPerChar === 5 ? p.variantsPerChar : 2;
  const now = Date.now();
  return {
    id: typeof p.id === 'string' && p.id.length > 0 ? p.id : uid('profile'),
    name: typeof p.name === 'string' && p.name.trim().length > 0 ? p.name.slice(0, 80) : 'Importierte Handschrift',
    createdAt: isFiniteNum(p.createdAt) ? p.createdAt : now,
    updatedAt: now,
    isDemo: false,
    isTemplate: p.isTemplate === true,
    glyphs,
    metrics: sanitizeMetrics(p.metrics),
    coverage: isFiniteNum(p.coverage) ? Math.min(100, Math.max(0, Math.round(p.coverage))) : 0,
    variantsPerChar: vpc,
    sentenceSamples,
    sentencesDone,
  };
}


export function serializeProfile(profile: HandwritingProfile): string {
  const file: ProfileExportFile = {
    app: 'schriftfrei',
    kind: 'handwriting-profile',
    version: PROFILE_EXPORT_VERSION,
    exportedAt: Date.now(),
    profile: { ...profile, updatedAt: Date.now() },
  };
  return JSON.stringify(file);
}

function safeFilename(name: string): string {
  const safe = name.trim().toLowerCase().replace(/[^\wäöüÄÖÜß-]+/g, '-').replace(/-+/g, '-').slice(0, 60) || 'handschrift';
  return `${safe}${FILE_SUFFIX}`;
}


export function downloadProfile(profile: HandwritingProfile): void {
  const blob = new Blob([serializeProfile(profile)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeFilename(profile.name);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
