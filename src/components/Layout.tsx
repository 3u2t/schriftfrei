import { useEffect, useState } from 'react';
import { Brush, FileText, Home, PenLine, Settings, Type } from 'lucide-react';
import { cn } from '../utils/cn';
import { navigate, currentRoute } from '../utils/router';

const ITEMS = [
  { route: 'home', label: 'Start', icon: Home },
  { route: 'editor', label: 'Erstellen', icon: PenLine },
  { route: 'glyphs', label: 'Schrift', icon: Brush },
  { route: 'fonts', label: 'Schriften', icon: Type },
  { route: 'documents', label: 'Dokumente', icon: FileText },
  { route: 'settings', label: 'Mehr', icon: Settings },
] as const;

export default function Layout({ children }: { children: React.ReactNode }) {
  const [route, setRoute] = useState(currentRoute());
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    const onHash = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem('schriftfrei-theme', dark ? 'dark' : 'light');
    } catch {

    }
  }, [dark]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {}
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <button onClick={() => navigate('home')} className="flex items-center gap-2.5" aria-label="Zur Startseite">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900">
              <PenLine size={18} />
            </span>
            <span className="text-[17px] font-bold tracking-tight">Schriftfrei</span>
          </button>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Hauptnavigation">
            <NavBtn active={route === 'editor'} onClick={() => navigate('editor')}>Erstellen</NavBtn>
            <NavBtn active={route === 'fonts'} onClick={() => navigate('fonts')}>Schriften</NavBtn>
            <NavBtn active={route === 'glyphs'} onClick={() => navigate('glyphs')}>Meine Handschrift</NavBtn>
            <NavBtn active={route === 'documents'} onClick={() => navigate('documents')}>Dokumente</NavBtn>
            <NavBtn active={route === 'settings'} onClick={() => navigate('settings')}>Einstellungen</NavBtn>
          </nav>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDark((d) => !d)}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-lg dark:border-slate-700"
              aria-label={dark ? 'Zum hellen Modus wechseln' : 'Zum dunklen Modus wechseln'}
            >
              {dark ? '☀️' : '🌙'}
            </button>
            <button
              onClick={() => navigate('editor')}
              className="hidden min-h-[44px] items-center rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white dark:bg-white dark:text-slate-900 md:inline-flex"
            >
              Erstellen
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 md:pb-16">{children}</main>

      {}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 md:hidden" aria-label="Mobile Navigation">
        <div className="grid grid-cols-6">
          {ITEMS.map((it) => {
            const active = route === it.route || (it.route === 'settings' && route === 'onboarding');
            const Icon = it.icon;
            return (
              <button
                key={it.route}
                onClick={() => navigate(it.route)}
                className={cn('flex min-h-[60px] flex-col items-center justify-center gap-1 text-[11px] font-medium', active ? 'text-slate-900 dark:text-white' : 'text-slate-400')}
                aria-current={active ? 'page' : undefined}
              >
                <Icon size={21} />
                {it.label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function NavBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'min-h-[44px] rounded-xl px-4 text-sm font-medium transition',
        active ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-900',
      )}
    >
      {children}
    </button>
  );
}
