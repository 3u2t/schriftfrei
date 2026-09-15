/**
 * Minimaler, dependency-freier Vektor-PDF-Writer.
 *
 * Warum: Der GoodNotes-Export hat Seiten bisher als gerasterte Bilder (JPEG/PNG)
 * ins PDF geklebt – dadurch war nichts auswählbar und der Zoom wurde pixelig.
 * Dieser Writer mappt unsere SVG-Seiten (rect/line/circle/path/image) 1:1 auf
 * echte PDF-Vektoroperatoren. Das Ergebnis ist ein „Editable PDF" im
 * GoodNotes-Sinne: scharf bei jedem Zoom, kleine Datei, Objekte in PDF-Apps
 * auswähl- und verschiebbar.
 *
 * Hinweis: Eine native `.goodnotes`-Datei (proprietäres ZIP+Protobuf-Format)
 * kann ohne GoodNotes-SDK nicht verlässlich erzeugt werden – darum bewusst PDF.
 */

export interface PdfImage {
  /** Eindeutiger Name innerhalb der Seite, z. B. "Im0". */
  name: string;
  /** JPEG-Bytes (DCT). */
  jpeg: Uint8Array;
  w: number;
  h: number;
  /** Platzierung in SVG-Koordinaten. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfPage {
  w: number;
  h: number;
  /** Fertiger Content-Stream (ASCII-Operatoren). */
  stream: string;
  images: PdfImage[];
  /** Verwendete Opazitäten (0..1), für ExtGState-Ressourcen. */
  alphas: number[];
}

/** SVG-Pixel → PDF-Punkte (96dpi → 72pt). */
export const SVG_TO_PT = 0.75;

function f(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const r = Math.round(n * 100) / 100;
  return String(r);
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** "#rgb"/"#rrggbb" → [r,g,b] in 0..1. Unbekanntes → Schwarz. */
export function hexToRgb(hex: string): [number, number, number] {
  const m = hex.trim().match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!m) return [0, 0, 0];
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const v = parseInt(h, 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

function rgbOp(rgb: [number, number, number], stroke: boolean): string {
  return `${f(rgb[0])} ${f(rgb[1])} ${f(rgb[2])} ${stroke ? 'RG' : 'rg'}`;
}

function numAttr(el: Element, name: string, fallback = 0): number {
  const v = parseFloat(el.getAttribute(name) ?? '');
  return Number.isFinite(v) ? v : fallback;
}

/** Lesbare JPEG-Maße aus dem SOF-Marker (für eingebettete Custom-Papiere). */
export function jpegDims(bytes: Uint8Array): { w: number; h: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 4 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker === 0xd9 || marker === 0xda) break; // EOI / SOS
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (len < 2 || i + len >= bytes.length) break;
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      const h = (bytes[i + 5] << 8) | bytes[i + 6];
      const w = (bytes[i + 7] << 8) | bytes[i + 8];
      if (w > 0 && h > 0) return { w, h };
      return null;
    }
    i += 2 + len;
  }
  return null;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function dataUrlToJpeg(dataUrl: string): { jpeg: Uint8Array; mime: string } | null {
  const m = dataUrl.match(/^data:(image\/(?:jpeg|png));base64,(.+)$/);
  if (!m) return null;
  try {
    return { jpeg: base64ToBytes(m[2]), mime: m[1] };
  } catch {
    return null;
  }
}

interface WalkState {
  out: string[];
  images: PdfImage[];
  alphas: Set<number>;
  opacity: number;
  pageH: number;
  imgCount: number;
}

const K = SVG_TO_PT;
const X = (x: number): string => f(x * K);
const Y = (y: number, pageH: number): string => f((pageH - y) * K);

function lineCap(s: string | null): string {
  if (s === 'round') return '1 J';
  if (s === 'square') return '2 J';
  return '0 J';
}

