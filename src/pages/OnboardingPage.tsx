import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Eraser, PenLine, RotateCcw, SkipForward, Sparkles } from 'lucide-react';
import InkCanvas, { type InkCanvasHandle } from '../canvas/InkCanvas';
import PointerModePicker from '../components/PointerModePicker';
import { Button, Card, ProgressBar } from '../components/ui';
import { createEmptyProfile } from '../engine/demoGenerator';
import { isEmptyInk, strokesToGlyphVariant } from '../engine/normalize';
import { calibrateFromSentences } from '../engine/metrics';
import type { CharMap, HandwritingProfile, InkStroke, PointerMode } from '../engine/types';
import { ONBOARDING_STEPS, TRAIN_SENTENCES, coverageFor } from '../training/charset';
import { saveProfile } from '../storage/db';
import { useApp } from '../state/AppContext';
import { navigate } from '../utils/router';
import { cn } from '../utils/cn';

interface QueueItem {
  ch: string;
  variantNo: number;
  variantsTotal: number;
}

function buildQueue(chars: string[], variants: number): QueueItem[] {
  const q: QueueItem[] = [];
  for (const ch of chars) for (let v = 1; v <= variants; v++) q.push({ ch, variantNo: v, variantsTotal: variants });
  return q;
}

export default function OnboardingPage() {
  const { setActiveProfile, reloadProfile } = useApp();
  const [variants, setVariants] = useState<1 | 2 | 3 | 5>(2);
  const [started, setStarted] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [qi, setQi] = useState(0);
  const [sentIdx, setSentIdx] = useState(0);
  const [glyphs, setGlyphs] = useState<CharMap>({});
  const [samples, setSamples] = useState<InkStroke[][]>([]);
  const [sentencesDone, setSentencesDone] = useState<string[]>([]);
  const [strokes, setStrokes] = useState<InkStroke[]>([]);
  const [canvasKey, setCanvasKey] = useState(0);
  const [pointerMode, setPointerMode] = useState<PointerMode>('stylus');
  const [done, setDone] = useState<HandwritingProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const apiRef = useRef<InkCanvasHandle | null>(null);

  const step = ONBOARDING_STEPS[stepIdx];
  const queue: QueueItem[] = useMemo(
    () => (step.id === 'sentences' ? [] : buildQueue(step.chars, variants)),

    [stepIdx, started],
  );
  const target = step.id === 'sentences' ? null : queue[Math.min(qi, queue.length - 1)];

  const doneChars = useMemo(() => new Set(Object.keys(glyphs)), [glyphs]);
  const coverage = coverageFor(doneChars, sentencesDone.length, TRAIN_SENTENCES.length);
  const totalTargets = useMemo(() => {
    const chars = ONBOARDING_STEPS.slice(0, 3).reduce((n, s) => n + s.chars.length * variants, 0);
    return chars + TRAIN_SENTENCES.length;
  }, [variants]);
  const doneTargets = Object.values(glyphs).reduce((n, v) => n + v.length, 0) + sentencesDone.length;

  const resetCanvas = () => {
    setStrokes([]);
    setCanvasKey((k) => k + 1);
  };

  const saveGlyph = () => {
    if (!target || isEmptyInk(strokes)) {
      setError('Bitte schreibe zuerst das Zeichen auf die Fläche.');
      return;
    }
    setError(null);
    const variant = strokesToGlyphVariant(strokes);
    if (!variant) {
      setError('Das konnte nicht erkannt werden – bitte noch einmal schreiben.');
      return;
    }
    setGlyphs((g) => ({ ...g, [target.ch]: [...(g[target.ch] ?? []), variant] }));
    if (qi + 1 >= queue.length) {

      setStepIdx((s) => Math.min(3, s + 1));
      setQi(0);
    } else {
      setQi((i) => i + 1);
    }
    resetCanvas();
  };

  const skipGlyph = () => {
    setError(null);
    if (!target) return;
    if (qi + 1 >= queue.length) {
      setStepIdx((s) => Math.min(3, s + 1));
      setQi(0);
    } else {
      setQi((i) => i + 1);
    }
    resetCanvas();
  };

  const goBack = () => {
    setError(null);
    if (step.id === 'sentences') {
      if (sentIdx > 0) {
        setSentIdx((i) => i - 1);
        setSamples((s) => s.slice(0, -1));
        setSentencesDone((d) => d.slice(0, -1));
      } else {
        setStepIdx(2);
      }
    } else {
      backGlyph();
    }
    resetCanvas();
  };

  const backGlyph = () => {
    setError(null);
    if (qi > 0) {
      const prev = queue[qi - 1];
      setGlyphs((g) => {
        const list = [...(g[prev.ch] ?? [])];
        list.pop();
        const next = { ...g };
        if (list.length === 0) delete next[prev.ch];
        else next[prev.ch] = list;
        return next;
      });
      setQi((i) => i - 1);
      resetCanvas();
    } else if (stepIdx > 0) {
      setStepIdx((s) => s - 1);
      setQi(0);
      resetCanvas();
    }
  };

  const saveSentence = () => {
    if (isEmptyInk(strokes)) {
      setError('Bitte schreibe den Satz zuerst ab.');
      return;
    }
    setError(null);
    setSamples((s) => [...s, strokes]);
    const sent = TRAIN_SENTENCES[sentIdx];
    const nextDone = [...sentencesDone, sent];
    setSentencesDone(nextDone);
    if (sentIdx + 1 >= TRAIN_SENTENCES.length) {
      void finish(nextDone, [...samples, strokes]);
    } else {
      setSentIdx((i) => i + 1);
    }
    resetCanvas();
  };

  const skipSentence = () => {
    setError(null);
    if (sentIdx + 1 >= TRAIN_SENTENCES.length) {
      void finish(sentencesDone, samples);
    } else {
      setSentIdx((i) => i + 1);
    }
    resetCanvas();
  };

  const finish = async (doneSents: string[], allSamples: InkStroke[][]) => {
    setSaving(true);
    try {
      const profile = createEmptyProfile();
      profile.glyphs = glyphs;
      profile.variantsPerChar = variants;
      profile.sentenceSamples = allSamples;
      profile.sentencesDone = doneSents;
      profile.metrics = calibrateFromSentences(allSamples);
      profile.coverage = coverageFor(new Set(Object.keys(glyphs)), doneSents.length, TRAIN_SENTENCES.length);
      await saveProfile(profile);
      await setActiveProfile(profile);
      await reloadProfile();
      setDone(profile);
    } finally {
      setSaving(false);
    }
  };

  if (!started) {
    return (
      <div className="mx-auto max-w-2xl anim-fade-up">
        <Card>
          <p className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-200">
            <PenLine size={13} /> Handschrift-Onboarding
          </p>
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight">Trainiere deine persönliche Handschrift</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Schreibe Buchstaben, Zahlen und ein paar Sätze – mit Maus, Finger oder Apple Pencil. Das dauert wenige Minuten.
            Deine Daten bleiben dabei immer auf deinem Gerät.
          </p>
          <div className="mt-5">
            <p className="text-sm font-semibold">Varianten pro Zeichen</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Mehr Varianten = natürlicheres Schriftbild (Engine wählt zufällig).</p>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {([1, 2, 3, 5] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setVariants(v)}
                  className={cn(
                    'min-h-[48px] rounded-xl border text-sm font-bold',
                    variants === v
                      ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                      : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900',
                  )}
                  aria-pressed={variants === v}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <ol className="mt-5 space-y-2 text-sm">
            {ONBOARDING_STEPS.map((s, i) => (
              <li key={s.id} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3.5 py-2.5 dark:bg-slate-900">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-xs font-bold shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">{i + 1}</span>
                <span className="font-medium">{s.title}</span>
                <span className="ml-auto text-xs text-slate-400">{s.id === 'sentences' ? `${TRAIN_SENTENCES.length} Sätze` : `${s.chars.length} Zeichen × ${variants}`}</span>
              </li>
            ))}
          </ol>
          <Button onClick={() => setStarted(true)} className="mt-5 w-full py-3.5">
            Los geht's <ArrowRight size={17} />
          </Button>
          <Button variant="ghost" onClick={() => navigate('fonts')} className="mt-1 w-full">
            Keine Zeit? Fertige Schrift wählen
          </Button>
        </Card>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto max-w-2xl anim-fade-up">
        <Card className="text-center">
          <p className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200">
            <Check size={28} />
          </p>
          <h1 className="mt-4 text-2xl font-extrabold">Deine Handschrift ist bereit.</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {Object.keys(done.glyphs).length} Zeichen erfasst · {done.sentencesDone.length} Sätze · Profil: {done.coverage} %
          </p>
          <div className="mt-3"><ProgressBar value={done.coverage} /></div>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Button onClick={() => navigate('editor')} className="flex-1 py-3.5">Jetzt Text schreiben</Button>
            <Button variant="secondary" onClick={() => navigate('glyphs')} className="flex-1 py-3.5">Handschrift ansehen</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl anim-fade-up no-select" onContextMenu={(e) => e.preventDefault()}>
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Schritt {stepIdx + 1} von 4 · {step.title}
        </p>
        <h1 className="mt-1 text-xl font-extrabold tracking-tight">
          {step.id === 'sentences' ? 'Schreibe den Satz ab' : target ? (
            <>Schreibe hier den Buchstaben <span className="rounded-lg bg-slate-900 px-2.5 py-0.5 text-white dark:bg-white dark:text-slate-900">{target.ch}</span>{target.variantsTotal > 1 && <span className="ml-2 text-base font-semibold text-slate-400">Variante {target.variantNo} von {target.variantsTotal}</span>}</>
          ) : null}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{step.hint}</p>
        {step.id !== 'sentences' && target && '.:;!?,'.includes(target.ch) && (
          <p className="mt-1.5 rounded-xl bg-blue-50 px-3 py-2 text-[13px] font-medium text-blue-800 dark:bg-blue-950 dark:text-blue-200">
            Tipp: Einmal kurz antippen genügt – einen perfekten runden Punkt erzeugt die App automatisch.
          </p>
        )}
        {step.id !== 'sentences' && target && '-_/|+=()'.includes(target.ch) && (
          <p className="mt-1.5 rounded-xl bg-blue-50 px-3 py-2 text-[13px] font-medium text-blue-800 dark:bg-blue-950 dark:text-blue-200">
            Tipp: Einfach locker zeichnen – gerade Striche begradigt die App automatisch.
          </p>
        )}
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1"><ProgressBar value={(doneTargets / Math.max(1, totalTargets)) * 100} /></div>
          <span className="text-xs font-semibold tabular-nums text-slate-500">Profil: {coverage} %</span>
        </div>
        {step.id !== 'sentences' && (
          <p className="mt-1 text-xs text-slate-400">Zeichen {Math.min(qi + 1, queue.length)} von {queue.length} in diesem Schritt</p>
        )}
        {step.id === 'sentences' && (
          <p className="mt-1 text-xs text-slate-400">Satz {sentIdx + 1} von {TRAIN_SENTENCES.length}</p>
        )}
      </div>

      {step.id === 'sentences' && (
        <Card className="mb-3 border-slate-900/10 bg-slate-900/[0.03] dark:bg-white/[0.04]">
          <p className="text-[15px] font-medium leading-relaxed">„{TRAIN_SENTENCES[sentIdx]}“</p>
        </Card>
      )}

      <InkCanvas
        key={canvasKey}
        apiRef={apiRef}
        onChange={setStrokes}
        pointerMode={pointerMode}
        minHeight={step.id === 'sentences' ? 220 : 320}
      />

      <div className="mt-3">
        <PointerModePicker value={pointerMode} onChange={setPointerMode} />
      </div>

      {error && <p className="mt-2 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>}

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Button variant="secondary" onClick={goBack} aria-label="Zurück">
          <ArrowLeft size={16} /> Zurück
        </Button>
        <Button variant="secondary" onClick={() => { apiRef.current?.clear(); setStrokes([]); }} aria-label="Löschen und neu schreiben">
          <Eraser size={16} /> Löschen
        </Button>
        <Button variant="secondary" onClick={step.id === 'sentences' ? skipSentence : skipGlyph}>
          <SkipForward size={16} /> Weiter
        </Button>
        {step.id === 'sentences' ? (
          <Button onClick={saveSentence} disabled={saving}>
            {saving ? 'Speichert …' : sentIdx + 1 >= TRAIN_SENTENCES.length ? <><Sparkles size={16} /> Fertig</> : <><Check size={16} /> Sichern</>}
          </Button>
        ) : (
          <Button onClick={saveGlyph}>
            <Check size={16} /> Sichern
          </Button>
        )}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={() => { apiRef.current?.undo(); }}>
          <RotateCcw size={15} /> Letzten Strich zurück
        </Button>
        {step.id !== 'sentences' && (
          <Button variant="ghost" onClick={backGlyph}>Vorheriges Zeichen korrigieren</Button>
        )}
      </div>
      <p className="mt-3 text-center text-xs text-slate-400">„Weiter" überspringt ohne zu speichern · „Sichern" übernimmt deine Schreibweise · „Löschen" leert die Fläche</p>
    </div>
  );
}
