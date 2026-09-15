import { useEffect, useState } from 'react';
import { Copy, FileDown, FolderOpen, Plus, Trash2 } from 'lucide-react';
import { Button, Card, Empty } from '../components/ui';
import type { TextDocument } from '../engine/types';
import { getPageDims, migrateSettings, uid } from '../engine/types';
import { DEFAULT_SETTINGS } from '../engine/types';
import { layoutPages } from '../engine/layout';
import { buildAllPageSvgs } from '../components/PageViewer';
import { exportPagesPdf, stampFilename } from '../export/exporters';
import { deleteDocument, kvSet, listDocuments, saveDocument } from '../storage/db';
import { useApp } from '../state/AppContext';
import { navigate } from '../utils/router';

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function DocumentsPage() {
  const { profile } = useApp();
  const [docs, setDocs] = useState<TextDocument[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => setDocs(await listDocuments());
  useEffect(() => {
    void refresh();
  }, []);

  const openDoc = async (id: string) => {
    await kvSet('currentDocId', id);
    navigate('editor');
  };

  const newDoc = async () => {
    const d: TextDocument = { id: uid('doc'), title: 'Unbenanntes Dokument', text: '', settings: DEFAULT_SETTINGS, updatedAt: Date.now() };
    await saveDocument(d);
    await kvSet('currentDocId', d.id);
    navigate('editor');
  };

  const duplicate = async (d: TextDocument) => {
    const copy: TextDocument = { ...d, id: uid('doc'), title: `${d.title} (Kopie)`, updatedAt: Date.now(), settings: { ...d.settings }, customPaperDataUrl: d.customPaperDataUrl };
    await saveDocument(copy);
    await refresh();
  };

  const quickExport = async (d: TextDocument) => {
    if (!profile) return;
    setBusy(d.id);
    setError(null);
    try {
      const s = migrateSettings(d.settings);
      const svgs = buildAllPageSvgs(d.text || ' ', profile, s, d.customPaperDataUrl);
      await exportPagesPdf(svgs, {
        filename: `${stampFilename(d.title)}.pdf`,
        title: d.title,
        transparent: !!s.transparentBg,
        scale: 2.5,
        size: getPageDims(s.pageFormat),
        paperColor: s.paperTint,
        format: s.pageFormat,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export fehlgeschlagen.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl anim-fade-up">
      <div className="mb-4 flex items-center gap-2">
        <h1 className="flex-1 text-xl font-extrabold tracking-tight">Meine Dokumente</h1>
        <Button onClick={newDoc}><Plus size={16} /> Neues Dokument</Button>
      </div>
      {error && <p className="mb-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>}
      {docs.length === 0 ? (
        <Empty
          title="Noch keine Dokumente"
          hint="Deine Dokumente werden automatisch beim Schreiben im Editor lokal gespeichert."
          action={<Button onClick={() => navigate('editor')}>Zum Editor</Button>}
        />
      ) : (
        <div className="grid gap-3">
          {docs.map((d) => {
            const pages = profile ? layoutPages(d.text || ' ', profile, migrateSettings(d.settings)).length : 0;
            return (
              <Card key={d.id} className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{d.title || 'Unbenanntes Dokument'}</p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {fmtDate(d.updatedAt)} · {d.text.length} Zeichen{profile ? ` · ${pages} ${pages === 1 ? 'Seite' : 'Seiten'}` : ''}
                  </p>
                  {d.text && <p className="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{d.text.slice(0, 140)}</p>}
                </div>
                <div className="grid grid-cols-4 gap-1.5 sm:flex">
                  <IconBtn label="Öffnen" onClick={() => void openDoc(d.id)}><FolderOpen size={17} /></IconBtn>
                  <IconBtn label="Duplizieren" onClick={() => void duplicate(d)}><Copy size={17} /></IconBtn>
                  <IconBtn label={busy === d.id ? 'Exportiert …' : 'Exportieren (PDF)'} onClick={() => void quickExport(d)}><FileDown size={17} /></IconBtn>
                  <IconBtn label="Löschen" danger onClick={() => void (async () => { await deleteDocument(d.id); await refresh(); })()}><Trash2 size={17} /></IconBtn>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <p className="mt-4 text-center text-xs text-slate-400">Alle Dokumente bleiben lokal auf deinem Gerät – kein Server, keine Cloud.</p>
    </div>
  );
}

function IconBtn({ label, onClick, children, danger }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border transition ${
        danger
          ? 'border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950'
          : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
      }`}
    >
      {children}
    </button>
  );
}