function lineJoin(s: string | null): string {
  if (s === 'round') return '1 j';
  if (s === 'bevel') return '2 j';
  return '0 j';
}

function gsName(state: WalkState, alpha: number): string {
  const a = Math.round(clamp01(alpha) * 100) / 100;
  const arr = [...state.alphas, a].sort((x, y) => x - y);
  state.alphas = new Set(arr);
  return `GS${arr.indexOf(a)}`;
}

function paintPath(
  state: WalkState,
  d: string,
  fill: string | null,
  stroke: string | null,
  strokeW: number,
  cap: string | null,
  join: string | null,
  fillOpacity: number,
  strokeOpacity: number,
): void {
  const tokens = d.replace(/,/g, ' ').trim().split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return;
  const ops: string[] = [];
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let i = 0;
  const readNum = (): number => {
    const v = parseFloat(tokens[i++] ?? '');
    return Number.isFinite(v) ? v : 0;
  };
  let valid = false;
  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === 'M' || cmd === 'L') {
      const x = readNum();
      const y = readNum();
      ops.push(`${X(x)} ${Y(y, state.pageH)} ${cmd === 'M' ? 'm' : 'l'}`);
      cx = x;
      cy = y;
      if (cmd === 'M') {
        sx = x;
        sy = y;
      }
      valid = true;
    } else if (cmd === 'C') {
      const x1 = readNum();
      const y1 = readNum();
      const x2 = readNum();
      const y2 = readNum();
      const x = readNum();
      const y = readNum();
      ops.push(
        `${X(x1)} ${Y(y1, state.pageH)} ${X(x2)} ${Y(y2, state.pageH)} ${X(x)} ${Y(y, state.pageH)} c`,
      );
      cx = x;
      cy = y;
      valid = true;
    } else if (cmd === 'Q') {
      const qx = readNum();
      const qy = readNum();
      const x = readNum();
      const y = readNum();
      const c1x = cx + (2 / 3) * (qx - cx);
      const c1y = cy + (2 / 3) * (qy - cy);
      const c2x = x + (2 / 3) * (qx - x);
      const c2y = y + (2 / 3) * (qy - y);
      ops.push(
        `${X(c1x)} ${Y(c1y, state.pageH)} ${X(c2x)} ${Y(c2y, state.pageH)} ${X(x)} ${Y(y, state.pageH)} c`,
      );
      cx = x;
      cy = y;
      valid = true;
    } else if (cmd === 'Z') {
      ops.push('h');
      cx = sx;
      cy = sy;
    } else {
      // Unbekanntes Token (z. B. relative Kommandos erzeugen wir nie) – Pfad abbrechen.
      return;
    }
  }
  if (!valid) return;

  const hasFill = !!fill && fill !== 'none';
  const hasStroke = !!stroke && stroke !== 'none';
  if (!hasFill && !hasStroke) return;

  const parts: string[] = ['q'];
  if (hasFill) {
    parts.push(rgbOp(hexToRgb(fill as string), false));
    const a = state.opacity * fillOpacity;
    if (a < 1) parts.push(`/${gsName(state, a)} gs`);
  }
  if (hasStroke) {
    parts.push(rgbOp(hexToRgb(stroke as string), true));
    parts.push(`${f(Math.max(0.05, strokeW * K))} w`);
    parts.push(lineCap(cap));
    parts.push(lineJoin(join));
    const a = state.opacity * strokeOpacity;
    if (a < 1) parts.push(`/${gsName(state, a)} gs`);
  }
  parts.push(...ops);
  parts.push(hasFill && hasStroke ? 'B' : hasFill ? 'f' : 'S');
  parts.push('Q');
  state.out.push(parts.join('\n'));
}

