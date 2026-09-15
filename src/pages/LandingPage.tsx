import { useState } from 'react';
import { Check, Download, PenLine, ShieldCheck, Sparkles, TabletSmartphone, Type } from 'lucide-react';
import { Button, Card } from '../components/ui';
import { navigate } from '../utils/router';
import { createDemoProfile } from '../engine/demoGenerator';
import { saveProfile } from '../storage/db';
import { useApp } from '../state/AppContext';

const BENEFITS = [
  { icon: Check, text: 'Komplett kostenlos – keine Paywall, keine Credits' },
  { icon: PenLine, text: 'Deine eigene Handschrift, trainiert von dir' },
  { icon: TabletSmartphone, text: 'Funktioniert auf iPad mit Apple Pencil' },
  { icon: Type, text: 'Überschriften, Listen, Fett & Kursiv, Blocksatz' },
  { icon: Download, text: 'PDF, Bild, SVG, GoodNotes – und als Schriftdatei (.otf)' },
  { icon: Sparkles, text: 'Stiftfarben, Stifttypen & Papierformate wie bei Profi-Tools' },
];

export default function LandingPage() {
  const { setActiveProfile } = useApp();
  const [busy, setBusy] = useState(false);

  const useDemo = async () => {
    setBusy(true);
    try {
      const demo = createDemoProfile();
      await saveProfile(demo);
      await setActiveProfile(demo);
      navigate('editor');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="anim-fade-up">
      {}
      <section className="mx-auto max-w-3xl px-2 pb-10 pt-10 text-center md:pt-16">
        <p className="anim-fade-up mb-4 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          <Sparkles size={14} /> Kostenlos · Lokal · Ohne Anmeldung
        </p>
        <h1 className="anim-fade-up-1 text-4xl font-extrabold tracking-tight md:text-6xl">
          Dein Text.
          <br />
          Deine Handschrift.
        </h1>
        <p className="anim-fade-up-2 mx-auto mt-4 max-w-xl text-base text-slate-500 dark:text-slate-400 md:text-lg">
          Verwandle jeden digitalen Text in deine eigene Handschrift – kostenlos.
        </p>
        <div className="anim-fade-up-2 mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button onClick={() => navigate('onboarding')} className="w-full px-8 py-3.5 text-base sm:w-auto">
            Handschrift erstellen
          </Button>
          <Button variant="secondary" onClick={useDemo} disabled={busy} className="w-full px-8 py-3.5 text-base sm:w-auto">
            {busy ? 'Wird geladen …' : 'Demo-Handschrift verwenden'}
          </Button>
        </div>
        <ul className="mx-auto mt-8 grid max-w-2xl gap-2 text-left sm:grid-cols-2">
          {BENEFITS.map((b) => (
            <li key={b.text} className="flex items-start gap-2.5 rounded-xl bg-white px-3.5 py-3 text-sm shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-900 dark:ring-slate-800">
              <b.icon size={17} className="mt-0.5 shrink-0 text-slate-700 dark:text-slate-200" />
              <span className="text-slate-600 dark:text-slate-300">{b.text}</span>
            </li>
          ))}
        </ul>
      </section>

      {}
      <section className="mx-auto grid max-w-5xl gap-4 md:grid-cols-3">
        {[
          { n: '1', t: 'Handschrift trainieren', d: 'Schreibe Buchstaben, Zahlen und Sätze einmalig mit Finger, Maus oder Apple Pencil.' },
          { n: '2', t: 'Text einfügen', d: 'Jeder digitale Text wird live in deine persönliche Handschrift verwandelt.' },
          { n: '3', t: 'Exportieren', d: 'Mehrseitige Dokumente als PNG, JPG, SVG, PDF – oder optimiert für GoodNotes.' },
        ].map((s) => (
          <Card key={s.n}>
            <p className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-sm font-bold text-white dark:bg-white dark:text-slate-900">{s.n}</p>
            <h2 className="mt-3 font-bold">{s.t}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{s.d}</p>
          </Card>
        ))}
      </section>

      {}
      <section className="mx-auto mt-4 max-w-5xl">
        <Card className="flex items-start gap-3">
          <ShieldCheck size={22} className="mt-0.5 shrink-0 text-emerald-600" />
          <div>
            <h2 className="font-bold">Deine Handschrift bleibt auf deinem Gerät.</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Alle Profile werden lokal im Browser (IndexedDB) gespeichert. Es gibt keine Registrierung, keine Cloud und keine
              Übertragung deiner Handschriftdaten an Server. Die Kernfunktionen arbeiten offline.
            </p>
          </div>
        </Card>
      </section>

      <footer className="mx-auto max-w-5xl px-2 pb-6 pt-10 text-center text-xs text-slate-400">
        Schriftfrei – die kostenlose Handschrift-App. Alle Daten bleiben lokal auf deinem Gerät.
        <span className="mt-1 block">Hinweis: Diese Seite zählt Besuche (IP, Browser, grobe Region) für einfache Statistiken – keine Cookies, kein Fingerprinting, keine Werbung.</span>
      </footer>
    </div>
  );
}
