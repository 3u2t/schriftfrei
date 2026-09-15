import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, FileType, PenLine, Plus, RotateCcw, Scaling, Trash2 } from 'lucide-react';
import InkCanvas, { type InkCanvasHandle } from '../canvas/InkCanvas';
import PointerModePicker from '../components/PointerModePicker';
import FontStripPreview from '../components/FontStripPreview';
import { Button, Card, Empty, ProgressBar, Slider } from '../components/ui';
import { isEmptyInk, strokeToPath, strokesToGlyphVariant } from '../engine/normalize';
import { demoGlyphFor } from '../engine/demoGenerator';
import { normalizeProportions, scaleCharMap } from '../engine/rescale';
import { downloadTtf } from '../export/fontExport';
import type { GlyphVariant, InkStroke, PointerMode } from '../engine/types';
import { ALL_TRAIN_CHARS, DIGITS, LOWER, SIGNS, UPPER } from '../training/charset';
import { deleteProfile, saveProfile } from '../storage/db';
import { useApp } from '../state/AppContext';
import { navigate } from '../utils/router';
import { cn } from '../utils/cn';

function MiniGlyph({ variant, missing }: { variant: GlyphVariant; missing?: boolean }) {
  const W = 56;
  const H = 72;
  if (variant.filled) {
    const tokens = variant.filled.trim().split(/\s+/);
    let i = 0;
    const num = (): number => {
      const v = Number(tokens[i++]);
      return Number.isFinite(v) ? v : 0;
    };
    const sx = (x: number) => 4 + x * (W - 8);
    const sy = (y: number) => 2 + y * (H - 4);
    const out: string[] = [];
    while (i < tokens.length) {
      const cmd = tokens[i++];
      if (cmd === 'M' || cmd === 'L') {
        const x = num();
        const y = num();
        out.push(`${cmd} ${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`);
      } else if (cmd === 'Q') {
        const x1 = num();
        const y1 = num();
        const x = num();
        const y = num();
        out.push(`Q ${sx(x1).toFixed(1)} ${sy(y1).toFixed(1)} ${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`);
      } else if (cmd === 'C') {
        const x1 = num();
        const y1 = num();
        const x2 = num();
        const y2 = num();
        const x = num();
        const y = num();
        out.push(`C ${sx(x1).toFixed(1)} ${sy(y1).toFixed(1)} ${sx(x2).toFixed(1)} ${sy(y2).toFixed(1)} ${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`);
      } else if (cmd === 'Z') {
        out.push('Z');
      } else {
        break;
      }
    }
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[72px] w-[56px]" aria-hidden="true">
        <rect x="0" y="0" width={W} height={H} rx="10" fill={missing ? '#f1f5f9' : '#ffffff'} />
        <path d={out.join(' ')} fill={missing ? '#94a3b8' : '#1c2742'} fillOpacity={missing ? 0.6 : 1} />
      </svg>
    );
  }
  const paths = variant.strokes
    .map((s) => {
      if (s.points.length < 2) return '';
      const d = strokeToPath(s.points, (x) => 6 + x * (W - 12), (y) => 4 + y * (H - 8));
      return `<path d="${d}" fill="none" stroke="${missing ? '#94a3b8' : '#1c2742'}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${missing ? '4 3' : 'none'}"/>`;
    })
    .join('');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[72px] w-[56px]" aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: `<rect x="0" y="0" width="${W}" height="${H}" rx="10" fill="${missing ? '#f1f5f9' : '#ffffff'}"/>${paths}` }} />
  );
}

const GROUPS: { title: string; chars: string[] }[] = [
  { title: 'Kleinbuchstaben', chars: LOWER },
  { title: 'Großbuchstaben', chars: UPPER },
  { title: 'Zahlen', chars: DIGITS },
  { title: 'Zeichen', chars: SIGNS },
];