function paintLine(state: WalkState, el: Element): void {
  const x1 = numAttr(el, 'x1');
  const y1 = numAttr(el, 'y1');
  const x2 = numAttr(el, 'x2');
  const y2 = numAttr(el, 'y2');
  const stroke = el.getAttribute('stroke');
  if (!stroke || stroke === 'none') return;
  const w = numAttr(el, 'stroke-width', 1);
  const sOp = numAttr(el, 'stroke-opacity', 1);
  const parts = ['q'];
  parts.push(rgbOp(hexToRgb(stroke), true));
  parts.push(`${f(Math.max(0.05, w * K))} w`);
  parts.push(lineCap(el.getAttribute('stroke-linecap')));
  const a = state.opacity * (Number.isFinite(sOp) ? sOp : 1);
  if (a < 1) parts.push(`/${gsName(state, a)} gs`);
  parts.push(`${X(x1)} ${Y(y1, state.pageH)} m`);
  parts.push(`${X(x2)} ${Y(y2, state.pageH)} l`);
  parts.push('S');
  parts.push('Q');
  state.out.push(parts.join('\n'));
}

function paintRect(state: WalkState, el: Element): void {
  const x = numAttr(el, 'x');
  const y = numAttr(el, 'y');
  const w = numAttr(el, 'width');
  const h = numAttr(el, 'height');
  if (w <= 0 || h <= 0) return;
  const fill = el.getAttribute('fill');
  const stroke = el.getAttribute('stroke');
  const hasFill = !!fill && fill !== 'none';
  const hasStroke = !!stroke && stroke !== 'none';
  if (!hasFill && !hasStroke) return;
  const parts = ['q'];
  if (hasFill) {
    parts.push(rgbOp(hexToRgb(fill as string), false));
    const a = state.opacity * numAttr(el, 'fill-opacity', 1);
    if (a < 1) parts.push(`/${gsName(state, a)} gs`);
  }
  if (hasStroke) {
    parts.push(rgbOp(hexToRgb(stroke as string), true));
    parts.push(`${f(Math.max(0.05, numAttr(el, 'stroke-width', 1) * K))} w`);
  }
  parts.push(`${X(x)} ${Y(y + h, state.pageH)} ${f(w * K)} ${f(h * K)} re`);
  parts.push(hasFill && hasStroke ? 'B' : hasFill ? 'f' : 'S');
  parts.push('Q');
  state.out.push(parts.join('\n'));
}

function paintCircle(state: WalkState, el: Element): void {
  const cx = numAttr(el, 'cx');
  const cy = numAttr(el, 'cy');
  const r = numAttr(el, 'r');
  if (r <= 0) return;
  const fill = el.getAttribute('fill');
  if (!fill || fill === 'none') return;
  const k = 0.5522847498;
  const d =
    `M ${f(cx - r)} ${f(cy)} ` +
    `C ${f(cx - r)} ${f(cy - k * r)}, ${f(cx - k * r)} ${f(cy - r)}, ${f(cx)} ${f(cy - r)} ` +
    `C ${f(cx + k * r)} ${f(cy - r)}, ${f(cx + r)} ${f(cy - k * r)}, ${f(cx + r)} ${f(cy)} ` +
    `C ${f(cx + r)} ${f(cy + k * r)}, ${f(cx + k * r)} ${f(cy + r)}, ${f(cx)} ${f(cy + r)} ` +
    `C ${f(cx - k * r)} ${f(cy + r)}, ${f(cx - r)} ${f(cy + k * r)}, ${f(cx - r)} ${f(cy)} Z`;
  paintPath(
    state,
    d,
    fill,
    null,
    0,
    null,
    null,
    numAttr(el, 'fill-opacity', 1),
    1,
  );
}

function paintImage(state: WalkState, el: Element, jpeg: Uint8Array, dims: { w: number; h: number }): void {
  const name = `Im${state.imgCount++}`;
  const x = numAttr(el, 'x');
  const y = numAttr(el, 'y');
  const w = numAttr(el, 'width', state.pageH);
  const h = numAttr(el, 'height', state.pageH);
  state.images.push({ name, jpeg, w: dims.w, h: dims.h, x, y, width: w, height: h });
  const parts = ['q'];
  const a = state.opacity;
  if (a < 1) parts.push(`/${gsName(state, a)} gs`);
  parts.push(
    `${f(w * K)} 0 0 ${f(h * K)} ${X(x)} ${Y(y + h, state.pageH)} cm /${name} Do`,
  );
  parts.push('Q');
  state.out.push(parts.join('\n'));
}

