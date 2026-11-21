/**
 * Encrypted offline storage for the secure viewer.
 *
 * Pages are encrypted with a non-extractable AES-GCM key kept in IndexedDB, so they are not
 * readable as files on disk and cannot be exported from the app. Every copy carries an expiry
 * (never later than the student's subscription) and is bound to the account that saved it.
 *
 * Honest limits: this is client-side enforcement. It stops casual copying and sharing; it cannot
 * stop someone who inspects the running page or photographs the screen. Watermarks on every page
 * make leaks traceable.
 */
import type { ViewerManifest } from '@/services/viewer';

const DB_NAME = 'sazu-offline';
const DB_VERSION = 1;
const LAST_USER_KEY = 'sazu-study-hub.offline-user.v1';

export interface OfflineItem {
  id: string; // `${userId}:${resourceId}`
  userId: number;
  resourceId: number;
  title: string;
  version: string;
  savedAt: string;
  expiresAt: string;
  watermark: string;
  kinds: Array<'image' | 'text'>;
  bytes: number;
}

interface StoredPage {
  id: string; // `${itemId}:${pageNumber}`
  iv: Uint8Array;
  data: ArrayBuffer;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('pages')) db.createObjectStore('pages', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('keys')) db.createObjectStore('keys', { keyPath: 'userId' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Offline storage is unavailable.'));
  });
}

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function getKey(db: IDBDatabase, userId: number): Promise<CryptoKey> {
  const existing = (await done(db.transaction('keys').objectStore('keys').get(userId))) as
    | { userId: number; key: CryptoKey }
    | undefined;
  if (existing) return existing.key;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const tx = db.transaction('keys', 'readwrite');
  tx.objectStore('keys').put({ userId, key });
  await txDone(tx);
  return key;
}

export function offlineSupported(): boolean {
  return typeof indexedDB !== 'undefined' && typeof crypto !== 'undefined' && !!crypto.subtle;
}

export function rememberOfflineUser(userId: number): void {
  try {
    localStorage.setItem(LAST_USER_KEY, String(userId));
  } catch {
    // storage may be blocked; offline library just won't know the user
  }
}

export function lastOfflineUser(): number | null {
  const raw = localStorage.getItem(LAST_USER_KEY);
  const value = raw ? Number(raw) : NaN;
  return Number.isFinite(value) ? value : null;
}

export const offlineStore = {
  async save(
    manifest: ViewerManifest,
    fetchPage: (pageNumber: number) => Promise<Blob>,
    onProgress?: (done: number, total: number) => void,
  ): Promise<OfflineItem> {
    if (!offlineSupported()) throw new Error('This browser does not support offline storage.');
    if (!manifest.offline_allowed || !manifest.offline_expires_at) {
      throw new Error('Offline access is not available for this material.');
    }
    const db = await openDb();
    try {
      const key = await getKey(db, manifest.user_id);
      const itemId = `${manifest.user_id}:${manifest.resource_id}`;
      const encrypted: StoredPage[] = [];
      let bytes = 0;
      for (const page of manifest.pages) {
        const blob = await fetchPage(page.number);
        const plain = await blob.arrayBuffer();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
        bytes += data.byteLength;
        encrypted.push({ id: `${itemId}:${page.number}`, iv, data });
        onProgress?.(encrypted.length, manifest.pages.length);
      }
      const item: OfflineItem = {
        id: itemId,
        userId: manifest.user_id,
        resourceId: manifest.resource_id,
        title: manifest.title,
        version: manifest.version,
        savedAt: new Date().toISOString(),
        expiresAt: manifest.offline_expires_at,
        watermark: manifest.watermark,
        kinds: manifest.pages.map((page) => page.kind),
        bytes,
      };
      // Write only after every page downloaded, so a dropped connection never leaves a half copy.
      await offlineStore.remove(itemId);
      const tx = db.transaction(['items', 'pages'], 'readwrite');
      tx.objectStore('items').put(item);
      for (const page of encrypted) tx.objectStore('pages').put(page);
      await txDone(tx);
      rememberOfflineUser(manifest.user_id);
      if (navigator.storage?.persist) void navigator.storage.persist();
      return item;
    } finally {
      db.close();
    }
  },

  async get(userId: number, resourceId: number): Promise<OfflineItem | null> {
    if (!offlineSupported()) return null;
    const db = await openDb();
    try {
      const item = (await done(db.transaction('items').objectStore('items').get(`${userId}:${resourceId}`))) as
        | OfflineItem
        | undefined;
      if (!item) return null;
      if (new Date(item.expiresAt).getTime() <= Date.now()) {
        db.close();
        await offlineStore.remove(item.id);
        return null;
      }
      return item;
    } finally {
      try {
        db.close();
      } catch {
        // already closed
      }
    }
  },

  async list(userId: number): Promise<OfflineItem[]> {
    if (!offlineSupported()) return [];
    await offlineStore.purgeExpired();
    const db = await openDb();
    try {
      const all = (await done(db.transaction('items').objectStore('items').getAll())) as OfflineItem[];
      return all.filter((item) => item.userId === userId).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    } finally {
      db.close();
    }
  },

  async readPage(item: OfflineItem, pageNumber: number): Promise<Blob> {
    const db = await openDb();
    try {
      const key = await getKey(db, item.userId);
      const stored = (await done(db.transaction('pages').objectStore('pages').get(`${item.id}:${pageNumber}`))) as
        | StoredPage
        | undefined;
      if (!stored) throw new Error('This offline page is missing. Save the material again.');
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: stored.iv as BufferSource }, key, stored.data);
      return new Blob([plain], { type: item.kinds[pageNumber - 1] === 'text' ? 'text/plain' : 'image/jpeg' });
    } finally {
      db.close();
    }
  },

  async remove(itemId: string): Promise<void> {
    if (!offlineSupported()) return;
    const db = await openDb();
    try {
      const pagesStore = db.transaction('pages').objectStore('pages');
      const keys = (await done(pagesStore.getAllKeys())) as string[];
      const tx = db.transaction(['items', 'pages'], 'readwrite');
      tx.objectStore('items').delete(itemId);
      for (const key of keys) if (String(key).startsWith(`${itemId}:`)) tx.objectStore('pages').delete(key);
      await txDone(tx);
    } finally {
      db.close();
    }
  },

  async purgeExpired(): Promise<void> {
    if (!offlineSupported()) return;
    const db = await openDb();
    let expired: OfflineItem[] = [];
    try {
      const all = (await done(db.transaction('items').objectStore('items').getAll())) as OfflineItem[];
      expired = all.filter((item) => new Date(item.expiresAt).getTime() <= Date.now());
    } finally {
      db.close();
    }
    for (const item of expired) await offlineStore.remove(item.id);
  },

  /** Called on sign-out so a shared device keeps nothing from the previous student. */
  async purgeAll(): Promise<void> {
    if (!offlineSupported()) return;
    const db = await openDb();
    try {
      const tx = db.transaction(['items', 'pages', 'keys'], 'readwrite');
      tx.objectStore('items').clear();
      tx.objectStore('pages').clear();
      tx.objectStore('keys').clear();
      await txDone(tx);
    } finally {
      db.close();
    }
    localStorage.removeItem(LAST_USER_KEY);
  },
};
