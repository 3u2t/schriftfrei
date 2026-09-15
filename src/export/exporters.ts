import { jsPDF } from 'jspdf';
import type { PageFormat } from '../engine/types';
import { buildPdf, dataUrlToJpeg, jpegDims, svgToPdfPage } from './vectorPdf';

export interface RasterSize {
  w: number;
  h: number;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function loadImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}


export async function svgToCanvas(
  svg: string,
  scale = 2.5,
  background: string | null = '#ffffff',
  size: RasterSize = { w: 800, h: 1131 },
): Promise<HTMLCanvasElement> {
  const img = await loadImage(svg);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(size.w * scale);
  canvas.height = Math.round(size.h * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas-2D wird von diesem Browser nicht unterstützt.');
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Bild-Export fehlgeschlagen.'))), mime, quality);
  });
}

export interface RasterExportOptions {
  scale: number;
  size: RasterSize;
  paperColor: string;
}

export async function exportPagePng(svg: string, filename: string, transparent: boolean, opts: RasterExportOptions): Promise<void> {
  const canvas = await svgToCanvas(svg, opts.scale, transparent ? null : opts.paperColor, opts.size);
  const blob = await canvasToBlob(canvas, 'image/png');
  downloadBlob(blob, filename.endsWith('.png') ? filename : `${filename}.png`);
}

export async function exportPageJpg(svg: string, filename: string, opts: RasterExportOptions): Promise<void> {
  const canvas = await svgToCanvas(svg, opts.scale, opts.paperColor, opts.size);
  const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
  downloadBlob(blob, filename.endsWith('.jpg') ? filename : `${filename}.jpg`);
}

export function exportPageSvg(svg: string, filename: string): void {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  downloadBlob(blob, filename.endsWith('.svg') ? filename : `${filename}.svg`);
}

export interface PdfOptions {
  filename: string;
  title: string;
  transparent: boolean;
  scale: number;
  size: RasterSize;
  paperColor: string;
  format: PageFormat;
}

function jspdfFormat(format: PageFormat): { format: string | number[]; orientation: 'portrait' | 'landscape' } {
  switch (format) {
    case 'a4-landscape':
      return { format: 'a4', orientation: 'landscape' };
    case 'a5':
      return { format: 'a5', orientation: 'portrait' };
    case 'letter':
      return { format: 'letter', orientation: 'portrait' };
    case 'square':
      return { format: [210, 210], orientation: 'portrait' };
    case 'a4':
    default:
      return { format: 'a4', orientation: 'portrait' };
  }
}


export async function exportPagesPdf(svgs: string[], opts: PdfOptions): Promise<void> {
  if (svgs.length === 0) throw new Error('Kein Inhalt zum Exportieren.');
  const { format, orientation } = jspdfFormat(opts.format);
  const pdf = new jsPDF({ unit: 'mm', format: format as never, orientation });
  pdf.setProperties({ title: opts.title, creator: 'Schriftfrei (lokal)' });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  for (let i = 0; i < svgs.length; i++) {
    if (i > 0) pdf.addPage();
    const canvas = await svgToCanvas(svgs[i], opts.scale, opts.transparent ? null : opts.paperColor, opts.size);
    const dataUrl = canvas.toDataURL(opts.transparent ? 'image/png' : 'image/jpeg', 0.92);
    const fmt = opts.transparent ? 'PNG' : 'JPEG';
    pdf.addImage(dataUrl, fmt, 0, 0, pw, ph);
  }
  pdf.save(opts.filename.endsWith('.pdf') ? opts.filename : `${opts.filename}.pdf`);
}


function loadImageEl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

interface JpegImage {
  jpeg: Uint8Array;
  w: number;
  h: number;
}

/** Data-URL (JPEG direkt, PNG via Canvas) → JPEG-Bytes für den Vektor-PDF-Writer. */
async function imageHrefToJpeg(href: string): Promise<JpegImage | null> {
  const parsed = dataUrlToJpeg(href);
  if (!parsed) return null;
  if (parsed.mime === 'image/jpeg') {
    const dims = jpegDims(parsed.jpeg);
    return dims ? { jpeg: parsed.jpeg, w: dims.w, h: dims.h } : null;
  }
  try {
    const img = await loadImageEl(href);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return null;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0);
    const back = dataUrlToJpeg(c.toDataURL('image/jpeg', 0.92));
    if (!back) return null;
    return { jpeg: back.jpeg, w, h };
  } catch {
    return null;
  }
}

export async function exportForGoodNotes(svgs: string[], title: string): Promise<void> {
  if (svgs.length === 0) throw new Error('Kein Inhalt zum Exportieren.');
  // Eingebettete Bilder (Custom-Papier) einmalig auf JPEG normalisieren.
  const hrefs = new Set<string>();
  const re = /<image[^>]+href="([^"]+)"/g;
  for (const s of svgs) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s)) !== null) hrefs.add(m[1]);
  }
  const cache = new Map<string, JpegImage | null>();
  for (const href of hrefs) cache.set(href, await imageHrefToJpeg(href));
  // Vektor-PDF: Handschrift bleibt echte Kurve (scharf, kleine Datei,
  // Objekte in PDF-Apps auswählbar) statt gerastertem Bild.
  const pages = svgs.map((s) => svgToPdfPage(s, (href) => cache.get(href) ?? null));
  const bytes = buildPdf(pages, { title: `${title} (GoodNotes)`, creator: 'Schriftfrei (lokal)' });
  downloadBlob(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }), `goodnotes-${safeFilename(title)}.pdf`);
}

export function stampFilename(title: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `${safeFilename(title)}-${date}`;
}

/** Dateisystem-freundlich, französisch-sicher: Akzente bleiben, Satzzeichen werden vereinfacht. */
export function safeFilename(title: string): string {
  const safe = title
    .trim()
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/[’‘]/g, '')
    .replace(/["“”«»]/g, '')
    .replace(/[…·]/g, '-')
    .replace(/[^\w\u00c0-\u024f\u1e00-\u1eff-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return safe || 'handschrift';
}