function walk(state: WalkState, node: Element, resolveImage: (el: Element) => { jpeg: Uint8Array; w: number; h: number } | null): void {
  const prev = state.opacity;
  const gOp = parseFloat(node.getAttribute('opacity') ?? '');
  if (node.tagName.toLowerCase() === 'g' && Number.isFinite(gOp)) {
    state.opacity = prev * gOp;
  }
  for (const child of Array.from(node.children)) {
    const tag = child.tagName.toLowerCase();
    if (tag === 'g' || tag === 'svg') {
      walk(state, child, resolveImage);
    } else if (tag === 'path') {
      paintPath(
        state,
        child.getAttribute('d') ?? '',
        child.getAttribute('fill'),
        child.getAttribute('stroke'),
        numAttr(child, 'stroke-width', 1),
        child.getAttribute('stroke-linecap'),
        child.getAttribute('stroke-linejoin'),
        numAttr(child, 'fill-opacity', 1),
        numAttr(child, 'stroke-opacity', 1),
      );
    } else if (tag === 'line') {
      paintLine(state, child);
    } else if (tag === 'rect') {
      paintRect(state, child);
    } else if (tag === 'circle') {
      paintCircle(state, child);
    } else if (tag === 'image') {
      const img = resolveImage(child);
      if (img) paintImage(state, child, img.jpeg, { w: img.w, h: img.h });
    }
  }
  state.opacity = prev;
}

/**
 * Wandelt eine unserer SVG-Seiten in PDF-Vektoroperatoren um (Browser: braucht DOMParser).
 * `resolveImage` liefert JPEG-Bytes für `<image>`-Elemente (Custom-Papier).
 */
export function svgToPdfPage(
  svg: string,
  resolveImage?: (href: string) => { jpeg: Uint8Array; w: number; h: number } | null,
): PdfPage {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  const vb = (root.getAttribute('viewBox') ?? '').trim().split(/\s+/).map(Number);
  const w = Number.isFinite(vb[2]) && vb[2] > 0 ? vb[2] : 800;
  const h = Number.isFinite(vb[3]) && vb[3] > 0 ? vb[3] : 1131;
  const state: WalkState = { out: [], images: [], alphas: new Set(), opacity: 1, pageH: h, imgCount: 0 };
  walk(state, root, (el) => {
    if (!resolveImage) return null;
    const href = el.getAttribute('href') ?? el.getAttribute('xlink:href') ?? '';
    if (!href) return null;
    return resolveImage(href);
  });
  return { w, h, stream: state.out.join('\n'), images: state.images, alphas: [...state.alphas] };
}

function pdfEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/** PDF-Text: ASCII als Literal, sonst UTF-16BE mit BOM als Hex-String (Umlaute!). */
function pdfText(s: string): string {
  if (/^[\x20-\x7e]*$/.test(s)) return `(${pdfEscape(s)})`;
  let hex = 'FEFF';
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x10000) {
      hex += code.toString(16).padStart(4, '0').toUpperCase();
    } else {
      const v = code - 0x10000;
      hex += (0xd800 + (v >> 10)).toString(16).padStart(4, '0').toUpperCase();
      hex += (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, '0').toUpperCase();
    }
  }
  return `<${hex}>`;
}

