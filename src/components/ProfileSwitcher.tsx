import { useState } from 'react';
import { Check, ChevronDown, PenLine, Type } from 'lucide-react';
import FontStripPreview from './FontStripPreview';
import { Button } from './ui';
import { type HandwritingProfile } from '../engine/types';
import { listProfiles } from '../storage/db';
import { useApp } from '../state/AppContext';
import { navigate } from '../utils/router';
import { cn } from '../utils/cn';

export type ProfileKind = 'own' | 'template' | 'demo';

export function kindOfProfile(p: HandwritingProfile): ProfileKind {
  if (p.isDemo) return 'demo';
  if (p.isTemplate) return 'template';
  return 'own';
}

export const KIND_LABEL: Record<ProfileKind, string> = {
  own: 'Eigene',
  template: 'Vorlage',
  demo: 'Demo',
};

const KIND_STYLE: Record<ProfileKind, string> = {
  own: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  template: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  demo: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
};

export function KindBadge({ profile }: { profile: HandwritingProfile }) {
  const kind = kindOfProfile(profile);
  return (
    <span className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide', KIND_STYLE[kind])}>
      {KIND_LABEL[kind]}
    </span>
  );
}

const PREVIEW_TEXT = 'AaBbCcDdEe 123\nHallo Welt!';


export default function ProfileSwitcher() {
  const { profile, setActiveProfile, reloadProfile } = useApp();
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState<HandwritingProfile[]>([]);
  const [busy, setBusy] = useState(false);

  const openSwitcher = async () => {
    setProfiles(await listProfiles());
    setOpen(true);
  };

  const activate = async (p: HandwritingProfile) => {
    if (profile?.id === p.id) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      await setActiveProfile(p);
      await reloadProfile();
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  if (!profile) return null;

  return (
    <>
      <button
        onClick={() => void openSwitcher()}
        className="flex min-h-[48px] w-full items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-left shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
        aria-haspopup="dialog"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-extrabold dark:bg-slate-800">
          Aa
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-bold">Schrift: {profile.name}</span>
            <KindBadge profile={profile} />
          </span>
          <span className="block text-xs text-slate-400">Tippen zum Wechseln · {profile.coverage} % · lokal gespeichert</span>
        </span>
        <ChevronDown size={18} className="shrink-0 text-slate-400" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/40 sm:items-center sm:p-6"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Schrift wählen"
        >
          <div
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl dark:bg-slate-900 sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="flex items-center gap-2 text-lg font-extrabold"><Type size={20} /> Welche Schrift soll es sein?</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Wähle zwischen deiner eigenen Handschrift, fertigen Vorlagen und der Demo – jederzeit wechselbar.
            </p>
            <div className="mt-4 grid gap-3">
              {profiles.map((p) => {
                const active = profile.id === p.id;
                return (
                  <div
                    key={p.id}
                    className={cn(
                      'rounded-2xl border p-3',
                      active ? 'border-slate-900 dark:border-white' : 'border-slate-200 dark:border-slate-700',
                    )}
                  >
                    <div className="no-select overflow-hidden rounded-xl border border-slate-100 dark:border-slate-800">
                      <FontStripPreview text={PREVIEW_TEXT} profile={p} maxLines={2} />
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-sm font-bold">
                          {p.name} <KindBadge profile={p} />
                        </p>
                        <p className="text-xs text-slate-400">
                          {Object.keys(p.glyphs).length} Zeichen · {p.coverage} %
                        </p>
                      </div>
                      <Button
                        variant={active ? 'ghost' : 'secondary'}
                        disabled={busy || active}
                        onClick={() => void activate(p)}
                        className="min-h-[44px]"
                      >
                        {active ? <><Check size={15} /> Aktiv</> : 'Verwenden'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Button variant="secondary" onClick={() => { setOpen(false); navigate('onboarding'); }}>
                <PenLine size={15} /> Eigene erstellen
              </Button>
              <Button variant="secondary" onClick={() => { setOpen(false); navigate('fonts'); }}>
                <Type size={15} /> Vorlagen ansehen
              </Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>Schließen</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
