import * as opentype from 'opentype.js';
import type { GlyphVariant, HandwritingProfile, InkPoint } from '../engine/types';
import { demoGlyphFor } from '../engine/demoGenerator';
import { ALL_TRAIN_CHARS } from '../training/charset';
import { safeFilename } from './exporters';

const UPM = 1000;
// Volle EM-Abbildung (Baseline 0.8 → 800, Unterlänge 1.0 → -200), damit
// OTF-Export → Font-Import exakt 1:1 roundtrippt (vorher BODY=700 → 0.7x-Stauchung).
const BASELINE_NORM = 0.8;
const SIDE_PAD = 120;

function normalAt(pts: InkPoint[], i: number): { nx: number; ny: number } {
  const a = pts[Math.max(0, i - 1)];
  const b = pts[Math.min(pts.length - 1, i + 1)];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1e-6;
  return { nx: -dy / len, ny: dx / len };
}

const X = (x: number) => x * UPM;
const Y = (y: number) => (BASELINE_NORM - y) * UPM;


function strokeToContour(pts: InkPoint[]): { x: number; y: number }[] {
  if (pts.length === 0) return [];
  // Strich-Halbbreite in Font-Units (UPM=1000 → ~2 % EM, passend zu DOT_R/Editor).
  const HALF_STROKE = 20;
  if (pts.length === 1) {

    const cx = X(pts[0].x);
    const cy = Y(pts[0].y);
    const r = HALF_STROKE * 1.1;
    return [
      { x: cx - r, y: cy },
      { x: cx, y: cy - r },
      { x: cx + r, y: cy },
      { x: cx, y: cy + r },
    ];
  }
  const left: { x: number; y: number }[] = [];
  const right: { x: number; y: number }[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const { nx, ny } = normalAt(pts, i);
    const pressure = Math.min(1, Math.max(0.08, p.pressure || 0.5));
    const half = HALF_STROKE * (0.55 + pressure * 0.9);

    left.push({ x: X(p.x) + nx * half, y: Y(p.y) + ny * half });
    right.push({ x: X(p.x) - nx * half, y: Y(p.y) - ny * half });
  }
  return [...left, ...right.reverse()];
}

function contourToPath(contour: { x: number; y: number }[]): opentype.Path {
  const path = new opentype.Path();
  if (contour.length === 0) return path;
  path.moveTo(Math.round(contour[0].x), Math.round(contour[0].y));
  for (let i = 1; i < contour.length; i++) {
    path.lineTo(Math.round(contour[i].x), Math.round(contour[i].y));
  }
  path.close();
  return path;
}

function combinePaths(paths: opentype.Path[]): opentype.Path {
  const out = new opentype.Path();
  for (const p of paths) {
    const cmds = p.commands;
    for (const c of cmds) {
      if (c.type === 'M') out.moveTo(c.x as number, c.y as number);
      else if (c.type === 'L') out.lineTo(c.x as number, c.y as number);
      else if (c.type === 'Z') out.close();
    }
  }
  return out;
}


function filledToPath(filled: string): opentype.Path {
  const path = new opentype.Path();
  const tokens = filled.trim().split(/\s+/);
  let i = 0;
  const num = (): number => {
    const v = Number(tokens[i++]);
    return Number.isFinite(v) ? v : 0;
  };
  const FX = (x: number) => x * UPM;
  const FY = (y: number) => (BASELINE_NORM - y) * UPM;
  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === 'M') {
      const x = num();
      const y = num();
      path.moveTo(Math.round(FX(x)), Math.round(FY(y)));
    } else if (cmd === 'L') {
      const x = num();
      const y = num();
      path.lineTo(Math.round(FX(x)), Math.round(FY(y)));
    } else if (cmd === 'Q') {
      const x1 = num();
      const y1 = num();
      const x = num();
      const y = num();
      path.quadraticCurveTo(Math.round(FX(x1)), Math.round(FY(y1)), Math.round(FX(x)), Math.round(FY(y)));
    } else if (cmd === 'C') {
      const x1 = num();
      const y1 = num();
      const x2 = num();
      const y2 = num();
      const x = num();
      const y = num();
      path.bezierCurveTo(
        Math.round(FX(x1)), Math.round(FY(y1)),
        Math.round(FX(x2)), Math.round(FY(y2)),
        Math.round(FX(x)), Math.round(FY(y)),
      );
    } else if (cmd === 'Z') {
      path.close();
    } else {
      break;
    }
  }
  return path;
}

function variantToPath(v: GlyphVariant): opentype.Path | null {
  if (v.filled) return filledToPath(v.filled);
  const contours = v.strokes
    .filter((s) => s.points.length > 0)
    .map((s) => strokeToContour(s.points))
    .filter((c) => c.length >= 3);
  if (contours.length === 0) return null;
  return combinePaths(contours.map(contourToPath));
}

export function buildTtf(profile: HandwritingProfile): ArrayBuffer {
  const glyphs: opentype.Glyph[] = [];

  glyphs.push(new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: new opentype.Path() }));

  const seen = new Set<string>();
  const pushChar = (ch: string, v: GlyphVariant) => {
    if (seen.has(ch)) return;
    seen.add(ch);
    const path = variantToPath(v);
    if (!path) return;
    const code = ch.codePointAt(0) ?? 32;
    glyphs.push(
      new opentype.Glyph({
        name: `u${code.toString(16).toUpperCase().padStart(4, '0')}`,
        unicode: code,
        advanceWidth: Math.round(v.widthFactor * UPM + SIDE_PAD),
        path,
      }),
    );
  };
  // Wie im Editor: Fehlendes im Demo-Stil ergänzen, damit die Schrift
  // überall gleich vollständig ist (keine .notdef-Kästchen in Word & Co.).
  for (const ch of ALL_TRAIN_CHARS) {
    if (ch === ' ') continue;
    const list = profile.glyphs[ch];
    pushChar(ch, list && list.length > 0 ? list[0] : demoGlyphFor(ch, 99));
  }
  const extra = Object.keys(profile.glyphs).sort();
  for (const ch of extra) {
    if (ch.length !== 1 || ch === ' ') continue;
    const list = profile.glyphs[ch];
    if (list && list.length > 0) pushChar(ch, list[0]);
  }

  glyphs.push(new opentype.Glyph({ name: 'space', unicode: 32, advanceWidth: 300, path: new opentype.Path() }));

  const font = new opentype.Font({
    familyName: profile.name.slice(0, 60) || 'Schriftfrei',
    styleName: 'Regular',
    unitsPerEm: UPM,
    ascender: 800,
    descender: -200,
    glyphs,
  });
  return font.toArrayBuffer();
}


export function downloadTtf(profile: HandwritingProfile): void {
  const buffer = buildTtf(profile);
  // Inhalt ist TrueType-flavoured OpenType (glyf-Tabelle) → korrekterweise .ttf.
  const blob = new Blob([buffer], { type: 'font/ttf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeFilename(profile.name)}.ttf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
