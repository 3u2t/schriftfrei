import type { DocSettings, GlyphVariant, HandwritingProfile } from './types';
import { getPageDims } from './types';
import { stableRandom } from './random';
import { clamp } from './normalize';
import { demoGlyphFor } from './demoGenerator';
import { parseMarkdown, type ColumnAlign, type TextSeg } from './markdown';

export const PAGE_W = 800;
export const PAGE_H = 1131;
export const MARGIN = 72;

export interface PlacedGlyph {
  ch: string;
  variant: GlyphVariant;

  x: number;

  y: number;
  boxH: number;
  rotation: number;
  widthPx: number;

  gi: number;
  missing: boolean;
  connectorFromPrev: boolean;
  bold: boolean;
  italic: boolean;

  gapAfter: number;
}

export interface Decoration {
  x0: number;
  x1: number;
  y: number;
  boxH: number;
  kind: 'underline' | 'strike';
  /** Kumulierter Wortzwischenraum vor der Marke (für Blocksatz-Verschiebung). */
  preGap?: number;
}

export interface CheckMark {
  done: boolean;
  x: number;
  y: number;
  size: number;
}

export interface LaidLine extends InkLine {
  baselineY: number;
  lineH: number;
  rule?: boolean;
  table?: LaidTable;
  check?: CheckMark;
}


export interface InkLine {
  glyphs: PlacedGlyph[];
  decorations: Decoration[];
}


export interface LaidTableCell {
  lines: InkLine[];
}

export interface LaidTable {
  x: number;
  y: number;
  w: number;
  h: number;

  colBounds: number[];

  rowBounds: number[];

  headerRows: number;
  cells: LaidTableCell[][];
}

export interface LaidPage {
  lines: LaidLine[];
}

type DecoGlyph = PlacedGlyph & { deco?: 'underline' | 'strike' };

const HEADING_SCALE: Record<number, number> = { 1: 1.6, 2: 1.34, 3: 1.16 };

/** Lückenbreite (___) pro Unterstrich, in boxH-Einheiten. */
const GAP_UNIT = 0.42;

function glyphFor(
  profile: HandwritingProfile,
  ch: string,
  gi: number,
  seed: number,
): { v: GlyphVariant; missing: boolean } {
  const list = profile.glyphs[ch];
  if (list && list.length > 0) {
    const idx = Math.floor(stableRandom(seed, gi, `var:${ch}`) * list.length) % list.length;
    return { v: list[idx], missing: false };
  }

  return { v: demoGlyphFor(ch, 99), missing: true };
}