export default function GlyphsPage() {
  const { profile, loading, reloadProfile, setActiveProfile } = useApp();
  const [selected, setSelected] = useState<string | null>(null);
  const [strokes, setStrokes] = useState<InkStroke[]>([]);
  const [canvasKey, setCanvasKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pointerMode, setPointerMode] = useState<PointerMode>('stylus');
  const [rescale, setRescale] = useState(1);
  const [propMsg, setPropMsg] = useState<string | null>(null);
  const apiRef = useRef<InkCanvasHandle | null>(null);
  const rescaledPreview = useMemo(
    () => (!profile || rescale === 1 ? profile : { ...profile, glyphs: scaleCharMap(profile.glyphs, rescale) }),
    [profile, rescale],
  );

  if (loading) return <p className="py-16 text-center text-sm text-slate-400">Wird geladen …</p>;
  if (!profile) {
    return (
      <div className="mx-auto max-w-2xl pt-8">
        <Empty title="Kein Handschriftprofil" hint="Erstelle zuerst dein Profil im Onboarding." action={<Button onClick={() => navigate('onboarding')}>Zum Onboarding</Button>} />
      </div>
    );
  }

  const covered = ALL_TRAIN_CHARS.filter((c) => (profile.glyphs[c]?.length ?? 0) > 0).length;

  const persist = async (patch: Partial<typeof profile>) => {
    const next = { ...profile, ...patch, updatedAt: Date.now() };
    await saveProfile(next);
    await reloadProfile();
  };

  const addVariant = () => {
    if (!selected) return;
    if (isEmptyInk(strokes)) {
      setError('Bitte schreibe zuerst das Zeichen.');
      return;
    }
    const v = strokesToGlyphVariant(strokes);
    if (!v) {
      setError('Nicht erkannt – bitte noch einmal schreiben.');
      return;
    }
    const list = [...(profile.glyphs[selected] ?? []), v].slice(0, 5);
    void persist({ glyphs: { ...profile.glyphs, [selected]: list } });
    setStrokes([]);
    setCanvasKey((k) => k + 1);
    setError(null);
  };

  const removeVariant = (idx: number) => {
    if (!selected) return;
    const list = (profile.glyphs[selected] ?? []).filter((_, i) => i !== idx);
    const glyphs = { ...profile.glyphs };
    if (list.length === 0) delete glyphs[selected];
    else glyphs[selected] = list;
    void persist({ glyphs });
  };

  const resetProfile = async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    await deleteProfile(profile.id);
    await setActiveProfile(null);
    await reloadProfile();
    navigate('home');
  };

  const selVariants = selected ? profile.glyphs[selected] ?? [] : [];

  const applyRescale = () => {
    if (rescale === 1) return;
    void persist({ glyphs: scaleCharMap(profile.glyphs, rescale) });
    setRescale(1);
  };

  return (
    <div className="anim-fade-up no-select" onContextMenu={(e) => e.preventDefault()}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex-1">
          <h1 className="text-xl font-extrabold tracking-tight">Meine Handschrift</h1>
          <p className="text-xs text-slate-400">{profile.name} · {covered} von {ALL_TRAIN_CHARS.length} Zeichen · {profile.coverage} % Profil</p>
        </div>
        <Button variant="secondary" onClick={() => navigate('onboarding')}><RotateCcw size={15} /> Training wiederholen</Button>
        <Button variant="secondary" onClick={() => downloadTtf(profile)} title="Deine Handschrift als installierbare Schriftdatei laden (für Word, GoodNotes, iPad …)"><FileType size={15} /> Als Schrift laden (.otf)</Button>
        <Button variant="secondary" onClick={() => navigate('editor')}><PenLine size={15} /> Zum Editor</Button>
      </div>
      <div className="mb-4"><ProgressBar value={profile.coverage} /></div>

      {GROUPS.map((g) => (
        <section key={g.title} className="mb-5">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">{g.title}</h2>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-9">
            {g.chars.map((ch) => {
              const n = profile.glyphs[ch]?.length ?? 0;
              return (
                <button
                  key={ch}
                  onClick={() => { setSelected(ch); setStrokes([]); setCanvasKey((k) => k + 1); setError(null); }}
                  className={cn(
                    'flex min-h-[104px] flex-col items-center gap-1 rounded-2xl border bg-white p-1.5 shadow-sm dark:bg-slate-900',
                    n === 0 ? 'border-dashed border-amber-300 dark:border-amber-700' : 'border-slate-200 dark:border-slate-700',
                    selected === ch && 'ring-2 ring-slate-900 dark:ring-white',
                  )}
                  aria-label={`Zeichen ${ch} bearbeiten, ${n} Varianten`}
                >
                  <MiniGlyph variant={n > 0 ? profile.glyphs[ch][0] : demoGlyphFor(ch)} missing={n === 0} />
                  <span className="text-xs font-bold">{ch} <span className={cn('font-medium', n === 0 ? 'text-amber-600' : 'text-slate-400')}>· {n}×</span></span>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      <Card className="mb-5">
        <h2 className="flex items-center gap-2 font-bold"><Scaling size={17} /> Größe anpassen</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Schrift zu groß oder zu klein? Skaliert <b>alle Zeichen auf einmal</b> – kein Neu-Training nötig.
          Tipp: Auf liniertem Papier rastet der Text zusätzlich automatisch auf den Linien ein.
        </p>
        <div className="mt-3">
          <Slider label="Schriftgröße" valueText={`${Math.round(rescale * 100)} %`} min={0.5} max={1.5} step={0.05} value={rescale} onChange={(e) => setRescale(Number(e.target.value))} />
        </div>
        {rescale !== 1 && (
          <div className="mt-2 overflow-hidden rounded-xl">
            <FontStripPreview text={'Hallo Welt!\nFranz jagt im Taxi quer durch Bayern.'} profile={rescaledPreview ?? profile} maxLines={2} />
          </div>
        )}
        <div className="mt-3 flex gap-2">
          <Button variant="secondary" onClick={() => setRescale(1)} className="flex-1">Zurücksetzen</Button>
          <Button onClick={applyRescale} disabled={rescale === 1} className="flex-1">
            <Check size={16} /> {Math.round(rescale * 100)} % übernehmen
          </Button>
        </div>
        <div className="mt-2">
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              const { glyphs, matched } = normalizeProportions(profile.glyphs);
              if (matched === 0) {
                setPropMsg('Keine angleichbaren Zeichen mit Größeninfo gefunden – das klappt für neu aufgenommene Buchstaben automatisch.');
              } else {
                void persist({ glyphs });
                setPropMsg(`${matched} Zeichen an die x-Höhe angeglichen – relative Größen stimmen jetzt.`);
              }
            }}
          >
            Proportionen angleichen (x-Höhe)
          </Button>
          {propMsg && <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{propMsg}</p>}
        </div>
      </Card>

      <Card>
        <h2 className="font-bold">Profil zurücksetzen</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Löscht dein Handschriftprofil unwiderruflich von diesem Gerät.</p>
        <Button variant="danger" onClick={resetProfile} className="mt-3">
          <Trash2 size={15} /> {confirmReset ? 'Wirklich löschen? Erneut tippen.' : 'Profil zurücksetzen'}
        </Button>
        {confirmReset && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-600"><AlertTriangle size={13} /> Dieser Vorgang kann nicht rückgängig gemacht werden.</p>
        )}
      </Card>

      {}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/40 sm:items-center sm:p-6" onClick={() => setSelected(null)} role="dialog" aria-modal="true" aria-label={`Zeichen ${selected} bearbeiten`}>
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl dark:bg-slate-900 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-extrabold">Buchstaben bearbeiten: <span className="rounded-lg bg-slate-900 px-2 py-0.5 text-white dark:bg-white dark:text-slate-900">{selected}</span></h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Varianten verwalten – die Engine wählt bei der Generierung zufällig aus.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {selVariants.length === 0 && <p className="text-sm text-slate-400">Noch keine Variante – schreibe unten deine erste.</p>}
              {selVariants.map((v, i) => (
                <div key={i} className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 p-1.5 dark:border-slate-700">
                  <MiniGlyph variant={v} />
                  <button onClick={() => removeVariant(i)} className="flex min-h-[36px] items-center gap-1 px-2 text-xs font-medium text-red-600" aria-label={`Variante ${i + 1} löschen`}>
                    <Trash2 size={13} /> Nr. {i + 1}
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold"><Plus size={15} /> Neue Variante schreiben</p>
              <InkCanvas key={canvasKey} apiRef={apiRef} onChange={setStrokes} pointerMode={pointerMode} minHeight={220} />
              <div className="mt-2">
                <PointerModePicker value={pointerMode} onChange={setPointerMode} />
              </div>
              {error && <p className="mt-2 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => { apiRef.current?.clear(); setStrokes([]); }}>Löschen</Button>
                <Button onClick={addVariant} disabled={selVariants.length >= 5}>
                  <Check size={16} /> Variante speichern
                </Button>
              </div>
              {selVariants.length >= 5 && <p className="mt-1 text-xs text-slate-400">Maximum (5 Varianten) erreicht – lösche erst eine Variante.</p>}
            </div>
            <Button variant="ghost" onClick={() => setSelected(null)} className="mt-3 w-full">Schließen</Button>
          </div>
        </div>
      )}
    </div>
  );
}
