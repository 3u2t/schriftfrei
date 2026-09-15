import { useEffect, useRef, useState } from 'react';
import type { InkPoint, InkStroke, PointerMode } from '../engine/types';
import { countStrokes } from '../engine/normalize';

export interface InkCanvasHandle {
  clear: () => void;
  undo: () => void;
  getStrokes: () => InkStroke[];
}

interface Props {
  onChange?: (strokes: InkStroke[]) => void;

  pointerMode?: PointerMode;
  showGuides?: boolean;
  inkColor?: string;
  minHeight?: number;
  apiRef?: React.MutableRefObject<InkCanvasHandle | null>;
}

const MODE_HINT: Record<PointerMode, string> = {
  pen: 'Nur Stift + Maus · Handballen-Schutz an',
  stylus: 'Finger & Universal-Stift · Apple Pencil geht auch',
  all: 'Maus · Touch · Apple Pencil',
};


export default function InkCanvas({ onChange, pointerMode = 'all', showGuides = true, inkColor = '#1c2742', minHeight = 300, apiRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const strokesRef = useRef<InkStroke[]>([]);
  const currentRef = useRef<InkStroke | null>(null);
  const activePointerRef = useRef<number | null>(null);
  const [, force] = useState(0);

  const drawAll = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    if (showGuides) {
      ctx.strokeStyle = 'rgba(148,163,184,0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 6]);
      const base = rect.height * 0.78;
      ctx.beginPath();
      ctx.moveTo(12, base);
      ctx.lineTo(rect.width - 12, base);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(148,163,184,0.28)';
      const mid = rect.height * 0.4;
      ctx.beginPath();
      ctx.moveTo(12, mid);
      ctx.lineTo(rect.width - 12, mid);
      ctx.stroke();
    }

    ctx.strokeStyle = inkColor;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const all = currentRef.current ? [...strokesRef.current, currentRef.current] : strokesRef.current;
    for (const s of all) {
      const pts = s.points;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const w = 1.2 + (b.pressure || 0.5) * 3.2;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(a.x * rect.width, a.y * rect.height);
        ctx.lineTo(b.x * rect.width, b.y * rect.height);
        ctx.stroke();
      }
      if (pts.length === 1) {
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(pts[0].x * rect.width, pts[0].y * rect.height, 2, 0, Math.PI * 2);
        ctx.fillStyle = inkColor;
        ctx.fill();
      }
    }
  };

  useEffect(() => {
    drawAll();
    const onResize = () => drawAll();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);

  }, [showGuides, inkColor]);

  const emit = () => {
    onChange?.(strokesRef.current);
    force((n) => n + 1);
  };

  const pointFromEvent = (e: React.PointerEvent, t0: number): InkPoint => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
      t: performance.now() - t0,
      pressure: e.pressure && e.pressure > 0 ? Math.min(1, e.pressure) : e.pointerType === 'pen' ? 0.6 : 0.5,
      tiltX: typeof e.tiltX === 'number' ? e.tiltX : 0,
      tiltY: typeof e.tiltY === 'number' ? e.tiltY : 0,
    };
  };

  const startStroke = (e: React.PointerEvent) => {
    const kind = e.pointerType;
    if (pointerMode === 'pen' && kind !== 'pen' && kind !== 'mouse') return;


    if (currentRef.current && activePointerRef.current !== e.pointerId) {
      if (kind !== 'pen') return;
      currentRef.current = null;
      activePointerRef.current = null;
      drawAll();
    }
    try {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {

    }
    e.preventDefault();
    const t0 = performance.now();
    const tool = kind === 'pen' ? 'pen' : kind === 'mouse' ? 'mouse' : kind === 'touch' ? 'touch' : 'unknown';
    activePointerRef.current = e.pointerId;
    currentRef.current = { points: [pointFromEvent(e, t0)], tool };
    (currentRef.current as InkStroke & { _t0?: number })._t0 = t0;
    drawAll();
  };

  const moveStroke = (e: React.PointerEvent) => {
    const cur = currentRef.current;
    if (!cur || activePointerRef.current !== e.pointerId) return;
    e.preventDefault();
    const smoothTouch = pointerMode === 'stylus' && cur.tool === 'touch';
    const t0 = (cur as InkStroke & { _t0?: number })._t0 ?? performance.now();
    const evts = typeof e.nativeEvent.getCoalescedEvents === 'function' ? e.nativeEvent.getCoalescedEvents() : [e.nativeEvent];
    for (const ce of evts) {
      const pe = ce as PointerEvent;
      if (typeof pe.pointerId === 'number' && pe.pointerId !== e.pointerId) continue;
      const rect = canvasRef.current!.getBoundingClientRect();
      const last = cur.points[cur.points.length - 1];
      let nx = (pe.clientX - rect.left) / rect.width;
      let ny = (pe.clientY - rect.top) / rect.height;
      if (smoothTouch && last) {

        nx = (last.x + nx) / 2;
        ny = (last.y + ny) / 2;
      }
      if (last && Math.hypot(nx - last.x, ny - last.y) < 0.0012) continue;
      cur.points.push({
        x: nx,
        y: ny,
        t: performance.now() - t0,
        pressure: pe.pressure && pe.pressure > 0 ? Math.min(1, pe.pressure) : pe.pointerType === 'pen' ? 0.6 : 0.5,
        tiltX: typeof pe.tiltX === 'number' ? pe.tiltX : 0,
        tiltY: typeof pe.tiltY === 'number' ? pe.tiltY : 0,
      });
    }
    drawAll();
  };

  const endStroke = (e: React.PointerEvent) => {
    const cur = currentRef.current;
    if (!cur || activePointerRef.current !== e.pointerId) return;
    e.preventDefault();
    activePointerRef.current = null;
    if (cur.points.length === 1) {

      const p = cur.points[0];
      cur.points.push({ ...p, x: p.x + 0.004, t: p.t + 8 });
    }
    strokesRef.current.push(cur);
    currentRef.current = null;
    drawAll();
    emit();
  };

  const api: InkCanvasHandle = {
    clear: () => {
      strokesRef.current = [];
      currentRef.current = null;
      activePointerRef.current = null;
      drawAll();
      emit();
    },
    undo: () => {
      strokesRef.current.pop();
      drawAll();
      emit();
    },
    getStrokes: () => strokesRef.current,
  };
  (canvasRef as unknown as { __api?: InkCanvasHandle }).__api = api;
  if (apiRef) apiRef.current = api;

  const strokeCount = countStrokes(currentRef.current ? [...strokesRef.current, currentRef.current] : strokesRef.current);

  return (
    <div ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="ink-canvas block w-full rounded-2xl border border-slate-200 bg-white shadow-inner dark:border-slate-700 dark:bg-slate-900"
        style={{ height: minHeight }}
        onPointerDown={startStroke}
        onPointerMove={moveStroke}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onContextMenu={(e) => e.preventDefault()}
        aria-label="Schreibfläche – mit Maus, Finger oder Apple Pencil schreiben"
      />
      <div className="mt-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>{strokeCount} {strokeCount === 1 ? 'Strich' : 'Striche'} erkannt</span>
        <span>{MODE_HINT[pointerMode]}</span>
      </div>
    </div>
  );
}


export function emptyInkHandle(): InkCanvasHandle {
  return { clear: () => undefined, undo: () => undefined, getStrokes: () => [] };
}
