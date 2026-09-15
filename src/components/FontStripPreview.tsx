import { useMemo } from 'react';
import type { DocSettings, HandwritingProfile } from '../engine/types';
import { DEFAULT_SETTINGS } from '../engine/types';
import { layoutPages } from '../engine/layout';
import { makeInkCtx, renderLineInk } from '../engine/render';
import { cn } from '../utils/cn';

interface Props {
  text: string;
  profile: HandwritingProfile;
  settings?: DocSettings;
  maxLines?: number;
  className?: string;
}


export default function FontStripPreview({ text, profile, settings, maxLines = 2, className }: Props) {
  const svg = useMemo(() => {
    const st = settings ?? DEFAULT_SETTINGS;
    const pages = layoutPages(text || ' ', profile, st);
    const lines = (pages[0]?.lines ?? []).slice(0, maxLines);
    const ctx = makeInkCtx(profile, st);
    const parts: string[] = [];
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const line of lines) {
      if (line.rule) {
        const y = line.baselineY + line.lineH / 2;
        minX = Math.min(minX, 0);
        maxX = Math.max(maxX, 400);
        minY = Math.min(minY, y - 4);
        maxY = Math.max(maxY, y + 4);
        parts.push(`<line x1="0" y1="${y.toFixed(1)}" x2="400" y2="${y.toFixed(1)}" stroke="${ctx.ink}" stroke-width="${(ctx.baseW * 0.9).toFixed(2)}" stroke-linecap="round"/>`);
        continue;
      }
      parts.push(...renderLineInk(line, ctx));
      for (const g of line.glyphs) {
        minX = Math.min(minX, g.x);
        maxX = Math.max(maxX, g.x + g.widthPx);
        minY = Math.min(minY, g.y);
        maxY = Math.max(maxY, g.y + g.boxH);
      }
    }
    if (!Number.isFinite(minX)) return '';
    const pad = 14;
    minX -= pad;
    minY -= pad;
    maxX += pad;
    maxY += pad;
    const w = Math.max(1, maxX - minX);
    const h = Math.max(1, maxY - minY);
    const bg = st.paperTint || '#ffffff';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX.toFixed(1)} ${minY.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}" role="img" aria-label="Schriftvorschau"><rect x="${minX.toFixed(1)}" y="${minY.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${bg}"/><g opacity="${ctx.opacity}">${parts.join('')}</g></svg>`;
  }, [text, profile, settings, maxLines]);

  if (!svg) return null;
  return (
    <div
      className={cn('overflow-hidden [&>svg]:block [&>svg]:h-auto [&>svg]:w-full', className)}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
