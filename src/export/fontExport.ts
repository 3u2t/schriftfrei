import * as opentype from 'opentype.js';
import type { HandwritingProfile, InkPoint } from '../engine/types';

const UPM = 1000;
const BODY = 700;
const BASELINE_BOX_Y = 0.8;
const LSB = 50;
const HALF_STROKE = 20;

function normalAt(pts: InkPoint[], i: number): { nx: number; ny: number } {
  const a = pts[Math.max(0, i - 1)];
  const b = pts[Math.min(pts.length - 1, i + 1)];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1e-6;
  return { nx: -dy / len, ny: dx / len };
}

const X = (x: number) => LSB + x * BODY;
const Y = (y: number) => (BASELINE_BOX_Y - y) * BODY;


function strokeToContour(pts: InkPoint[]): { x: number; y: number }[] {
  if (pts.length === 0) return [];
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

    left.push({ x: X(p.x) + nx * half * BODY, y: Y(p.y) + ny * half * BODY });
    right.push({ x: X(p.x) - nx * half * BODY, y: Y(p.y) - ny * half * BODY });
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
  const FX = (x: number) => LSB + x * BODY;
  const FY = (y: number) => (BASELINE_BOX_Y - y) * BODY;
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

export function buildTtf(profile: HandwritingProfile): ArrayBuffer {
  const glyphs: opentype.Glyph[] = [];

  glyphs.push(new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: new opentype.Path() }));

  const chars = Object.keys(profile.glyphs)
    .filter((c) => c.length === 1 && c !== ' ')
    .sort();
  for (const ch of chars) {
    const variants = profile.glyphs[ch];
    if (!variants || variants.length === 0) continue;
    const v = variants[0];
    let path: opentype.Path;
    if (v.filled) {
      path = filledToPath(v.filled);
    } else {
      const contours = v.strokes
        .filter((s) => s.points.length > 0)
        .map((s) => strokeToContour(s.points))
        .filter((c) => c.length >= 3);
      path = combinePaths(contours.map(contourToPath));
    }
    const code = ch.codePointAt(0) ?? 32;
    glyphs.push(
      new opentype.Glyph({
        name: `u${code.toString(16).toUpperCase().padStart(4, '0')}`,
        unicode: code,
        advanceWidth: Math.round(v.widthFactor * BODY + LSB * 2.4),
        path,
      }),
    );
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
  const blob = new Blob([buffer], { type: 'font/otf' });
  const url = URL.createObjectURL(blob);
  const safe = profile.name.trim().toLowerCase().replace(/[^\wäöüÄÖÜß-]+/g, '-').replace(/-+/g, '-').slice(0, 60) || 'handschrift';
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safe}.otf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
