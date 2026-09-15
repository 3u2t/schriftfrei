import { jsPDF } from 'jspdf';
import type { PageFormat } from '../engine/types';

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


export async function exportForGoodNotes(
  svgs: string[],
  title: string,
  opts: { scale: number; size: RasterSize; paperColor: string; format: PageFormat },
): Promise<void> {
  const safe = title.trim().toLowerCase().replace(/[^\wäöüÄÖÜß-]+/g, '-').replace(/-+/g, '-').slice(0, 60) || 'handschrift';
  await exportPagesPdf(svgs, {
    filename: `goodnotes-${safe}.pdf`,
    title: `${title} (GoodNotes)`,
    transparent: false,
    scale: opts.scale,
    size: opts.size,
    paperColor: opts.paperColor,
    format: opts.format,
  });
}

export function stampFilename(title: string): string {
  const safe = title.trim().toLowerCase().replace(/[^\wäöüÄÖÜß-]+/g, '-').replace(/-+/g, '-').slice(0, 60) || 'handschrift';
  const date = new Date().toISOString().slice(0, 10);
  return `${safe}-${date}`;
}
