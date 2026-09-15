export interface SpanFlags {
  bold: boolean;
  italic: boolean;
  strike: boolean;
  underline: boolean;
}

export interface TextSeg {
  text: string;
  flags: SpanFlags;
}

export type ColumnAlign = 'left' | 'center' | 'right';

export type Block =
  | { kind: 'para'; segs: TextSeg[] }
  | { kind: 'heading'; level: 1 | 2 | 3; segs: TextSeg[] }
  | { kind: 'bullet'; segs: TextSeg[] }
  | { kind: 'ordered'; index: number; segs: TextSeg[] }
  | { kind: 'table'; header: TextSeg[][]; aligns: ColumnAlign[]; rows: TextSeg[][][] }
  | { kind: 'rule' }
  | { kind: 'blank' };

const NO_FLAGS: SpanFlags = { bold: false, italic: false, strike: false, underline: false };


export function parseInline(srcIn: string): TextSeg[] {

  let src = srcIn.replace(/`([^`\n]*)`/g, '$1');
  const segs: TextSeg[] = [];
  let buf = '';
  let flags: SpanFlags = { ...NO_FLAGS };
  const push = () => {
    if (buf.length > 0) {
      segs.push({ text: buf, flags: { ...flags } });
      buf = '';
    }
  };
  const toggle = (key: keyof SpanFlags) => {
    push();
    flags = { ...flags, [key]: !flags[key] };
  };
  let i = 0;
  while (i < src.length) {
    if (src.startsWith('**', i)) {
      toggle('bold');
      i += 2;
    } else if (src.startsWith('~~', i)) {
      toggle('strike');
      i += 2;
    } else if (src.startsWith('__', i)) {
      toggle('underline');
      i += 2;
    } else if (src[i] === '*') {
      toggle('italic');
      i += 1;
    } else {
      buf += src[i];
      i += 1;
    }
  }
  push();
  void NO_FLAGS;
  return segs.length > 0 ? segs : [{ text: '', flags: { ...NO_FLAGS } }];
}

function splitRow(line: string): string[] | null {
  const t = line.trim();
  if (!t.includes('|')) return null;
  const cells: string[] = [];
  let buf = '';
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '\\' && t[i + 1] === '|') {
      buf += '|';
      i++;
      continue;
    }
    if (t[i] === '|') {
      cells.push(buf);
      buf = '';
      continue;
    }
    buf += t[i];
  }
  cells.push(buf);
  if (cells.length > 0 && cells[0].trim() === '') cells.shift();
  if (cells.length > 0 && cells[cells.length - 1].trim() === '') cells.pop();
  if (cells.length === 0) return null;
  return cells.map((c) => c.trim());
}

function parseAlignCell(cell: string): ColumnAlign | null {
  const c = cell.trim();
  if (!/^:?-+:?$/.test(c)) return null;
  const left = c.startsWith(':');
  const right = c.endsWith(':') && c.length > 1;
  if (left && right) return 'center';
  if (right) return 'right';
  return 'left';
}

export function parseMarkdown(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.split('\n');
  let orderedCounter = 0;
  let prevWasOrdered = false;
  const resetList = () => {
    orderedCounter = 0;
    prevWasOrdered = false;
  };

  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li];
    const line = raw.replace(/\s+$/, '');
    if (line.trim() === '') {
      blocks.push({ kind: 'blank' });
      resetList();
      continue;
    }
    const headCells = splitRow(line);
    if (headCells && headCells.length > 0 && li + 1 < lines.length) {
      const sepCells = splitRow(lines[li + 1].replace(/\s+$/, ''));
      const aligns = sepCells && sepCells.length === headCells.length ? sepCells.map(parseAlignCell) : null;
      if (aligns && aligns.every((a) => a !== null)) {
        const rows: TextSeg[][][] = [];
        let lj = li + 2;
        while (lj < lines.length) {
          const bodyCells = splitRow(lines[lj].replace(/\s+$/, ''));
          if (!bodyCells) break;
          while (bodyCells.length < headCells.length) bodyCells.push('');
          rows.push(bodyCells.slice(0, headCells.length).map((cell) => parseInline(cell)));
          lj++;
        }
        blocks.push({
          kind: 'table',
          header: headCells.map((cell) => parseInline(cell)),
          aligns: aligns as ColumnAlign[],
          rows,
        });
        li = lj - 1;
        resetList();
        continue;
      }
    }
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length as 1 | 2 | 3, segs: parseInline(heading[2]) });
      resetList();
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      blocks.push({ kind: 'rule' });
      resetList();
      continue;
    }
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    if (bullet) {
      blocks.push({ kind: 'bullet', segs: parseInline(bullet[1]) });
      resetList();
      continue;
    }
    const ordered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (ordered) {
      const n = parseInt(ordered[1], 10) || 1;
      orderedCounter = prevWasOrdered ? orderedCounter + 1 : n;
      blocks.push({ kind: 'ordered', index: orderedCounter, segs: parseInline(ordered[2]) });
      prevWasOrdered = true;
      continue;
    }
    blocks.push({ kind: 'para', segs: parseInline(line) });
    resetList();
  }
  return blocks;
}

export function countWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}