function pdfDate(d: Date): string {
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}+00'00'`;
}

/** Baut aus Vektor-Seiten ein komplettes PDF (rein, ohne Browser-APIs – in Node testbar). */
export function buildPdf(pages: PdfPage[], meta: { title: string; creator: string }): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let pos = 0;
  const pushAscii = (s: string) => {
    const b = enc.encode(s);
    chunks.push(b);
    pos += b.length;
  };
  const pushBytes = (b: Uint8Array) => {
    chunks.push(b);
    pos += b.length;
  };

  pushAscii('%PDF-1.4\n');
  // Binär-Marker als echte Bytes (muss Byte-exakt bleiben für xref-Offsets).
  pushBytes(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  const objNums: number[] = [];
  const newObj = (): number => {
    objNums.push(0);
    return objNums.length;
  };
  // Objekt 1 = Catalog, 2 = Pages (vorab reservieren)
  newObj();
  newObj();
  const pageObjNums: number[] = [];
  const contentObjNums: number[] = [];
  const gsObjNums: number[][] = [];
  const imgObjNums: number[][] = [];
  for (const p of pages) {
    pageObjNums.push(newObj());
    contentObjNums.push(newObj());
    gsObjNums.push(p.alphas.map(() => newObj()));
    imgObjNums.push(p.images.map(() => newObj()));
  }
  const infoObj = newObj();

  const writeObj = (n: number, bodyAscii: string, bodyBin?: Uint8Array) => {
    offsets[n] = pos;
    pushAscii(`${n} 0 obj\n${bodyAscii}`);
    if (bodyBin) {
      pushBytes(bodyBin);
      pushAscii('\nendstream\n');
    } else {
      pushAscii('\n');
    }
    pushAscii('endobj\n');
  };

  const kids = pageObjNums.map((n) => `${n} 0 R`).join(' ');
  writeObj(1, `<< /Type /Catalog /Pages 2 0 R >>\n`);
  writeObj(2, `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>\n`);

  pages.forEach((p, pi) => {
    const pw = f(p.w * K);
    const ph = f(p.h * K);
    const res: string[] = [];
    if (p.alphas.length > 0) {
      const gs = p.alphas.map((_, gi) => `/GS${gi} ${gsObjNums[pi][gi]} 0 R`).join(' ');
      res.push(`/ExtGState << ${gs} >>`);
    }
    if (p.images.length > 0) {
      const xo = p.images.map((im, ii) => `/${im.name} ${imgObjNums[pi][ii]} 0 R`).join(' ');
      res.push(`/XObject << ${xo} >>`);
    }
    writeObj(
      pageObjNums[pi],
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Contents ${contentObjNums[pi]} 0 R` +
        (res.length > 0 ? ` /Resources << ${res.join(' ')} >>` : '') +
        ` >>\n`,
    );
    const streamBytes = enc.encode(p.stream);
    writeObj(contentObjNums[pi], `<< /Length ${streamBytes.length} >>\nstream\n`, streamBytes);
    p.alphas.forEach((a, gi) => {
      writeObj(gsObjNums[pi][gi], `<< /Type /ExtGState /ca ${f(a)} /CA ${f(a)} >>\n`);
    });
    p.images.forEach((im, ii) => {
      writeObj(
        imgObjNums[pi][ii],
        `<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.jpeg.length} >>\nstream\n`,
        im.jpeg,
      );
    });
  });

  writeObj(
    infoObj,
    `<< /Title ${pdfText(meta.title)} /Creator ${pdfText(meta.creator)} /Producer (Schriftfrei Vektor-Export) /CreationDate (${pdfDate(new Date())}) >>\n`,
  );

  const xrefPos = pos;
  const total = objNums.length + 1;
  let xref = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let n = 1; n <= objNums.length; n++) {
    xref += `${String(offsets[n] ?? 0).padStart(10, '0')} 00000 n \n`;
  }
  pushAscii(xref);
  pushAscii(`trailer\n<< /Size ${total} /Root 1 0 R /Info ${infoObj} 0 R >>\nstartxref\n${xrefPos}\n%%EOF`);

  const out = new Uint8Array(pos);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}
