import type { DocSettings, HandwritingProfile, InkPoint } from './types';
import { PEN_TYPES, getPageDims } from './types';
import type { InkLine, LaidPage, LaidTable, PlacedGlyph } from './layout';
import type { CheckMark } from './layout';
import { strokeToPath, widthAtPoint, clamp } from './normalize';

export interface RenderOptions {

  withPaper: boolean;
  customPaperDataUrl?: string;
  inkColor: string;

  showBaselines?: boolean;
}


export interface InkCtx {
  baseW: number;
  totalSlant: number;
  ink: string;
  opacity: number;
}

/** Transformiert einen normierten Filled-Pfad (Höhe 1, Baseline 0.8) in absolute SVG-Koordinaten. */
function transformFilledD(filled: string, g: PlacedGlyph, slantDeg: number): string | null {
  const tokens = filled.trim().split(/\s+/);
  if (tokens.length === 0) return null;
  const shear = Math.tan(((slantDeg % 45) * Math.PI) / 180);
  const rad = (g.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const boxH = g.boxH;
  const half = boxH * 0.5;
  const tx = (nx: number, ny: number): [number, number] => {
    let lx = nx * boxH;
    const ly = ny * boxH;
    lx += -shear * (ny - 0.8) * boxH;
    const rx = lx;
    const ry = ly - half;
    return [g.x + rx * cos - ry * sin, g.y + half + rx * sin + ry * cos];
  };
  const out: string[] = [];
  let i = 0;
  const num = (): number => {
    const v = Number(tokens[i++]);
    return Number.isFinite(v) ? v : 0;
  };
  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === 'M' || cmd === 'L') {
      const x = num();
      const y = num();
      const [ax, ay] = tx(x, y);
      out.push(`${cmd} ${ax.toFixed(2)} ${ay.toFixed(2)}`);
    } else if (cmd === 'Q') {
      const x1 = num();
      const y1 = num();
      const x = num();
      const y = num();
      const [ax1, ay1] = tx(x1, y1);
      const [ax, ay] = tx(x, y);
      out.push(`Q ${ax1.toFixed(2)} ${ay1.toFixed(2)} ${ax.toFixed(2)} ${ay.toFixed(2)}`);
    } else if (cmd === 'C') {
      const x1 = num();
      const y1 = num();
      const x2 = num();
      const y2 = num();
      const x = num();
      const y = num();
      const [ax1, ay1] = tx(x1, y1);
      const [ax2, ay2] = tx(x2, y2);
      const [ax, ay] = tx(x, y);
      out.push(`C ${ax1.toFixed(2)} ${ay1.toFixed(2)} ${ax2.toFixed(2)} ${ay2.toFixed(2)} ${ax.toFixed(2)} ${ay.toFixed(2)}`);
    } else if (cmd === 'Z') {
      out.push('Z');
    } else {
      return null;
    }
  }
  return out.length > 0 ? out.join(' ') : null;
}

export function makeInkCtx(profile: HandwritingProfile, settings: DocSettings, inkOverride?: string): InkCtx {
  const pen = PEN_TYPES[settings.penType] ?? PEN_TYPES.ballpoint;
  return {
    baseW: Math.max(0.6, settings.fontSize * 0.055 * settings.strokeWidth) * pen.widthMul,
    totalSlant: profile.metrics.slant + settings.slant,
    ink: inkOverride ?? settings.inkColor ?? '#1c2742',
    opacity: pen.opacity,
  };
}


export function glyphStrokesToPaths(g: PlacedGlyph, ctx: InkCtx): string[] {
  const out: string[] = [];
  const slant = ctx.totalSlant + (g.italic ? 12 : 0);
  const wMul = g.bold ? 1.55 : 1;
  if (g.variant.filled) {
    const d = transformFilledD(g.variant.filled, g, slant);
    if (d) {
      const boldStroke = g.bold ? ` stroke="${ctx.ink}" stroke-width="${(ctx.baseW * 0.5).toFixed(2)}"` : '';
      out.push(`<path d="${d}" fill="${ctx.ink}"${boldStroke}/>`);
    }
    return out;
  }
  g.variant.strokes.forEach((stroke) => {
    if (stroke.points.length < 2) return;
    const proj = projectPoints(stroke.points, g.x, g.y, g.boxH, g.rotation, slant);

    const CHUNK = 6;
    for (let c = 0; c < proj.length - 1; c += CHUNK) {
      const slice = stroke.points.slice(c, c + CHUNK + 1);
      const sliceProj = proj.slice(c, c + CHUNK + 1);
      if (sliceProj.length < 2) continue;
      let wSum = 0;
      for (let k = 0; k < slice.length; k++) wSum += widthAtPoint(stroke.points, Math.min(stroke.points.length - 1, c + k), ctx.baseW);
      const w = (wSum / slice.length) * wMul;
      const mini = slice.map((p, k2) => ({ ...p, x: sliceProj[k2].x / g.boxH, y: sliceProj[k2].y / g.boxH }));
      const d = strokeToPath(
        mini,
        (x) => x * g.boxH,
        (y) => y * g.boxH,
      );
      out.push(`<path d="${d}" fill="none" stroke="${ctx.ink}" stroke-width="${w.toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/>`);
    }
  });
  return out;
}


