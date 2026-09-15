import type { GlyphVariant, InkPoint, InkStroke } from './types';


export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}


const DOT_MAX_SPAN = 0.05;

const DOT_MAX_LEN = 0.1;

const DOT_R = 0.028;

function strokeStats(s: InkStroke): { w: number; h: number; cx: number; cy: number; len: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let len = 0;
  const pts = s.points;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
    if (i > 0) len += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y);
  }
  if (pts.length === 0) return { w: 0, h: 0, cx: 0, cy: 0, len: 0 };
  return { w: maxX - minX, h: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, len };
}


export function isDotStroke(s: InkStroke): boolean {
  if (s.points.length === 0) return false;
  const st = strokeStats(s);
  return Math.max(st.w, st.h) < DOT_MAX_SPAN && st.len < DOT_MAX_LEN;
}


export function perfectDotStroke(
  cx: number,
  cy: number,
  r: number,
  tool: InkStroke['tool'] = 'pen',
  pressure = 0.75,
): InkStroke {
  const points: InkPoint[] = [];
  const N = 8;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    points.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, t: i * 8, pressure, tiltX: 0, tiltY: 0 });
  }
  return { points, tool };
}


const LINE_MIN_LEN = 0.08;

const LINE_MAX_DEV = 0.08;


function maxChordDeviation(pts: InkPoint[]): { chord: number; dev: number } {
  const a = pts[0];
  const b = pts[pts.length - 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const chord = Math.hypot(dx, dy);
  if (chord < 1e-9) return { chord: 0, dev: Infinity };
  let dev = 0;
  for (const p of pts) {
    const d = Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / chord;
    if (d > dev) dev = d;
  }
  return { chord, dev };
}


export function isLineStroke(s: InkStroke): boolean {
  if (s.points.length < 3) return false;
  const { chord, dev } = maxChordDeviation(s.points);
  return chord >= LINE_MIN_LEN && dev / chord < LINE_MAX_DEV;
}


export function straightenStroke(s: InkStroke): InkStroke {
  const pts = s.points;
  const a = pts[0];
  const b = pts[pts.length - 1];
  const chord = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(2, Math.round(chord / 0.02) + 1);
  const pressure = pts.reduce((sum, p) => sum + (p.pressure || 0.5), 0) / pts.length;
  const points: InkPoint[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    points.push({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      t: a.t + (b.t - a.t) * t,
      pressure,
      tiltX: a.tiltX,
      tiltY: a.tiltY,
    });
  }
  return { points, tool: s.tool };
}


export function resampleStroke(stroke: InkStroke, spacing = 0.012): InkStroke {
  const pts = stroke.points;
  if (pts.length < 2) return stroke;
  const out: InkPoint[] = [pts[0]];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    acc += d;
    if (acc >= spacing) {
      out.push(b);
      acc = 0;
    }
  }
  if (out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
  return { ...stroke, points: out };
}


export function strokesToGlyphVariant(raw: InkStroke[]): GlyphVariant | null {
  const strokes = raw
    .map((s) => ({ ...s, points: s.points.map((p) => ({ ...p })) }))
    .filter((s) => s.points.length >= 2);
  if (strokes.length === 0) return null;


  for (let i = 0; i < strokes.length; i++) {
    if (isDotStroke(strokes[i])) {
      const st = strokeStats(strokes[i]);
      strokes[i] = perfectDotStroke(st.cx, st.cy, DOT_R, strokes[i].tool);
    } else if (isLineStroke(strokes[i])) {
      strokes[i] = straightenStroke(strokes[i]);
    }
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const s of strokes) {
    for (const p of s.points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  const w = Math.max(1e-6, maxX - minX);
  const h = Math.max(1e-6, maxY - minY);


  if (w < 0.09 && h < 0.09) {
    const dotW = 0.2;
    const dot = perfectDotStroke(dotW / 2, 0.72, 0.075, strokes[0].tool);
    return { strokes: [dot], widthFactor: dotW, baselineOffset: 0 };
  }

  const widthFactor = clamp(w / h, 0.25, 1.6);
  for (const s of strokes) {
    for (const p of s.points) {
      p.x = (p.x - minX) / h;
      p.y = (p.y - minY) / h;
    }
  }

  let nMinX = Infinity;
  let nMaxX = -Infinity;
  for (const s of strokes) {
    for (const p of s.points) {
      if (p.x < nMinX) nMinX = p.x;
      if (p.x > nMaxX) nMaxX = p.x;
    }
  }
  const shift = (widthFactor - (nMaxX - nMinX)) / 2 - nMinX;
  for (const s of strokes) {
    for (const p of s.points) p.x += shift;
  }
  const resampled = strokes.map((s) => resampleStroke(s));
  return { strokes: resampled, widthFactor, baselineOffset: 0, rawHeight: h };
}


export function isEmptyInk(strokes: InkStroke[]): boolean {
  return strokes.every((s) => s.points.length < 2);
}


export function countStrokes(strokes: InkStroke[]): number {
  return strokes.filter((s) => s.points.length >= 2).length;
}


export function strokeToPath(
  pts: InkPoint[],
  px: (x: number) => number,
  py: (y: number) => number,
): string {
  if (pts.length === 0) return '';
  if (pts.length === 2) {
    return `M ${px(pts[0].x).toFixed(2)} ${py(pts[0].y).toFixed(2)} L ${px(pts[1].x).toFixed(2)} ${py(pts[1].y).toFixed(2)}`;
  }
  let d = `M ${px(pts[0].x).toFixed(2)} ${py(pts[0].y).toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${px(c1x).toFixed(2)} ${py(c1y).toFixed(2)}, ${px(c2x).toFixed(2)} ${py(c2y).toFixed(2)}, ${px(p2.x).toFixed(2)} ${py(p2.y).toFixed(2)}`;
  }
  return d;
}


export function widthAtPoint(
  pts: InkPoint[],
  i: number,
  baseWidth: number,
): number {
  const p = pts[i];
  const pressure = clamp(p.pressure || 0.5, 0.08, 1);
  let speed = 0.5;
  if (i > 0) {
    const q = pts[i - 1];
    const dt = Math.max(1, p.t - q.t);
    const dist = Math.hypot(p.x - q.x, p.y - q.y);
    speed = clamp(dist / (dt / 16.7) / 0.05, 0, 1);
  }

  const w = baseWidth * (0.55 + pressure * 0.9) * (1 - speed * 0.28);
  return clamp(w, baseWidth * 0.35, baseWidth * 1.7);
}
