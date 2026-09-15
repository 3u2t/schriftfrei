import type { HandMetrics, InkStroke } from './types';
import { defaultMetrics } from './types';
import { clamp } from './normalize';


export function calibrateFromSentences(samples: InkStroke[][]): HandMetrics {
  const base = defaultMetrics();
  const flat = samples.flat();
  if (flat.length < 3) return base;


  let slantSum = 0;
  let slantN = 0;
  for (const s of flat) {
    const pts = s.points;
    if (pts.length < 4) continue;
    const dx = pts[pts.length - 1].x - pts[0].x;
    const dy = pts[pts.length - 1].y - pts[0].y;
    if (dy > 0.03 && Math.abs(dy) > Math.abs(dx) * 1.2) {
      slantSum += (Math.atan2(dx, dy) * 180) / Math.PI;
      slantN++;
    }
  }
  const slant = slantN > 0 ? clamp(slantSum / slantN, -15, 25) : base.slant;


  const boxes = flat
    .map((s) => {
      const xs = s.points.map((p) => p.x);
      return { min: Math.min(...xs), max: Math.max(...xs) };
    })
    .sort((a, b) => a.min - b.min);
  const gaps: number[] = [];
  for (let i = 1; i < boxes.length; i++) {
    const g = boxes[i].min - boxes[i - 1].max;
    if (g > -0.02 && g < 0.3) gaps.push(g);
  }
  gaps.sort((a, b) => a - b);
  let letterGap = base.letterGap;
  let wordGap = base.wordGap;
  if (gaps.length >= 5) {
    const median = gaps[Math.floor(gaps.length / 2)];
    letterGap = clamp(median * 2.2, 0.02, 0.35);
    const big = gaps.filter((g) => g > median * 2.2);
    if (big.length > 0) {
      const wMedian = big[Math.floor(big.length / 2)];
      wordGap = clamp(wMedian / Math.max(0.02, median) / 2.4, 0.6, 1.8);
    }
  }


  const bottoms = flat.map((s) => Math.max(...s.points.map((p) => p.y)));
  const mean = bottoms.reduce((a, b) => a + b, 0) / bottoms.length;
  const variance =
    bottoms.reduce((a, b) => a + (b - mean) * (b - mean), 0) / bottoms.length;
  const baselineWobble = clamp(Math.sqrt(variance) * 9, 0.05, 1);
  const sizeVariance = clamp(Math.sqrt(variance) * 7 + 0.12, 0.05, 1);

  return { ...base, slant, letterGap, wordGap, baselineWobble, sizeVariance };
}
