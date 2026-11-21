import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CloudDownload, CloudOff, Lock, ShieldCheck, Trash2, WifiOff } from 'lucide-react';
import { ApiError, getAccessToken } from '@/services/api';
import { viewerService, type ViewerManifest } from '@/services/viewer';
import {
  lastOfflineUser,
  offlineStore,
  offlineSupported,
  rememberOfflineUser,
  type OfflineItem,
} from '@/services/offline';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

type PageLoader = (pageNumber: number) => Promise<Blob>;

/** One page, fetched only when it scrolls near the screen. */
function ViewerPageView({ number, kind, load }: { number: number; kind: 'image' | 'text'; load: PageLoader }) {
  const holder = useRef<HTMLDivElement | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const node = holder.current;
    if (!node) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        load(number)
          .then(async (blob) => {
            if (cancelled) return;
            if (kind === 'text') setText(await blob.text());
            else {
              objectUrl = URL.createObjectURL(blob);
              setUrl(objectUrl);
            }
          })
          .catch((cause) => {
            if (!cancelled) setFailed(cause instanceof Error ? cause.message : 'This page could not be loaded.');
          });
      },
      { rootMargin: '900px 0px' },
    );
    observer.observe(node);
    return () => {
      cancelled = true;
      observer.disconnect();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [number, kind, load]);

  return (
    <div ref={holder} className="mx-auto w-full max-w-3xl min-h-[320px] bg-white shadow-soft rounded-lg overflow-hidden">
      {failed ? (
        <p className="p-6 text-sm text-red-700">{failed}</p>
      ) : url ? (
        <img
          src={url}
          alt={`Page ${number}`}
          draggable={false}
          className="block w-full h-auto select-none pointer-events-none"
        />
      ) : text !== null ? (
        <pre className="p-6 text-sm whitespace-pre-wrap break-words text-ink-800 select-none">{text}</pre>
      ) : (
        <div className="p-10 text-center text-xs text-ink-400">Loading page {number}…</div>
      )}
    </div>
  );
}