export function layoutPages(
  text: string,
  profile: HandwritingProfile,
  settings: DocSettings,
): LaidPage[] {
  const { w: pageW, h: pageH } = getPageDims(settings.pageFormat);
  const margin = clamp(settings.margin ?? 72, 16, 220);
  const nat = settings.naturalness / 100;
  const rndAmt = settings.randomness / 100;
  const seed = rndAmt <= 0.001 ? 1234567 : settings.seed;
  const maxW = pageW - margin * 2;
  const baseBoxH = settings.fontSize * 1.6;
  const spaceWFor = (boxH: number) => boxH * (0.16 + 0.24 * settings.wordGap);
  const limitY = () => pageH - margin;


  const snapActive = (settings.paper === 'lined' || settings.paper === 'college') && settings.snapLines !== false;
  const ruleStep = (settings.paper === 'college' ? 30 : 34) * (pageW / 800);
  const snapAdvance = (target: number, minSteps: number): number => {
    if (!snapActive) return target;
    const steps = Math.max(minSteps, Math.round((target - margin) / ruleStep));
    return margin + steps * ruleStep;
  };

  const pages: LaidPage[] = [];
  let lines: LaidLine[] = [];
  let yCursor = margin;
  let gi = 0;

  const j = (salt: string, amt: number): number => {
    if (rndAmt <= 0.001 || amt === 0) return 0;
    return (stableRandom(seed, gi, salt) - 0.5) * 2 * amt * (0.25 + 0.75 * rndAmt);
  };
  const cwOf = (ch: string, boxH: number): number => {
    const { v } = glyphFor(profile, ch, 0, seed);
    return v.widthFactor * boxH * (0.94 + settings.letterGap) + boxH * 0.035;
  };

  const newPage = () => {
    pages.push({ lines });
    lines = [];
    yCursor = margin;
  };
  const ensureSpace = (lineH: number) => {
    if (lines.length > 0 && yCursor + lineH > limitY()) newPage();
  };

  const collectDecorations = (glyphs: PlacedGlyph[]): Decoration[] => {
    const decorations: Decoration[] = [];
    let run: PlacedGlyph[] | null = null;
    let runKind: 'underline' | 'strike' | null = null;
    const closeRun = () => {
      if (run && run.length > 0 && runKind) {
        const lastR = run[run.length - 1];
        decorations.push({
          x0: run[0].x,
          x1: lastR.x + lastR.widthPx,
          y: run[0].y,
          boxH: run.reduce((n, g) => n + g.boxH, 0) / run.length,
          kind: runKind,
        });
      }
      run = null;
      runKind = null;
    };
    for (const g of glyphs) {
      const deco = (g as DecoGlyph).deco;
      if (deco) {
        if (runKind === deco && run) run.push(g);
        else {
          closeRun();
          run = [g];
          runKind = deco;
        }
      } else closeRun();
    }
    closeRun();
    return decorations;
  };

  const applyAlignment = (line: LaidLine, isLastOfPara: boolean) => {
    if (line.rule) return;
    const glyphs = line.glyphs;
    // Lücken-Marken kommen hier noch unverschoben an (flushCur) und werden
    // mitgeschoben – danach erst die Glyphen-Dekos aus finalen Positionen.
    const gaps = line.decorations;
    const shiftGaps = (dx: number) => {
      if (dx !== 0) {
        for (const d of gaps) {
          d.x0 += dx;
          d.x1 += dx;
        }
      }
    };
    if (glyphs.length === 0) {
      line.decorations = [...gaps, ...collectDecorations(glyphs)];
      return;
    }
    let minX = glyphs[0].x;
    let maxX = glyphs[glyphs.length - 1].x + glyphs[glyphs.length - 1].widthPx;
    for (const d of gaps) {
      minX = Math.min(minX, d.x0);
      maxX = Math.max(maxX, d.x1);
    }
    const contentW = maxX - minX;
    if (settings.align === 'center' || settings.align === 'right') {
      const off = (maxW - contentW) * (settings.align === 'center' ? 0.5 : 1);
      if (off > 0) {
        for (const g of glyphs) g.x += off;
        shiftGaps(off);
      }
    } else if (settings.align === 'justify' && !isLastOfPara) {
      const totalGap = glyphs.reduce((n, g) => n + (g.gapAfter || 0), 0);
      const extra = maxW - contentW;
      if (totalGap > 0.5 && extra > 0 && contentW > maxW * 0.45) {
        let shift = 0;
        for (const g of glyphs) {
          g.x += shift;
          if (g.gapAfter) shift += (extra * g.gapAfter) / totalGap;
        }
        for (const d of gaps) {
          const s = ((d.preGap || 0) * extra) / totalGap;
          d.x0 += s;
          d.x1 += s;
        }
      }
    }
    line.decorations = [...gaps, ...collectDecorations(glyphs)];
  };

  const placeWord = (
    word: string,
    flags: { bold: boolean; italic: boolean; underline: boolean; strike: boolean },
    boxH: number,
    cur: PlacedGlyph[],
    startX: number,
    y0: number,
    allowSnap = true,
  ): number => {
    let x = startX;
    let first = cur.length === 0;
    const deco = flags.underline ? 'underline' : flags.strike ? 'strike' : undefined;
    const doSnap = snapActive && allowSnap;
    for (const ch of word) {
      const { v, missing } = glyphFor(profile, ch, gi, seed);
      const gw = v.widthFactor * boxH;
      const sc = 1 + j('sc', 0.06 * nat * (0.3 + profile.metrics.sizeVariance));
      const fBoxH = boxH * sc;
      let gy = y0 + (doSnap ? 0 : j('y', boxH * 0.028 * nat * (0.3 + profile.metrics.baselineWobble))) + v.baselineOffset * boxH;
      if (doSnap) {

        const base = gy + 0.8 * fBoxH;
        gy += margin + Math.round((base - margin) / ruleStep) * ruleStep - base;
      }
      const item = {
        ch,
        variant: v,
        x,
        y: gy,
        boxH: fBoxH,
        rotation: j('rot', 2.1 * nat),
        widthPx: gw * sc,
        gi,
        missing,
        connectorFromPrev: !first && nat > 0.2 && stableRandom(seed, gi, 'conn') < 0.45,
        bold: flags.bold,
        italic: flags.italic,
        gapAfter: 0,
      } as DecoGlyph;
      if (deco) item.deco = deco;
      cur.push(item);
      x += gw * sc * (0.94 + settings.letterGap) + boxH * 0.035;
      first = false;
      gi++;
    }
    return x;
  };

  /** Lücke (___) platzieren: rückt vor, merkt Schreiblinie für den Export. */
  const placeGap = (
    n: number,
    boxH: number,
    startX: number,
    y0: number,
    out: Decoration[],
    preGap: number,
  ): number => {
    const w = n * GAP_UNIT * boxH;
    out.push({ x0: startX, x1: startX + w, y: y0, boxH, kind: 'underline', preGap });
    return startX + w;
  };


  const layoutParagraph = (segs: TextSeg[], boxH: number, indent: number, forceBold: boolean): void => {
    const lineH = boxH * settings.lineHeight;
    const spaceW = spaceWFor(boxH);
    const paraLines: LaidLine[] = [];
    let cur: PlacedGlyph[] = [];
    let curW = 0;
    let lineIndent = indent;
    let pendingGaps: Decoration[] = [];

    const startLineIfNeeded = () => {
      if (cur.length === 0) {
        ensureSpace(lineH);
        curW = lineIndent;
      }
    };

    const flushCur = () => {
      const line: LaidLine = { glyphs: cur, baselineY: yCursor, lineH, decorations: pendingGaps };
      lines.push(line);
      paraLines.push(line);
      const minSteps = Math.ceil((lineH * 0.85) / (snapActive ? ruleStep : 1));
      yCursor = snapAdvance(yCursor + lineH, snapActive ? Math.max(1, minSteps) : 0);
      cur = [];
      curW = 0;
      lineIndent = 0;
      pendingGaps = [];
    };

    const tokens: { text: string; isSpace: boolean; seg: TextSeg; gap?: number }[] = [];
    for (const seg of segs) {
      if (seg.gap) {
        tokens.push({ text: '', isSpace: false, seg, gap: seg.gap });
        continue;
      }
      for (const p of seg.text.split(/(\s+)/).filter((t) => t.length > 0)) {
        tokens.push({ text: p, isSpace: /^\s+$/.test(p), seg });
      }
    }

    for (const tok of tokens) {
      if (tok.isSpace) {
        if (cur.length > 0) {
          curW += spaceW;
          cur[cur.length - 1].gapAfter += spaceW;
        }
        continue;
      }
      if (tok.gap) {
        startLineIfNeeded();
        const gw = tok.gap * GAP_UNIT * boxH;
        if (curW + gw > maxW && (cur.length > 0 || pendingGaps.length > 0)) flushCur();
        startLineIfNeeded();
        const gy = yCursor;
        const preGap = cur.reduce((n, g) => n + (g.gapAfter || 0), 0);
        curW = placeGap(tok.gap, boxH, margin + curW, gy, pendingGaps, preGap) - margin;
        continue;
      }
      const flags = {
        bold: tok.seg.flags.bold || forceBold,
        italic: tok.seg.flags.italic,
        underline: tok.seg.flags.underline,
        strike: tok.seg.flags.strike,
      };
      let word = tok.text;
      while (word.length > 0) {
        startLineIfNeeded();
        const y0 = yCursor;
        let total = 0;
        for (const ch of word) total += cwOf(ch, boxH);
        if (curW + total <= maxW || cur.length === 0) {
          if (total + curW > maxW && cur.length === 0) {

            let fit = 0;
            let acc = curW;
            for (const ch of word) {
              const w = cwOf(ch, boxH);
              if (acc + w > maxW && fit > 0) break;
              acc += w;
              fit++;
            }
            fit = Math.max(1, fit);
            const endX = placeWord(word.slice(0, fit), flags, boxH, cur, margin + curW, y0);
            curW = endX - margin;
            word = word.slice(fit);
            flushCur();
          } else {
            const endX = placeWord(word, flags, boxH, cur, margin + curW, y0);
            curW = endX - margin;
            word = '';
          }
        } else {
          flushCur();
        }
      }
    }
    if (cur.length > 0 || pendingGaps.length > 0) flushCur();


    paraLines.forEach((line, idx) => applyAlignment(line, idx === paraLines.length - 1));
  };


  const layoutTable = (header: TextSeg[][], aligns: ColumnAlign[], rows: TextSeg[][][]): void => {
    const boxH = baseBoxH;
    const lineH = boxH * settings.lineHeight;
    const cols = header.length;
    if (cols === 0) return;
    const padX = boxH * 0.3;
    const padTop = boxH * 0.28;
    const spaceW = spaceWFor(boxH);

    const tokenizeCell = (segs: TextSeg[]): { text: string; isSpace: boolean; seg: TextSeg; gap?: number }[] => {
      const out: { text: string; isSpace: boolean; seg: TextSeg; gap?: number }[] = [];
      for (const seg of segs) {
        if (seg.gap) {
          out.push({ text: '', isSpace: false, seg, gap: seg.gap });
          continue;
        }
        for (const p of seg.text.split(/(\s+)/).filter((t) => t.length > 0)) {
          out.push({ text: p, isSpace: /^\s+$/.test(p), seg });
        }
      }
      return out;
    };
    const flagsOf = (seg: TextSeg) => ({
      bold: seg.flags.bold,
      italic: seg.flags.italic,
      underline: seg.flags.underline,
      strike: seg.flags.strike,
    });


    const layoutCell = (segs: TextSeg[], maxLineW: number): { lines: { glyphs: PlacedGlyph[]; gaps: Decoration[] }[]; width: number } => {
      const out: { glyphs: PlacedGlyph[]; gaps: Decoration[] }[] = [];
      let cur: PlacedGlyph[] = [];
      let curW = 0;
      let maxSeen = 0;
      let curGaps: Decoration[] = [];
      // Toleranz gegen Fließkomma-Rundung an der exakten Spaltenbreite:
      // Die Spalte wurde aus der natürlichen Breite vermessen, beim finalen
      // Layout darf ein Wort an der Grenze nicht in die nächste Zeile rutschen.
      const EPS = Math.max(1, boxH * 0.04);
      const flush = () => {
        if (cur.length > 0 || curGaps.length > 0) {
          if (cur.length > 0) {
            const last = cur[cur.length - 1];
            maxSeen = Math.max(maxSeen, last.x + last.widthPx);
          }
          for (const gd of curGaps) maxSeen = Math.max(maxSeen, gd.x1);
          out.push({ glyphs: cur, gaps: curGaps });
          cur = [];
          curW = 0;
          curGaps = [];
        }
      };
      for (const tok of tokenizeCell(segs)) {
        if (tok.isSpace) {
          if (cur.length > 0) {
            curW += spaceW;
            cur[cur.length - 1].gapAfter += spaceW;
          }
          continue;
        }
        if (tok.gap) {
          const gw = tok.gap * GAP_UNIT * boxH;
          if (curW + gw > maxLineW + EPS && (cur.length > 0 || curGaps.length > 0)) flush();
          const preGap = cur.reduce((n, g) => n + (g.gapAfter || 0), 0);
          curW = placeGap(tok.gap, boxH, curW, 0, curGaps, preGap);
          continue;
        }
        const flags = flagsOf(tok.seg);
        let word = tok.text;
        while (word.length > 0) {
          let total = 0;
          for (const ch of word) total += cwOf(ch, boxH);
          if (curW + total <= maxLineW + EPS || cur.length === 0) {
            if (total + curW > maxLineW + EPS && cur.length === 0) {
              let fit = 0;
              let acc = curW;
              for (const ch of word) {
                const w = cwOf(ch, boxH);
                if (acc + w > maxLineW + EPS && fit > 0) break;
                acc += w;
                fit++;
              }
              fit = Math.max(1, fit);
              // y0 = 0: Der Zeilenversatz (li * lineH) wird später in
              // positionRow addiert – hier nichts vorab einrechnen (sonst
              // doppelt und die Zeile läuft in die nächste Tabellenzeile).
              curW = placeWord(word.slice(0, fit), flags, boxH, cur, curW, 0, false);
              word = word.slice(fit);
              flush();
            } else {
              curW = placeWord(word, flags, boxH, cur, curW, 0, false);
              word = '';
            }
          } else {
            flush();
          }
        }
      }
      flush();
      return { lines: out, width: maxSeen };
    };


    const allRows = [header, ...rows];
    const natural: number[][] = allRows.map((r) => r.map((cell) => layoutCell(cell, Infinity).width));
    const minContent = boxH * 0.7;
    const contentW: number[] = [];
    for (let jc = 0; jc < cols; jc++) {
      let m = minContent;
      for (let r = 0; r < allRows.length; r++) m = Math.max(m, natural[r][jc]);
      // Kleine Reserve: Messung und finales Layout können minimal abweichen
      // (Varianten-Auswahl, Rundung) – ohne Reserve bricht die letzte Ziffer um.
      contentW.push(m + boxH * 0.08);
    }
    const pads = padX * 2 * cols;


    const maxColContent = Math.max(minContent, (maxW - pads) * 0.55);
    const capped = contentW.map((w) => Math.min(w, maxColContent));
    const sumCapped = capped.reduce((a, b) => a + b, 0);
    let colW = [...capped];
    if (sumCapped + pads > maxW) {
      const avail = Math.max(cols * minContent, maxW - pads);
      const scale = avail / Math.max(1e-6, sumCapped);
      colW = capped.map((w) => Math.max(minContent, w * scale));
    }


    const finalRows: { glyphs: PlacedGlyph[]; gaps: Decoration[] }[][][] = allRows.map((rowCells) =>
      rowCells.map((cell, jc) => layoutCell(cell, colW[jc]).lines),
    );
    const rowH = finalRows.map((fr) => {
      let ml = 1;
      for (const cellLines of fr) ml = Math.max(ml, cellLines.length);
      return Math.max(lineH, padTop * 2 + ml * lineH);
    });


    const colBounds = [margin];
    const colContentX: number[] = [];
    let accX = margin;
    for (let jc = 0; jc < cols; jc++) {
      colContentX.push(accX + padX);
      accX += colW[jc] + padX * 2;
      colBounds.push(accX);
    }
    const tableW = accX - margin;

    const positionRow = (frow: { glyphs: PlacedGlyph[]; gaps: Decoration[] }[][], yTop: number, isHeader: boolean): LaidTableCell[] => {
      return frow.map((cellLines, jc) => {
        const avail = colW[jc];
        const a = aligns[jc] ?? 'left';
        const linesOut: InkLine[] = cellLines.map(({ glyphs, gaps }, li) => {
          const wLine = glyphs.length > 0 ? glyphs[glyphs.length - 1].x + glyphs[glyphs.length - 1].widthPx - glyphs[0].x : 0;
          let off = 0;
          if (a === 'center') off = (avail - wLine) / 2;
          else if (a === 'right') off = avail - wLine;
          if (off < 0 || !Number.isFinite(off)) off = 0;
          const dy = yTop + padTop + li * lineH;
          const moved = glyphs.map((g) => ({
            ...g,
            x: colContentX[jc] + g.x + off,
            y: g.y + dy,
            bold: isHeader ? true : g.bold,
          }));
          const movedGaps = gaps.map((gd) => ({
            ...gd,
            x0: colContentX[jc] + gd.x0 + off,
            x1: colContentX[jc] + gd.x1 + off,
            y: gd.y + dy,
          }));
          return { glyphs: moved, decorations: [...movedGaps, ...collectDecorations(moved)] };
        });
        return { lines: linesOut };
      });
    };

    const pushSegment = (segCells: LaidTableCell[][], segTop: number, segBounds: number[]) => {
      const segH = segBounds[segBounds.length - 1] - segTop;
      lines.push({
        glyphs: [],
        baselineY: segTop,
        lineH: segH,
        decorations: [],
        table: {
          x: margin,
          y: segTop,
          w: tableW,
          h: segH,
          colBounds: [...colBounds],
          rowBounds: [...segBounds],
          headerRows: 1,
          cells: segCells,
        },
      });
    };

    ensureSpace(rowH[0] + (rowH[1] ?? 0));
    let segCells: LaidTableCell[][] = [];
    let segBounds: number[] = [yCursor];
    segCells.push(positionRow(finalRows[0], yCursor, true));
    yCursor = snapAdvance(yCursor + rowH[0], 1);
    segBounds.push(yCursor);
    for (let r = 1; r < finalRows.length; r++) {
      if (yCursor + rowH[r] > limitY() && segCells.length > 1) {
        pushSegment(segCells, segBounds[0], segBounds);
        newPage();
        segCells = [];
        segBounds = [yCursor];
        segCells.push(positionRow(finalRows[0], yCursor, true));
        yCursor = snapAdvance(yCursor + rowH[0], 1);
        segBounds.push(yCursor);
      }
      segCells.push(positionRow(finalRows[r], yCursor, false));
      yCursor = snapAdvance(yCursor + rowH[r], 1);
      segBounds.push(yCursor);
    }
    pushSegment(segCells, segBounds[0], segBounds);
    yCursor = snapAdvance(yCursor + lineH * 0.25, 0);
  };


  const blocks = parseMarkdown(text || ' ');
  for (const block of blocks) {
    if (block.kind === 'blank') {
      yCursor = snapAdvance(yCursor + baseBoxH * settings.lineHeight * 0.45, 0);
      if (yCursor > limitY()) newPage();
      continue;
    }
    if (block.kind === 'rule') {
      const lh = baseBoxH * 0.9;
      ensureSpace(lh);
      lines.push({ glyphs: [], baselineY: yCursor, lineH: lh, decorations: [], rule: true });
      yCursor = snapAdvance(yCursor + lh, 1);
      continue;
    }
    if (block.kind === 'heading') {
      const boxH = baseBoxH * (HEADING_SCALE[block.level] ?? 1.2);
      if (yCursor > margin + 1) yCursor = snapAdvance(yCursor + baseBoxH * settings.lineHeight * 0.3, 0);
      layoutParagraph(block.segs, boxH, 0, true);
      yCursor = snapAdvance(yCursor + baseBoxH * settings.lineHeight * 0.2, 0);
      continue;
    }
    if (block.kind === 'bullet' || block.kind === 'ordered') {
      const prefix = block.kind === 'bullet' ? '- ' : `${block.index}. `;
      const prefixSeg: TextSeg = {
        text: prefix,
        flags: { bold: false, italic: false, strike: false, underline: false },
      };
      layoutParagraph([prefixSeg, ...block.segs], baseBoxH, baseBoxH * 0.55, false);
      continue;
    }
    if (block.kind === 'check') {
      const before = lines.length;
      layoutParagraph(block.segs, baseBoxH, baseBoxH * 0.95, false);
      if (lines.length > before) {
        const first = lines[before];
        if (first.glyphs.length > 0) {
          const g0 = first.glyphs[0];
          const size = baseBoxH * 0.52;
          first.check = { done: block.done, x: g0.x - size - baseBoxH * 0.18, y: g0.y + baseBoxH * 0.28, size };
        }
      }
      continue;
    }
    if (block.kind === 'table') {
      layoutTable(block.header, block.aligns, block.rows);
      continue;
    }
    layoutParagraph(block.segs, baseBoxH, 0, false);
  }

  if (lines.length > 0 || pages.length === 0) pages.push({ lines });
  return pages.filter((p) => p.lines.length > 0 || pages.length === 1);
}

export function countMissingGlyphs(pages: LaidPage[]): number {
  let n = 0;
  for (const p of pages) {
    for (const l of p.lines) {
      for (const g of l.glyphs) if (g.missing) n++;
      if (l.table) {
        for (const row of l.table.cells) {
          for (const cell of row) {
            for (const ln of cell.lines) {
              for (const g of ln.glyphs) if (g.missing) n++;
            }
          }
        }
      }
    }
  }
  return n;
}

export function clampPageIndex(i: number, total: number): number {
  return clamp(i, 0, Math.max(0, total - 1));
}
