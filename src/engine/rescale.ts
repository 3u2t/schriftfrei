import type { CharMap, GlyphVariant } from './types';
import { clamp } from './normalize';


export function scaleVariant(v: GlyphVariant, f: number, anchorY = 0.5): GlyphVariant {
  const cx = v.widthFactor / 2;
  return {
    strokes: v.strokes.map((s) => ({
      ...s,
      points: s.points.map((p) => ({
        ...p,
        x: cx + (p.x - cx) * f,
        y: anchorY + (p.y - anchorY) * f,
      })),
    })),
    widthFactor: clamp(v.widthFactor * f, 0.15, 1.8),
    baselineOffset: clamp(v.baselineOffset * f, -0.5, 0.5),
  };
}


export function scaleCharMap(glyphs: CharMap, f: number): CharMap {
  const out: CharMap = {};
  for (const [ch, list] of Object.entries(glyphs)) {
    out[ch] = list.map((v) => scaleVariant(v, f));
  }
  return out;
}


const XHEIGHT_CHARS = new Set('acemnorsuvwxz'.split(''));


const FIXED_CHARS = new Set(['.', ',', '!', '?', ':', ';', '-', '_', '(', ')', '/', '+', '=', '€', '%', '&', "'", '"', '…', '·', '–', '—']);


export function normalizeProportions(glyphs: CharMap): { glyphs: CharMap; matched: number } {
  const refs: number[] = [];
  for (const [ch, list] of Object.entries(glyphs)) {
    if (!XHEIGHT_CHARS.has(ch)) continue;
    for (const v of list) {
      if (v.rawHeight && v.rawHeight > 0.05) refs.push(v.rawHeight);
    }
  }
  if (refs.length < 3) return { glyphs, matched: 0 };
  refs.sort((a, b) => a - b);
  const ref = refs[Math.floor(refs.length / 2)];
  const out: CharMap = {};
  let matched = 0;
  for (const [ch, list] of Object.entries(glyphs)) {
    if (FIXED_CHARS.has(ch)) {
      out[ch] = list;
      continue;
    }
    out[ch] = list.map((v) => {
      if (!v.rawHeight || v.rawHeight <= 0.05) return v;
      const f = clamp(ref / v.rawHeight, 0.5, 1.5);
      if (Math.abs(f - 1) < 0.03) return v;
      matched++;

      return scaleVariant(v, f, 1.0);
    });
  }
  return { glyphs: out, matched };
}