export function ResourceViewerPage() {
  const { id = '' } = useParams();
  const [searchParams] = useSearchParams();
  const wantsOffline = searchParams.get('offline') === '1';

  const [manifest, setManifest] = useState<ViewerManifest | null>(null);
  const [offlineItem, setOfflineItem] = useState<OfflineItem | null>(null);
  const [mode, setMode] = useState<'loading' | 'online' | 'offline'>('loading');
  const [error, setError] = useState<{ message: string; status: number } | null>(null);
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const resourceId = Number(id);

  const loadOffline = useCallback(async (): Promise<OfflineItem | null> => {
    const userId = manifest?.user_id ?? lastOfflineUser();
    if (userId === null || !offlineSupported()) return null;
    return offlineStore.get(userId, resourceId);
  }, [manifest, resourceId]);

  useEffect(() => {
    let active = true;
    (async () => {
      const fallbackToOffline = async (reason: { message: string; status: number }) => {
        const item = await loadOffline();
        if (!active) return;
        if (item) {
          setOfflineItem(item);
          setMode('offline');
        } else {
          setError(reason);
        }
      };

      if (!getAccessToken() && !wantsOffline) {
        setError({ message: 'Sign in to open this material.', status: 401 });
        return;
      }
      if (wantsOffline || !navigator.onLine) {
        await fallbackToOffline({ message: 'You are offline and this material is not saved on this device.', status: 0 });
        return;
      }
      try {
        const data = await viewerService.getManifest(id);
        if (!active) return;
        rememberOfflineUser(data.user_id);
        setManifest(data);
        setMode('online');
        const saved = await offlineStore.get(data.user_id, data.resource_id).catch(() => null);
        if (active) setOfflineItem(saved);
      } catch (cause) {
        if (!active) return;
        const status = cause instanceof ApiError ? cause.status : 0;
        const message = cause instanceof Error ? cause.message : 'Unable to open this material.';
        if (status === 0) await fallbackToOffline({ message, status });
        else setError({ message, status });
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, wantsOffline]);

  // Deterrents against casual saving/printing. Page images are also watermarked on the server.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && (key === 's' || key === 'p')) event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onlineLoader = useCallback<PageLoader>((n) => viewerService.fetchPage(id, n), [id]);
  const offlineLoader = useCallback<PageLoader>(
    (n) => (offlineItem ? offlineStore.readPage(offlineItem, n) : Promise.reject(new Error('Not saved offline.'))),
    [offlineItem],
  );

  const saveOffline = async () => {
    if (!manifest) return;
    setNotice(null);
    setSaving({ done: 0, total: manifest.page_count });
    try {
      const item = await offlineStore.save(manifest, onlineLoader, (done, total) => setSaving({ done, total }));
      setOfflineItem(item);
      setNotice(`Saved for offline use until ${new Date(item.expiresAt).toLocaleDateString()}.`);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Could not save this material offline.');
    } finally {
      setSaving(null);
    }
  };

  const removeOffline = async () => {
    if (!offlineItem) return;
    await offlineStore.remove(offlineItem.id);
    setOfflineItem(null);
    setNotice('Offline copy removed from this device.');
    if (mode === 'offline') setError({ message: 'The offline copy was removed.', status: 0 });
  };

  if (error) {
    return (
      <div className="container-page py-12 max-w-xl">
        <Alert tone={error.status === 0 ? 'warning' : 'error'} title="Unable to open this material">
          {error.message}
        </Alert>
        <div className="mt-4 flex flex-wrap gap-2">
          {error.status === 401 && (
            <Link to={`/login?redirect=${encodeURIComponent(`/materials/${id}/read`)}`}>
              <Button leftIcon={<Lock className="h-4 w-4" />}>Sign in</Button>
            </Link>
          )}
          {error.status === 403 && (
            <Link to="/pricing">
              <Button>View subscription options</Button>
            </Link>
          )}
          <Link to={`/materials/${id}`}>
            <Button variant="outline" leftIcon={<ArrowLeft className="h-4 w-4" />}>
              Back to material
            </Button>
          </Link>
          <Link to="/offline">
            <Button variant="ghost" leftIcon={<CloudOff className="h-4 w-4" />}>
              Offline library
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (mode === 'loading') {
    return <div className="container-page py-16 text-sm text-ink-600">Opening secure viewer…</div>;
  }

  const title = mode === 'offline' ? offlineItem?.title : manifest?.title;
  const kinds: Array<'image' | 'text'> =
    mode === 'offline' ? (offlineItem?.kinds ?? []) : (manifest?.pages.map((page) => page.kind) ?? []);
  const loader = mode === 'offline' ? offlineLoader : onlineLoader;
  const stale = mode === 'online' && offlineItem && manifest && offlineItem.version !== manifest.version;

  return (
    <div className="secure-viewer container-page py-6 sm:py-8" onContextMenu={(event) => event.preventDefault()}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="min-w-0">
          <Link to={`/materials/${id}`} className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-teal-700">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to details
          </Link>
          <h1 className="mt-1 font-display text-xl sm:text-2xl font-bold text-ink-950 truncate">{title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {mode === 'offline' && (
            <Badge tone="neutral">
              <WifiOff className="h-3 w-3" /> Offline copy
            </Badge>
          )}
          {mode === 'online' && manifest?.offline_allowed && (
            <>
              {offlineItem && !stale ? (
                <Button size="sm" variant="outline" onClick={removeOffline} leftIcon={<Trash2 className="h-4 w-4" />}>
                  Remove offline copy
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={saveOffline}
                  loading={saving !== null}
                  leftIcon={<CloudDownload className="h-4 w-4" />}
                >
                  {saving ? `Saving ${saving.done}/${saving.total}` : stale ? 'Update offline copy' : 'Save for offline'}
                </Button>
              )}
            </>
          )}
          <Link to="/offline">
            <Button size="sm" variant="ghost" leftIcon={<CloudOff className="h-4 w-4" />}>
              Offline library
            </Button>
          </Link>
        </div>
      </div>

      {notice && (
        <Alert tone="info" className="mb-4">
          {notice}
        </Alert>
      )}
      {manifest?.message && (
        <Alert tone="warning" className="mb-4">
          {manifest.message}
        </Alert>
      )}
      {mode === 'offline' && offlineItem && (
        <Alert tone="info" className="mb-4">
          Reading from this device. Access to this copy ends on {new Date(offlineItem.expiresAt).toLocaleString()}; reconnect
          before then to refresh it.
        </Alert>
      )}

      {kinds.length === 0 ? (
        <Card className="p-8 text-center text-sm text-ink-600">This file cannot be shown in the viewer.</Card>
      ) : (
        <div className="space-y-4 select-none">
          {kinds.map((kind, index) => (
            <ViewerPageView key={`${mode}-${index + 1}`} number={index + 1} kind={kind} load={loader} />
          ))}
        </div>
      )}

      <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-ink-500">
        <ShieldCheck className="h-3.5 w-3.5 text-teal-600" />
        Every page is stamped with your account. Sharing this material breaches the platform terms.
      </p>
    </div>
  );
}