export function connectorPathD(prevExit: { x: number; y: number }, g: PlacedGlyph, ctx: InkCtx): string {
  const entryX = g.x + g.boxH * 0.04;
  const entryY = g.y + g.boxH * 0.62;
  const mx = (prevExit.x + entryX) / 2;
  return `<path d="M ${prevExit.x.toFixed(1)} ${prevExit.y.toFixed(1)} Q ${mx.toFixed(1)} ${((prevExit.y + entryY) / 2 + g.boxH * 0.05).toFixed(1)} ${entryX.toFixed(1)} ${entryY.toFixed(1)}" fill="none" stroke="${ctx.ink}" stroke-width="${(ctx.baseW * 0.85).toFixed(2)}" stroke-linecap="round"/>`;
}


export function decorationPathD(x0: number, y: number, x1: number, ctx: InkCtx): string {
  return `<line x1="${x0.toFixed(1)}" y1="${y.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${ctx.ink}" stroke-width="${(ctx.baseW * 0.85).toFixed(2)}" stroke-linecap="round"/>`;
}

/** Checkbox für Checklisten (- [ ] / - [x]): Kasten + optionaler Haken. */
export function checkBoxSvg(c: CheckMark, ctx: InkCtx): string {
  const s = c.size;
  const w = Math.max(1, ctx.baseW * 0.9).toFixed(2);
  let out = `<rect x="${c.x.toFixed(1)}" y="${c.y.toFixed(1)}" width="${s.toFixed(1)}" height="${s.toFixed(1)}" fill="none" stroke="${ctx.ink}" stroke-width="${w}"/>`;
  if (c.done) {
    out += `<path d="M ${(c.x + s * 0.14).toFixed(1)} ${(c.y + s * 0.55).toFixed(1)} L ${(c.x + s * 0.42).toFixed(1)} ${(c.y + s * 0.78).toFixed(1)} L ${(c.x + s * 0.86).toFixed(1)} ${(c.y + s * 0.24).toFixed(1)}" fill="none" stroke="${ctx.ink}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  return out;
}


export function renderLineInk(line: InkLine, ctx: InkCtx): string[] {
  const out: string[] = [];
  let prevExit: { x: number; y: number } | null = null;
  line.glyphs.forEach((g) => {
    if (g.connectorFromPrev && prevExit) out.push(connectorPathD(prevExit, g, ctx));
    out.push(...glyphStrokesToPaths(g, ctx));
    prevExit = { x: g.x + g.widthPx * 0.96, y: g.y + g.boxH * 0.62 };
  });
  for (const deco of line.decorations) {
    const y = deco.kind === 'underline' ? deco.y + deco.boxH * 0.88 : deco.y + deco.boxH * 0.48;
    out.push(decorationPathD(deco.x0, y, deco.x1, ctx));
  }
  return out;
}

function paperBackground(
  settings: DocSettings,
  pageW: number,
  pageH: number,
  margin: number,
  customPaperDataUrl?: string,
): string {
  if (settings.paper === 'custom' && customPaperDataUrl) {
    return `<image href="${customPaperDataUrl}" x="0" y="0" width="${pageW}" height="${pageH}" preserveAspectRatio="xMidYMid slice"/>`;
  }
  let inner = '';


  const wScale = pageW / 800;
  if (settings.paper === 'lined' || settings.paper === 'college') {
    const step = (settings.paper === 'college' ? 30 : 34) * wScale;
    const rows: string[] = [];
    for (let y = margin; y < pageH - margin / 2; y += step) {
      rows.push(`<line x1="${margin}" y1="${y}" x2="${pageW - margin}" y2="${y}" stroke="#93c5fd" stroke-opacity="0.55" stroke-width="1"/>`);
    }
    inner += rows.join('');
    if (settings.paper === 'college') {
      inner += `<line x1="${margin + 40 * wScale}" y1="0" x2="${margin + 40 * wScale}" y2="${pageH}" stroke="#f87171" stroke-opacity="0.6" stroke-width="1.5"/>`;
    }
  } else if (settings.paper === 'grid') {
    const step = 26;
    const rows: string[] = [];
    for (let y = 0; y <= pageH; y += step) {
      rows.push(`<line x1="0" y1="${y}" x2="${pageW}" y2="${y}" stroke="#93c5fd" stroke-opacity="0.35" stroke-width="1"/>`);
    }
    for (let x = 0; x <= pageW; x += step) {
      rows.push(`<line x1="${x}" y1="0" x2="${x}" y2="${pageH}" stroke="#93c5fd" stroke-opacity="0.35" stroke-width="1"/>`);
    }
    inner += rows.join('');
  } else if (settings.paper === 'dotted') {
    const step = 24;
    const dots: string[] = [];
    for (let y = margin / 2; y < pageH; y += step) {
      for (let x = margin / 2; x < pageW; x += step) {
        dots.push(`<circle cx="${x}" cy="${y}" r="1.2" fill="#94a3b8" fill-opacity="0.6"/>`);
      }
    }
    inner += dots.join('');
  }
  return inner;
}


function projectPoints(
  pts: InkPoint[],
  gx: number,
  gy: number,
  boxH: number,
  rotationDeg: number,
  slantDeg: number,
): { x: number; y: number }[] {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const shear = Math.tan(((slantDeg % 45) * Math.PI) / 180);
  const cx = gx;
  const cy = gy + boxH * 0.5;
  return pts.map((p) => {

    let lx = p.x * boxH;
    const ly = p.y * boxH;

    const yRel = p.y - 0.8;
    lx += -shear * yRel * boxH;

    const rx = lx + gx - cx;
    const ry = ly + gy - cy;
    return {
      x: cx + rx * cos - ry * sin,
      y: cy + rx * sin + ry * cos,
    };
  });
}


export function renderTableGrid(t: LaidTable, ctx: InkCtx): string {
  const w = (ctx.baseW * 0.9).toFixed(2);
  const wHead = (ctx.baseW * 1.4).toFixed(2);
  const out: string[] = [];
  const v = (x: number) =>
    `<line x1="${x.toFixed(1)}" y1="${t.y.toFixed(1)}" x2="${x.toFixed(1)}" y2="${(t.y + t.h).toFixed(1)}" stroke="${ctx.ink}" stroke-width="${w}" stroke-linecap="square"/>`;
  const h = (y: number, bold: boolean) =>
    `<line x1="${t.x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(t.x + t.w).toFixed(1)}" y2="${y.toFixed(1)}" stroke="${ctx.ink}" stroke-width="${bold ? wHead : w}" stroke-linecap="square"/>`;
  for (const x of t.colBounds) out.push(v(x));
  t.rowBounds.forEach((y, i) => {
    const isOuter = i === 0 || i === t.rowBounds.length - 1;
    const isHeadSep = t.headerRows > 0 && i === t.headerRows;
    out.push(h(y, isOuter || isHeadSep));
  });
  return out.join('');
}


export function renderPageToSvg(
  page: LaidPage,
  profile: HandwritingProfile,
  settings: DocSettings,
  pageIndex: number,
  totalPages: number,
  opts: RenderOptions,
): string {
  void pageIndex;
  void totalPages;
  const { w: pageW, h: pageH } = getPageDims(settings.pageFormat);
  const margin = clamp(settings.margin ?? 72, 16, 220);
  const ctx = makeInkCtx(profile, settings, opts.inkColor);
  const parts: string[] = [];

  if (opts.withPaper) {
    parts.push(`<rect x="0" y="0" width="${pageW}" height="${pageH}" fill="${settings.paperTint || '#ffffff'}"/>`);
    parts.push(paperBackground(settings, pageW, pageH, margin, opts.customPaperDataUrl));
  }

  if (opts.showBaselines) {
    for (const line of page.lines) {
      if (line.rule) continue;
      const y = line.baselineY + line.lineH * 0.72;
      parts.push(`<line x1="${margin}" y1="${y.toFixed(1)}" x2="${pageW - margin}" y2="${y.toFixed(1)}" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="5 5"/>`);
    }
  }

  const inkParts: string[] = [];

  page.lines.forEach((line) => {
    if (line.rule) {
      const y = line.baselineY + line.lineH / 2;
      inkParts.push(`<line x1="${margin}" y1="${y.toFixed(1)}" x2="${pageW - margin}" y2="${y.toFixed(1)}" stroke="${ctx.ink}" stroke-width="${(ctx.baseW * 0.9).toFixed(2)}" stroke-linecap="round"/>`);
      return;
    }
    if (line.table) {
      inkParts.push(renderTableGrid(line.table, ctx));
      for (const row of line.table.cells) {
        for (const cell of row) {
          for (const cellLine of cell.lines) {
            inkParts.push(...renderLineInk(cellLine, ctx));
          }
        }
      }
      return;
    }
    inkParts.push(...renderLineInk(line, ctx));
    if (line.check) inkParts.push(checkBoxSvg(line.check, ctx));
  });

  parts.push(`<g opacity="${ctx.opacity}">${inkParts.join('')}</g>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pageW} ${pageH}" width="${pageW}" height="${pageH}" role="img" aria-label="Handschrift-Seite">${parts.join('')}</svg>`;
}
