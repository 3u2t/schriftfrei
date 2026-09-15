import { openDB, type IDBPDatabase } from 'idb';
import type { HandwritingProfile, TextDocument } from '../engine/types';

const DB_NAME = 'schriftfrei-db';
const DB_VERSION = 1;

interface Schema {
  profiles: HandwritingProfile;
  documents: TextDocument;
  kv: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(d) {
        if (!d.objectStoreNames.contains('profiles')) d.createObjectStore('profiles', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('documents')) d.createObjectStore('documents', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv', { keyPath: 'key' });
      },
    });
  }
  return dbPromise;
}


export async function saveProfile(p: HandwritingProfile): Promise<void> {
  const d = await db();
  await d.put('profiles', { ...p, updatedAt: Date.now() } as Schema['profiles']);
}

export async function getProfile(id: string): Promise<HandwritingProfile | undefined> {
  const d = await db();
  return (await d.get('profiles', id)) as HandwritingProfile | undefined;
}

export async function listProfiles(): Promise<HandwritingProfile[]> {
  const d = await db();
  return ((await d.getAll('profiles')) as HandwritingProfile[]).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteProfile(id: string): Promise<void> {
  const d = await db();
  await d.delete('profiles', id);
}


export async function saveDocument(doc: TextDocument): Promise<void> {
  const d = await db();
  await d.put('documents', doc as Schema['documents']);
}

export async function getDocument(id: string): Promise<TextDocument | undefined> {
  const d = await db();
  return (await d.get('documents', id)) as TextDocument | undefined;
}

export async function listDocuments(): Promise<TextDocument[]> {
  const d = await db();
  return ((await d.getAll('documents')) as TextDocument[]).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteDocument(id: string): Promise<void> {
  const d = await db();
  await d.delete('documents', id);
}


export async function kvGet<T>(key: string, fallback: T): Promise<T> {
  try {
    const d = await db();
    const row = (await d.get('kv', key)) as { key: string; value: T } | undefined;
    return row ? row.value : fallback;
  } catch {
    return fallback;
  }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  const d = await db();
  await d.put('kv', { key, value });
}

export const KV_KEYS = {
  activeProfileId: 'activeProfileId',
  theme: 'theme',
} as const;


export async function clearAllData(): Promise<void> {
  if (dbPromise) {
    (await dbPromise).close();
    dbPromise = null;
  }
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}


export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (!('storage' in navigator) || !navigator.storage.estimate) return null;
    const e = await navigator.storage.estimate();
    return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
  } catch {
    return null;
  }
}
