import { useEffect, useMemo, useRef, useState } from 'react';
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, CalendarDays, ChevronLeft, ChevronRight, Clipboard, ClipboardList, Dices, Download, FileDown, FileUp, PenLine, Shuffle, Table as TableIcon } from 'lucide-react';
import PageViewer, { buildAllPageSvgs } from '../components/PageViewer';
import ProfileSwitcher from '../components/ProfileSwitcher';
import { Button, Card, Empty, Slider } from '../components/ui';
import type { Alignment, DocSettings, ExportQualityId, PageFormat, PaperKind, PenType, TextDocument } from '../engine/types';
import { DEFAULT_SETTINGS, EXPORT_QUALITIES, INK_COLORS, PAGE_FORMATS, PAPER_TINTS, PEN_TYPES, getPageDims, migrateSettings, uid } from '../engine/types';
import { countWords } from '../engine/markdown';
import { clampPageIndex, countMissingGlyphs, layoutPages } from '../engine/layout';
import { exportForGoodNotes, exportPageJpg, exportPagePng, exportPageSvg, exportPagesPdf, stampFilename } from '../export/exporters';
import { useApp } from '../state/AppContext';
import { getDocument, kvGet, kvSet, saveDocument } from '../storage/db';
import { createDemoProfile } from '../engine/demoGenerator';
import { saveProfile } from '../storage/db';
import { navigate } from '../utils/router';
import { cn } from '../utils/cn';

const PAPERS: { id: PaperKind; label: string }[] = [
  { id: 'blank', label: 'Weiß' },
  { id: 'lined', label: 'Liniert' },
  { id: 'grid', label: 'Kariert' },
  { id: 'college', label: 'Collegeblock' },
  { id: 'dotted', label: 'Punktiert' },
  { id: 'custom', label: 'Eigenes Papier' },
];

const ALIGNMENTS: { id: Alignment; label: string; Icon: typeof AlignLeft }[] = [
  { id: 'left', label: 'Linksbündig', Icon: AlignLeft },
  { id: 'center', label: 'Zentriert', Icon: AlignCenter },
  { id: 'right', label: 'Rechtsbündig', Icon: AlignRight },
  { id: 'justify', label: 'Blocksatz', Icon: AlignJustify },
];

const SAMPLE = '# Meine Notizen\n\nHallo, das ist ein **Test** meiner *eigenen* Handschrift.\n\n- Erster Punkt\n- Zweiter Punkt\n\n1. Schritt eins\n2. Schritt zwei';

