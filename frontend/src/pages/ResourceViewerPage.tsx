import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CloudDownload, CloudOff, FileText, Lock, ShieldCheck, Trash2, WifiOff } from 'lucide-react';
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

/** High-legibility academic paper renderer for word-processing and text documents. */
function AcademicDocumentPageView({ text, number, watermark }: { text: string; number: number; watermark?: string }) {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  return (
    <div className="relative mx-auto w-full max-w-3xl bg-white shadow-card rounded-2xl border border-ink-150 p-6 sm:p-12 font-sans select-none overflow-hidden">
      {/* Paper Header / Document Masthead */}
      <div className="border-b border-ink-100 pb-4 mb-6 flex items-center justify-between text-xs text-ink-500">
        <span className="inline-flex items-center gap-1.5 font-bold text-teal-800 bg-teal-50 px-2.5 py-1 rounded-md border border-teal-200/60">
          <FileText className="h-3.5 w-3.5" /> Academic Document Reader
        </span>
        <span className="font-mono text-ink-400">Page {number}</span>
      </div>

      {/* Subtle security watermark across background */}
      {watermark && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.035] -rotate-12 font-mono text-xl sm:text-2xl text-ink-950 select-none">
          {watermark} &bull; SAZU STUDY HUB
        </div>
      )}

      {/* Formatted Content */}
      <div className="space-y-4 text-ink-850 text-sm sm:text-base leading-relaxed">
        {paragraphs.map((p, idx) => {
          const isHeading =
            p.length < 90 &&
            (p === p.toUpperCase() ||
              /^(CHAPTER|MODULE|SECTION|PART|TOPIC|UNIT|[0-9]+(\.[0-9]+)*)/i.test(p) ||
              p.endsWith(':'));

          if (isHeading) {
            return (
              <h3
                key={idx}
                className="font-display font-bold text-ink-950 text-base sm:text-lg mt-6 pt-2 border-t border-ink-100 first:mt-0 first:border-0"
              >
                {p}
              </h3>
            );
          }

          if (p.startsWith('- ') || p.startsWith('• ') || p.startsWith('* ')) {
            const items = p.split('\n').filter(Boolean);
            return (
              <ul key={idx} className="list-disc pl-5 space-y-1.5 text-ink-800">
                {items.map((it, itemIdx) => (
                  <li key={itemIdx}>{it.replace(/^[-•*]\s*/, '')}</li>
                ))}
              </ul>
            );
          }

          return (
            <p key={idx} className="text-ink-800 leading-relaxed text-[0.9375rem]">
              {p}
            </p>
          );
        })}
      </div>

      {/* Page Footer */}
      <div className="mt-8 pt-4 border-t border-ink-100 flex items-center justify-between text-[11px] text-ink-400">
        <span>Verified Course Document &bull; SAZU Study Hub</span>
        <span>Secure In-App Viewer</span>
      </div>
    </div>
  );
}

