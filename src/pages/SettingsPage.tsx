import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Database, Download, PenLine, ShieldCheck, Smartphone, Trash2, Upload } from 'lucide-react';
import { Button, Card } from '../components/ui';
import { KindBadge } from '../components/ProfileSwitcher';
import { clearAllData, deleteProfile, getProfile, listProfiles, saveProfile, storageEstimate } from '../storage/db';
import { downloadProfile, parseProfileFile } from '../storage/profileTransfer';
import type { HandwritingProfile } from '../engine/types';
import { uid } from '../engine/types';
import { useApp } from '../state/AppContext';
import { navigate } from '../utils/router';
import { cn } from '../utils/cn';

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function SettingsPage() {
  const { profile, setActiveProfile, reloadProfile } = useApp();
  const [profiles, setProfiles] = useState<HandwritingProfile[]>([]);
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [transferMsg, setTransferMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    setProfiles(await listProfiles());
    setStorage(await storageEstimate());
  };
  useEffect(() => {
    void refresh();
  }, []);

  const activate = async (p: HandwritingProfile) => {
    await setActiveProfile(p);
    await refresh();
  };

  const remove = async (p: HandwritingProfile) => {
    await deleteProfile(p.id);
    if (profile?.id === p.id) await setActiveProfile(null);
    await reloadProfile();
    await refresh();
  };

  const onImportFile = async (f: File | undefined) => {
    if (!f) return;
    setImporting(true);
    setTransferMsg(null);
    try {
      const text = await f.text();
      const parsed = parseProfileFile(text);

      if (await getProfile(parsed.id)) {
        parsed.id = uid('profile');
        parsed.name = `${parsed.name} (Import)`.slice(0, 80);
      }
      await saveProfile(parsed);
      await setActiveProfile(parsed);
      await reloadProfile();
      await refresh();
      setTransferMsg({ ok: true, text: `„${parsed.name}" importiert: ${Object.keys(parsed.glyphs).length} Zeichen, Profil ${parsed.coverage} %.` });
    } catch (e) {
      setTransferMsg({ ok: false, text: e instanceof Error ? e.message : 'Import fehlgeschlagen.' });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const wipe = async () => {
    if (!confirmWipe) {
      setConfirmWipe(true);
      return;
    }
    await clearAllData();
    try {
      localStorage.removeItem('schriftfrei-theme');
    } catch {

    }
    window.location.hash = '#/home';
    window.location.reload();
  };

  return (
    <div className="mx-auto max-w-3xl anim-fade-up">
      <h1 className="mb-4 text-xl font-extrabold tracking-tight">Einstellungen</h1>

      <Card className="mb-3">
        <h2 className="flex items-center gap-2 font-bold"><PenLine size={17} /> Handschriftprofile</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Aktivieren, wechseln, als Datei exportieren oder löschen. Alle Profile bleiben lokal.</p>
        <div className="mt-3 grid gap-2">
          {profiles.length === 0 && <p className="text-sm text-slate-400">Noch kein Profil vorhanden.</p>}
          {profiles.map((p) => (
            <div key={p.id} className={cn('flex items-center gap-2 rounded-xl border px-3.5 py-2.5', profile?.id === p.id ? 'border-slate-900 dark:border-white' : 'border-slate-200 dark:border-slate-700')}>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-sm font-bold">{p.name} <KindBadge profile={p} /></p>
                <p className="text-xs text-slate-400">{Object.keys(p.glyphs).length} Zeichen · {p.coverage} % · {p.variantsPerChar} {p.variantsPerChar === 1 ? 'Variante' : 'Varianten'}/Zeichen</p>
              </div>
              {profile?.id !== p.id && (
                <Button variant="secondary" onClick={() => void activate(p)} className="min-h-[40px] px-3 text-xs">Aktivieren</Button>
              )}
              <button onClick={() => downloadProfile(p)} className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" aria-label={`Profil ${p.name} als Datei exportieren`} title="Als Datei exportieren (.schriftfrei.json)">
                <Download size={16} />
              </button>
              <button onClick={() => void remove(p)} className="flex h-10 w-10 items-center justify-center rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-950" aria-label={`Profil ${p.name} löschen`}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
        <Button variant="secondary" onClick={() => navigate('onboarding')} className="mt-3 w-full">
          <PenLine size={15} /> Neues Profil / Training wiederholen
        </Button>
      </Card>

      <Card className="mb-3">
        <h2 className="flex items-center gap-2 font-bold"><Upload size={17} /> Sichern & Übertragen</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Exportiere deine Handschrift als Datei – zur Sicherung oder um sie auf ein anderes Gerät (z. B. iPad) zu übertragen.
          Zum Übertragen die Datei dort einfach hier wieder importieren.
        </p>
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => void onImportFile(e.target.files?.[0])} aria-label="Handschriftprofil-Datei auswählen" />
        <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={importing} className="mt-3 w-full">
          <Upload size={15} /> {importing ? 'Wird importiert …' : 'Handschrift importieren (.schriftfrei.json)'}
        </Button>
        {transferMsg && (
          <p className={`mt-2 rounded-xl px-3.5 py-2.5 text-sm ${transferMsg.ok ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200'}`}>
            {transferMsg.text}
          </p>
        )}
      </Card>

      <Card className="mb-3">
        <h2 className="flex items-center gap-2 font-bold"><ShieldCheck size={17} /> Datenschutz</h2>
        <p className="mt-2 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-sm font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          Deine Handschrift bleibt auf deinem Gerät.
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-500 dark:text-slate-400">
          <li>Speicherung ausschließlich lokal im Browser (IndexedDB).</li>
          <li>Keine Registrierung, keine Cloud, keine Übertragung von Handschriftdaten.</li>
          <li>Exporte (PNG/JPG/SVG/PDF/GoodNotes) werden lokal auf deinem Gerät erzeugt.</li>
        </ul>
      </Card>

      <Card className="mb-3">
        <h2 className="flex items-center gap-2 font-bold"><Database size={17} /> Speicher & Offline</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {storage ? `Belegt: ${fmtBytes(storage.usage)}${storage.quota ? ` von ca. ${fmtBytes(storage.quota)}` : ''}.` : 'Speicherbelegung konnte nicht ermittelt werden.'} Die App
          ist als PWA installierbar und arbeitet nach dem ersten Laden offline.
        </p>
        <p className="mt-2 flex items-start gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Smartphone size={16} className="mt-0.5 shrink-0" />
          iPad: Im Teilen-Menü von Safari „Zum Home-Bildschirm" wählen – danach startet Schriftfrei wie eine native App, ideal mit Apple Pencil.
        </p>
      </Card>

      <Card>
        <h2 className="flex items-center gap-2 font-bold"><Download size={17} /> Daten</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Alle lokalen Daten (Profile + Dokumente) unwiderruflich löschen.</p>
        <Button variant="danger" onClick={wipe} className="mt-3">
          <Trash2 size={15} /> {confirmWipe ? 'Wirklich alles löschen? Erneut tippen.' : 'Alle Daten löschen'}
        </Button>
        {confirmWipe && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-600"><AlertTriangle size={13} /> Kann nicht rückgängig gemacht werden.</p>
        )}
      </Card>
    </div>
  );
}