export default function EditorPage() {
  const { profile, loading, setActiveProfile } = useApp();
  const [doc, setDoc] = useState<TextDocument | null>(null);
  const [text, setText] = useState('');
  const [title, setTitle] = useState('Unbenanntes Dokument');
  const [settings, setSettings] = useState<DocSettings>(DEFAULT_SETTINGS);
  const [customPaper, setCustomPaper] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(0);
  const [showExport, setShowExport] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [transparent, setTransparent] = useState(false);
  const [quality, setQuality] = useState<ExportQualityId>('hd');
  const [toolMsg, setToolMsg] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const txtRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);


  useEffect(() => {
    (async () => {
      const pending = await kvGet<Partial<DocSettings> | null>('pendingSettings', null);
      if (pending) await kvSet('pendingSettings', null);
      const applyPending = (s: DocSettings): DocSettings => (pending ? migrateSettings({ ...s, ...pending }) : migrateSettings(s));
      const curId = await kvGet<string | null>('currentDocId', null);
      if (curId) {
        const d = await getDocument(curId);
        if (d) {
          setDoc(d);
          setText(d.text);
          setTitle(d.title);
          setSettings(applyPending(d.settings));
          setCustomPaper(d.customPaperDataUrl);
          setTransparent(!!d.settings.transparentBg);
          return;
        }
      }
      const fresh: TextDocument = { id: uid('doc'), title: 'Unbenanntes Dokument', text: SAMPLE, settings: applyPending(DEFAULT_SETTINGS), updatedAt: Date.now() };
      setText(SAMPLE);
      setDoc(fresh);
      await kvSet('currentDocId', fresh.id);
    })();
  }, []);


  useEffect(() => {
    if (!doc) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const next: TextDocument = { ...doc, title, text, settings: { ...settings, transparentBg: transparent }, customPaperDataUrl: customPaper, updatedAt: Date.now() };
      setDoc(next);
      void saveDocument(next);
    }, 800);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };

  }, [text, title, settings, customPaper, transparent]);

  const pages = useMemo(() => (profile ? layoutPages(text || ' ', profile, settings) : []), [text, profile, settings]);
  const total = pages.length;
  const safePage = clampPageIndex(page, total);
  const missing = useMemo(() => countMissingGlyphs(pages), [pages]);
  const words = useMemo(() => countWords(text), [text]);
  const dims = getPageDims(settings.pageFormat);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const set = <K extends keyof DocSettings>(k: K, v: DocSettings[K]) => setSettings((s) => ({ ...s, [k]: v }));

  const useDemo = async () => {
    const demo = createDemoProfile();
    await saveProfile(demo);
    await setActiveProfile(demo);
  };

  const insertAtCursor = (snippet: string) => {
    const el = areaRef.current;
    if (!el) {
      setText((t) => t + snippet);
      return;
    }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = text.slice(0, start) + snippet + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + snippet.length, start + snippet.length);
    });
  };

  const insertDate = () => {
    const d = new Date().toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
    insertAtCursor(d);
  };

  const insertHomeworkHead = () => {
    setToolMsg(null);
    const d = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    insertAtCursor(`Name: ______  Klasse: ______\nFach: ______  Datum: ${d}\nThema: ______\n\n`);
    setPage(0);
  };

  const pasteFromClipboard = async () => {
    setToolMsg(null);
    try {
      if (!navigator.clipboard?.readText) {
        setToolMsg('Zwischenablage-Zugriff geht hier nicht – Text einfach direkt ins Feld kopieren (Strg+V).');
        return;
      }
      const t = await navigator.clipboard.readText();
      if (!t) {
        setToolMsg('Zwischenablage ist leer – erst z. B. in ChatGPT kopieren.');
        return;
      }
      insertAtCursor(t.slice(0, 60000));
      setPage(0);
    } catch {
      setToolMsg('Kein Zugriff – bitte im Browser erlauben oder direkt einfügen (Strg+V).');
    }
  };

  const insertTable = () => {
    insertAtCursor('\n| Spalte 1 | Spalte 2 | Spalte 3 |\n| --- | :---: | ---: |\n| Text | **fett** | 123 |\n| Text | *kursiv* | 456 |\n');
    setPage(0);
  };

  const onTxtFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const content = await f.text();
      setText(content.slice(0, 60000));
      setTitle(f.name.replace(/\.(txt|md|markdown)$/i, '').replace(/[-_]+/g, ' ').trim() || 'Importiertes Dokument');
      setPage(0);
    } catch {

    }
    if (txtRef.current) txtRef.current.value = '';
  };

  const onPaperFile = (f: File | undefined) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 1200;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
        setCustomPaper(c.toDataURL('image/jpeg', 0.85));
        setSettings((s) => ({ ...s, paper: 'custom' }));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(f);
  };

  const allSvgs = (): string[] => {
    if (!profile) return [];
    return buildAllPageSvgs(text, profile, { ...settings, transparentBg: transparent }, customPaper);
  };

  const rasterOpts = (q: ExportQualityId) => {
    const scale = EXPORT_QUALITIES.find((x) => x.id === q)?.scale ?? 2.5;
    return { scale, size: dims, paperColor: settings.paperTint };
  };

  const runExport = async (kind: string, fn: () => Promise<void> | void) => {
    setBusy(kind);
    setExportError(null);
    try {
      await fn();
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Export fehlgeschlagen.');
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <p className="py-16 text-center text-sm text-slate-400">Wird geladen …</p>;

  if (!profile) {
    return (
      <div className="mx-auto max-w-2xl pt-8">
        <Empty
          title="Noch keine Handschrift vorhanden"
          hint="Erstelle zuerst deine eigene Handschrift im Onboarding – oder teste die App sofort mit der Demo-Handschrift."
          action={
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={() => navigate('onboarding')}><PenLine size={16} /> Eigene Handschrift erstellen</Button>
              <Button variant="secondary" onClick={useDemo}>Demo-Handschrift verwenden</Button>
            </div>
          }
        />
      </div>
    );
  }

  const effectiveText = text;

  return (
    <div className="anim-fade-up">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-transparent text-xl font-extrabold tracking-tight outline-none placeholder:text-slate-300 dark:placeholder:text-slate-600"
            placeholder="Titel …"
            aria-label="Dokumenttitel"
          />
          <div className="mt-1.5 max-w-md">
            <ProfileSwitcher />
          </div>
        </div>
        <Button variant="secondary" onClick={() => setShowSettings((s) => !s)} aria-expanded={showSettings}>
          Einstellungen
        </Button>
        <Button onClick={() => setShowExport(true)}>
          <Download size={16} /> Exportieren
        </Button>
      </div>

      {missing > 0 && !profile.isDemo && (
        <button onClick={() => navigate('glyphs')} className="mb-3 w-full rounded-xl bg-blue-50 px-4 py-2.5 text-sm text-blue-800 ring-1 ring-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:ring-blue-800">
          {missing} {missing === 1 ? 'Zeichen fehlt' : 'Zeichen fehlen'} in deinem Profil und werden im Demo-Stil ergänzt – tippe hier, um sie nachzutrainieren.
        </button>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        {}
        <Card className="h-fit">
          <label className="text-sm font-semibold" htmlFor="editor-text">Text in Handschrift</label>
          <textarea
            ref={areaRef}
            id="editor-text"
            value={text}
            onChange={(e) => { setText(e.target.value); setPage(0); }}
            placeholder="Schreibe oder füge hier deinen Text ein …"
            rows={14}
            spellCheck
            lang="de-DE"
            className="mt-2 min-h-[280px] w-full resize-y rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 text-[15px] leading-relaxed outline-none placeholder:text-slate-400 focus:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:focus:border-slate-500"
          />
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
            <span className="tabular-nums">{words} {words === 1 ? 'Wort' : 'Wörter'} · {text.length} Zeichen · {total} {total === 1 ? 'Seite' : 'Seiten'}</span>
            <span className="ml-auto flex items-center gap-2">
              <button className="inline-flex min-h-[32px] items-center gap-1 font-medium hover:text-slate-600 dark:hover:text-slate-300" onClick={() => void pasteFromClipboard()} title="Text aus der Zwischenablage einfügen (z. B. aus ChatGPT)">
                <Clipboard size={13} /> Einfügen
              </button>
              <button className="inline-flex min-h-[32px] items-center gap-1 font-medium hover:text-slate-600 dark:hover:text-slate-300" onClick={insertDate} title="Aktuelles Datum einfügen">
                <CalendarDays size={13} /> Datum
              </button>
              <button className="inline-flex min-h-[32px] items-center gap-1 font-medium hover:text-slate-600 dark:hover:text-slate-300" onClick={insertHomeworkHead} title="Kopf für Hausaufgaben einfügen (Name, Klasse, Fach, Datum)">
                <ClipboardList size={13} /> Aufgaben-Kopf
              </button>
              <button className="inline-flex min-h-[32px] items-center gap-1 font-medium hover:text-slate-600 dark:hover:text-slate-300" onClick={() => txtRef.current?.click()} title="Textdatei importieren (.txt, .md)">
                <FileUp size={13} /> Import
              </button>
              <button className="inline-flex min-h-[32px] items-center gap-1 font-medium hover:text-slate-600 dark:hover:text-slate-300" onClick={insertTable} title="Leere Tabelle einfügen">
                <TableIcon size={13} /> Tabelle
              </button>
              <button className="inline-flex min-h-[32px] items-center gap-1 font-medium hover:text-slate-600 dark:hover:text-slate-300" onClick={() => { setText(SAMPLE); setPage(0); }}>
                <Shuffle size={13} /> Beispiel
              </button>
            </span>
          </div>
          {toolMsg && <p className="mt-1.5 rounded-xl bg-blue-50 px-3 py-2 text-[11px] font-medium text-blue-800 dark:bg-blue-950 dark:text-blue-200">{toolMsg}</p>}
          <input ref={txtRef} type="file" accept=".txt,.md,.markdown,text/plain" className="hidden" onChange={(e) => void onTxtFile(e.target.files?.[0])} aria-label="Textdatei importieren" />
          <p className="mt-1.5 rounded-xl bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-400 dark:bg-slate-900 dark:text-slate-500">
            Formatierung: <b># Überschrift</b> · <b>- Liste</b> · <b>- [ ] Checkliste</b> · <b>1. Nummeriert</b> · <b>**fett**</b> · <b>*kursiv*</b> · <b>~~durchgestrichen~~</b> · <b>__unterstrichen__</b> · <b>___ Lücke</b> (Arbeitsblatt) · <b>---</b> Trennlinie · <b>| Tabelle |</b> (z. B. aus ChatGPT einfügen)
          </p>

          {showSettings && (
            <div className="mt-4 space-y-5 border-t border-slate-100 pt-4 dark:border-slate-700">
              {}
              <div>
                <p className="mb-2 text-sm font-semibold">Stift & Tinte</p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {(Object.keys(PEN_TYPES) as PenType[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => set('penType', p)}
                      className={cn(
                        'min-h-[48px] rounded-xl border px-1 text-[11px] font-semibold',
                        settings.penType === p
                          ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                          : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900',
                      )}
                      aria-pressed={settings.penType === p}
                    >
                      {PEN_TYPES[p].label}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  {INK_COLORS.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => set('inkColor', c.value)}
                      title={c.label}
                      aria-label={`Tintenfarbe ${c.label}`}
                      aria-pressed={settings.inkColor === c.value}
                      className={cn(
                        'h-10 w-10 rounded-full ring-offset-2 ring-offset-white dark:ring-offset-slate-800',
                        settings.inkColor === c.value ? 'ring-2 ring-slate-900 dark:ring-white' : 'ring-1 ring-slate-200 dark:ring-slate-700',
                      )}
                      style={{ backgroundColor: c.value }}
                    />
                  ))}
                </div>
              </div>

              {}
              <div>
                <p className="mb-2 text-sm font-semibold">Seite & Ausrichtung</p>
                <div className="grid grid-cols-4 gap-2">
                  {ALIGNMENTS.map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      onClick={() => set('align', id as Alignment)}
                      title={label}
                      aria-label={label}
                      aria-pressed={settings.align === id}
                      className={cn(
                        'flex min-h-[48px] items-center justify-center rounded-xl border',
                        settings.align === id
                          ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                          : 'border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
                      )}
                    >
                      <Icon size={18} />
                    </button>
                  ))}
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {(Object.keys(PAGE_FORMATS) as PageFormat[]).map((f) => (
                    <button
                      key={f}
                      onClick={() => { set('pageFormat', f); setPage(0); }}
                      className={cn(
                        'min-h-[44px] rounded-xl border px-1 text-[11px] font-semibold',
                        settings.pageFormat === f
                          ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                          : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900',
                      )}
                      aria-pressed={settings.pageFormat === f}
                    >
                      {PAGE_FORMATS[f].label}
                    </button>
                  ))}
                </div>
                <div className="mt-3">
                  <Slider label="Seitenränder" valueText={`${settings.margin}px`} min={24} max={140} step={2} value={settings.margin} onChange={(e) => set('margin', Number(e.target.value))} />
                </div>
              </div>

              {}
              <div className="grid gap-4 sm:grid-cols-2">
                <Slider label="Schriftgröße" valueText={`${settings.fontSize}px`} min={20} max={52} step={1} value={settings.fontSize} onChange={(e) => set('fontSize', Number(e.target.value))} />
                <Slider label="Zeilenabstand" valueText={settings.lineHeight.toFixed(2)} min={1.1} max={2.6} step={0.05} value={settings.lineHeight} onChange={(e) => set('lineHeight', Number(e.target.value))} />
                <Slider label="Buchstabenabstand" valueText={settings.letterGap.toFixed(2)} min={-0.1} max={0.6} step={0.02} value={settings.letterGap} onChange={(e) => set('letterGap', Number(e.target.value))} />
                <Slider label="Wortabstand" valueText={settings.wordGap.toFixed(2)} min={0.4} max={2} step={0.05} value={settings.wordGap} onChange={(e) => set('wordGap', Number(e.target.value))} />
                <Slider label="Strichstärke" valueText={settings.strokeWidth.toFixed(1)} min={0.5} max={3} step={0.1} value={settings.strokeWidth} onChange={(e) => set('strokeWidth', Number(e.target.value))} />
                <Slider label="Neigung" valueText={`${settings.slant.toFixed(0)}°`} min={-15} max={25} step={1} value={settings.slant} onChange={(e) => set('slant', Number(e.target.value))} />
                <Slider label="Natürlichkeit" valueText={`${Math.round(settings.naturalness)} %`} min={0} max={100} step={1} value={settings.naturalness} onChange={(e) => set('naturalness', Number(e.target.value))} />
                <Slider label="Zufälligkeit" valueText={`${Math.round(settings.randomness)} %`} min={0} max={100} step={1} value={settings.randomness} onChange={(e) => set('randomness', Number(e.target.value))} />
              </div>
              <Button variant="secondary" onClick={() => set('seed', Math.floor(Math.random() * 1e9))} className="w-full">
                <Dices size={16} /> Neu mischen (neue Varianten-Auswahl)
              </Button>

              {}
              <div>
                <p className="mb-2 text-sm font-semibold">Papier</p>
                <div className="grid grid-cols-3 gap-2">
                  {PAPERS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => (p.id === 'custom' ? fileRef.current?.click() : set('paper', p.id))}
                      className={cn(
                        'min-h-[48px] rounded-xl border px-2 text-xs font-semibold',
                        settings.paper === p.id
                          ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                          : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900',
                      )}
                      aria-pressed={settings.paper === p.id}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onPaperFile(e.target.files?.[0])} />
                {settings.paper === 'custom' && !customPaper && (
                  <p className="mt-1 text-xs text-slate-400">Noch kein eigenes Papier gewählt – tippe auf „Eigenes Papier", um ein Bild hochzuladen.</p>
                )}
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-slate-400">Tönung:</span>
                  {PAPER_TINTS.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => set('paperTint', t.value)}
                      title={t.label}
                      aria-label={`Papierton ${t.label}`}
                      aria-pressed={settings.paperTint === t.value}
                      className={cn(
                        'h-9 w-9 rounded-full ring-offset-2 ring-offset-white dark:ring-offset-slate-800',
                        settings.paperTint === t.value ? 'ring-2 ring-slate-900 dark:ring-white' : 'ring-1 ring-slate-300 dark:ring-slate-600',
                      )}
                      style={{ backgroundColor: t.value }}
                    />
                  ))}
                </div>
                {(settings.paper === 'lined' || settings.paper === 'college') && (
                  <label className="mt-2 flex min-h-[44px] cursor-pointer items-center gap-2.5 text-sm text-slate-600 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={settings.snapLines !== false}
                      onChange={(e) => set('snapLines', e.target.checked)}
                      className="h-5 w-5 accent-slate-900 dark:accent-white"
                    />
                    Text auf Linien einrasten (eine Zeile pro Linie)
                  </label>
                )}
              </div>
            </div>
          )}
        </Card>

        {}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">Vorschau <span className="font-normal text-slate-400">· {PAGE_FORMATS[settings.pageFormat].label}</span></p>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setPage((p) => clampPageIndex(p - 1, total))} disabled={safePage <= 0} className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900" aria-label="Vorherige Seite">
                <ChevronLeft size={18} />
              </button>
              <span className="min-w-[76px] text-center text-sm tabular-nums">Seite {safePage + 1} / {total}</span>
              <button onClick={() => setPage((p) => clampPageIndex(p + 1, total))} disabled={safePage >= total - 1} className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900" aria-label="Nächste Seite">
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
          <PageViewer text={effectiveText} profile={profile} settings={{ ...settings, transparentBg: transparent }} pageIndex={safePage} customPaperDataUrl={customPaper} darkInk={document.documentElement.classList.contains('dark')} />
          <p className="mt-2 text-center text-xs text-slate-400">Live-Vorschau – jede Eingabe wird sofort in Handschrift verwandelt.</p>
        </div>
      </div>

      {}
      {showExport && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6" onClick={() => setShowExport(false)} role="dialog" aria-modal="true" aria-label="Exportieren">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-6 shadow-xl dark:bg-slate-900 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="flex items-center gap-2 text-lg font-extrabold"><FileDown size={20} /> Exportieren</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Seite {safePage + 1} als Bild/SVG · alle {total} {total === 1 ? 'Seite' : 'Seiten'} als PDF ({PAGE_FORMATS[settings.pageFormat].label}). Kostenlos, ohne Limits.
            </p>
            <div className="mt-3">
              <p className="mb-1.5 text-sm font-semibold">Qualität</p>
              <div className="grid grid-cols-3 gap-2">
                {EXPORT_QUALITIES.map((q) => (
                  <button
                    key={q.id}
                    onClick={() => setQuality(q.id)}
                    className={cn(
                      'min-h-[44px] rounded-xl border text-xs font-semibold',
                      quality === q.id
                        ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                        : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900',
                    )}
                    aria-pressed={quality === q.id}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="mt-3 flex min-h-[44px] cursor-pointer items-center gap-2.5 text-sm">
              <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} className="h-5 w-5 accent-slate-900 dark:accent-white" />
              Transparenter Hintergrund (PNG & PDF)
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button variant="secondary" disabled={busy !== null} onClick={() => void runExport('png', async () => { const svgs = allSvgs(); await exportPagePng(svgs[safePage], `${stampFilename(title)}-s${safePage + 1}`, transparent, rasterOpts(quality)); })}>
                {busy === 'png' ? '…' : 'PNG (Seite)'}
              </Button>
              <Button variant="secondary" disabled={busy !== null} onClick={() => void runExport('jpg', async () => { const svgs = allSvgs(); await exportPageJpg(svgs[safePage], `${stampFilename(title)}-s${safePage + 1}`, rasterOpts(quality)); })}>
                {busy === 'jpg' ? '…' : 'JPG (Seite)'}
              </Button>
              <Button variant="secondary" disabled={busy !== null} onClick={() => void runExport('svg', () => { const svgs = allSvgs(); exportPageSvg(svgs[safePage], `${stampFilename(title)}-s${safePage + 1}`); })}>
                {busy === 'svg' ? '…' : 'SVG (Seite)'}
              </Button>
              <Button variant="secondary" disabled={busy !== null} onClick={() => void runExport('pdf', async () => { await exportPagesPdf(allSvgs(), { filename: `${stampFilename(title)}.pdf`, title, transparent, scale: rasterOpts(quality).scale, size: dims, paperColor: settings.paperTint, format: settings.pageFormat }); })}>
                {busy === 'pdf' ? '…' : `PDF (${total} ${total === 1 ? 'Seite' : 'Seiten'})`}
              </Button>
            </div>
            <Button disabled={busy !== null} onClick={() => void runExport('goodnotes', async () => { await exportForGoodNotes(allSvgs(), title); })} className="mt-2 w-full py-3.5">
              {busy === 'goodnotes' ? 'Wird erstellt …' : '📓 Für GoodNotes exportieren (Vektor-PDF)'}
            </Button>
            <p className="mt-2 text-xs text-slate-400">
              Vektor-PDF: bleibt beim Zoomen scharf, kleine Datei. Per „Freigeben → In GoodNotes öffnen" importieren – erscheint als Notizbuch-Seiten, denen du in GoodNotes Neues hinzufügen kannst. Hinweis: Importiertes bleibt Hintergrund – zum Radieren einzelner Striche nutze GoodNotes-eigene Stifte bzw. zum echten Bearbeiten die Schrift (.ttf) als Textfeld.
            </p>
            {exportError && <p className="mt-2 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{exportError}</p>}
            <Button variant="ghost" onClick={() => setShowExport(false)} className="mt-2 w-full">Schließen</Button>
          </div>
        </div>
      )}
    </div>
  );
}