/** One page, fetched only when it scrolls near the screen. */
function ViewerPageView({ number, kind, load, watermark }: { number: number; kind: 'image' | 'text'; load: PageLoader; watermark?: string }) {
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
    <div ref={holder} className="mx-auto w-full max-w-3xl min-h-[320px] rounded-lg overflow-hidden">
      {failed ? (
        <div className="bg-white p-6 shadow-soft rounded-lg">
          <p className="text-sm text-red-700">{failed}</p>
        </div>
      ) : url ? (
        <div className="bg-white shadow-soft rounded-lg overflow-hidden">
          <img
            src={url}
            alt={`Page ${number}`}
            draggable={false}
            className="block w-full h-auto select-none pointer-events-none"
          />
        </div>
      ) : text !== null ? (
        <AcademicDocumentPageView text={text} number={number} watermark={watermark} />
      ) : (
        <div className="bg-white p-10 text-center text-xs text-ink-400 shadow-soft rounded-lg">Loading page {number}…</div>
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
    const isSubscriptionNeeded = error.status === 403;
    const isSignInNeeded = error.status === 401;

    return (
      <div className="container-page py-12 max-w-xl">
        <Card className="p-6 sm:p-8 border-ink-200 shadow-card bg-white">
          <div className="flex items-center gap-3.5 mb-5">
            <span className={`p-3 rounded-2xl ${isSubscriptionNeeded ? 'bg-amber-100 text-amber-900' : 'bg-teal-100 text-teal-900'}`}>
              <Lock className="h-6 w-6" />
            </span>
            <div>
              <h2 className="font-display text-xl font-bold text-ink-950">
                {isSubscriptionNeeded
                  ? 'Access Controlled: Subscription Required'
                  : isSignInNeeded
                  ? 'Sign In Required'
                  : 'Unable to Open This Material'}
              </h2>
              <p className="text-xs text-ink-500 mt-0.5 font-medium">
                {isSubscriptionNeeded ? 'Protected Academic Material & Verified Access' : 'Authentication Status'}
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-ink-50/80 border border-ink-150 text-sm text-ink-700 leading-relaxed mb-6">
            {isSubscriptionNeeded ? (
              <div className="space-y-3">
                <p>
                  This course document is protected for subscribed students and verified scholars. If you are enrolled in this level or course, choose an access pass below to unlock instant viewing.
                </p>
                <div className="text-xs text-ink-700 bg-white p-3 rounded-xl border border-ink-200 shadow-2xs space-y-1.5">
                  <span className="font-bold text-ink-900 block">Available student passes:</span>
                  <div className="flex items-center justify-between py-1 border-b border-ink-100">
                    <span>Single Material Pass</span>
                    <strong className="text-teal-700 font-mono">&#8358;300</strong>
                  </div>
                  <div className="flex items-center justify-between py-1 border-b border-ink-100">
                    <span>Per Semester Pass (All Level Materials)</span>
                    <strong className="text-teal-700 font-mono">&#8358;1,500</strong>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span>Full Session All-Access Pass</span>
                    <strong className="text-teal-700 font-mono">&#8358;2,000</strong>
                  </div>
                </div>
              </div>
            ) : (
              error.message
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            {isSubscriptionNeeded && (
              <>
                <Link to={`/materials/${id}`} className="flex-1">
                  <Button fullWidth leftIcon={<Lock className="h-4 w-4" />}>
                    Unlock Material (&#8358;300)
                  </Button>
                </Link>
                <Link to="/pricing" className="flex-1">
                  <Button variant="outline" fullWidth>
                    View All Plans
                  </Button>
                </Link>
              </>
            )}
            {isSignInNeeded && (
              <Link to={`/login?redirect=${encodeURIComponent(`/materials/${id}/read`)}`} className="flex-1">
                <Button fullWidth leftIcon={<Lock className="h-4 w-4" />}>
                  Sign in to Access
                </Button>
              </Link>
            )}
            <Link to={`/materials/${id}`} className="sm:w-auto">
              <Button variant="ghost" fullWidth leftIcon={<ArrowLeft className="h-4 w-4" />}>
                Details
              </Button>
            </Link>
          </div>
        </Card>
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
  const hasTextPages = kinds.includes('text');

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

      {hasTextPages && (
        <div className="mb-4 p-3 rounded-xl bg-teal-50 border border-teal-200 text-teal-900 text-xs flex items-center gap-2">
          <FileText className="h-4 w-4 text-teal-700 shrink-0" />
          <span>
            <strong>Digital Document Reader:</strong> Word document (.docx) and syllabus notes are rendered in high-legibility book pages for comfortable mobile and desktop reading.
          </span>
        </div>
      )}

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
            <ViewerPageView
              key={`${mode}-${index + 1}`}
              number={index + 1}
              kind={kind}
              load={loader}
              watermark={manifest?.watermark}
            />
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
