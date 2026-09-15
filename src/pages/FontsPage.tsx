import { useMemo, useRef, useState } from 'react';
import { Check, PenLine, Upload } from 'lucide-react';
import FontStripPreview from '../components/FontStripPreview';
import { Button, Card } from '../components/ui';
import { DEFAULT_SETTINGS } from '../engine/types';
import { FONT_STYLES, createStyleProfile, styleSampleText } from '../fonts/styles';
import { saveProfile } from '../storage/db';
import { kvSet } from '../storage/db';
import { fontFileToProfile } from '../storage/fontImport';
import { useApp } from '../state/AppContext';
import { navigate } from '../utils/router';

export default function FontsPage() {
  const { setActiveProfile, reloadProfile } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const previews = useMemo(() => {
    const map = new Map<string, ReturnType<typeof createStyleProfile>>();
    for (const s of FONT_STYLES) map.set(s.id, createStyleProfile(s.id));
    return map;
  }, []);

  const applyStyle = async (styleId: string) => {
    setBusy(styleId);
    try {
      const style = FONT_STYLES.find((s) => s.id === styleId) ?? FONT_STYLES[0];
      const profile = createStyleProfile(styleId);
      await saveProfile(profile);
      await setActiveProfile(profile);
      await kvSet('pendingSettings', style.suggested);
      await reloadProfile();
      navigate('editor');
    } finally {
      setBusy(null);
    }
  };

  const onImportFont = async (f: File | undefined) => {
    if (!f) return;
    setImporting(true);
    setImportMsg(null);
    try {
      const { profile, imported, total } = await fontFileToProfile(f);
      await saveProfile(profile);
      await setActiveProfile(profile);
      await reloadProfile();
      setImportMsg({ ok: true, text: `„${profile.name}" importiert: ${imported} von ${total} Zeichen – jetzt als eigene Schrift aktiv.` });
    } catch (e) {
      setImportMsg({ ok: false, text: e instanceof Error ? e.message : 'Import fehlgeschlagen.' });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="mx-auto max-w-5xl anim-fade-up">
      <div className="mb-4 text-center">
        <h1 className="text-2xl font-extrabold tracking-tight">Fertige Schriften</h1>
        <p className="mx-auto mt-1 max-w-xl text-sm text-slate-500 dark:text-slate-400">
          Keine Lust auf Training? Wähle eine fertige Schrift – sofort einsatzbereit und danach unter „Meine Handschrift" weiter anpassbar.
          Oder importiere deine eigene Font-Datei (TTF/OTF) als eigene Schrift.
        </p>
      </div>
      <Card className="mb-4">
        <h2 className="flex items-center gap-2 font-bold"><Upload size={17} /> Eigene Handschrift importieren</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Font-Datei hochladen (.ttf, .otf, .woff) – wird lokal als eigene Schrift gespeichert und ist sofort im Editor nutzbar.
          Alles bleibt auf deinem Gerät.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff"
          className="hidden"
          onChange={(e) => void onImportFont(e.target.files?.[0])}
          aria-label="Font-Datei auswählen"
        />
        <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={importing || busy !== null} className="mt-3 w-full py-3">
          <Upload size={16} /> {importing ? 'Wird importiert …' : 'Font-Datei wählen (TTF/OTF)'}
        </Button>
        {importMsg && (
          <p className={`mt-2 rounded-xl px-3.5 py-2.5 text-sm ${importMsg.ok ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200'}`}>
            {importMsg.text}
          </p>
        )}
        {importMsg?.ok && (
          <Button onClick={() => navigate('editor')} className="mt-2 w-full py-3">
            <Check size={16} /> Jetzt im Editor verwenden
          </Button>
        )}
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {FONT_STYLES.map((s) => {
          const previewProfile = previews.get(s.id);
          if (!previewProfile) return null;
          return (
            <Card key={s.id} className="flex flex-col [contain-intrinsic-size:auto_380px] [content-visibility:auto]">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <h2 className="font-extrabold">{s.name}</h2>
                  <p className="text-xs text-slate-400">{s.desc}</p>
                </div>
              </div>
              <div className="no-select overflow-hidden rounded-xl border border-slate-100 dark:border-slate-800">
                <FontStripPreview
                  text={styleSampleText(s.name)}
                  profile={previewProfile}
                  settings={{ ...DEFAULT_SETTINGS, ...s.suggested }}
                  maxLines={3}
                />
              </div>
              <Button onClick={() => void applyStyle(s.id)} disabled={busy !== null} className="mt-3 w-full py-3">
                {busy === s.id ? 'Wird übernommen …' : <><Check size={16} /> {s.name} verwenden</>}
              </Button>
            </Card>
          );
        })}
      </div>
      <div className="mx-auto mt-4 max-w-2xl text-center">
        <Button variant="secondary" onClick={() => navigate('onboarding')} className="w-full py-3">
          <PenLine size={16} /> Lieber doch die eigene Handschrift trainieren
        </Button>
      </div>
    </div>
  );
}
