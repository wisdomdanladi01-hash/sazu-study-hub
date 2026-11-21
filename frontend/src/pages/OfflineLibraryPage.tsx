import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CloudOff, Trash2, WifiOff } from 'lucide-react';
import { lastOfflineUser, offlineStore, type OfflineItem } from '@/services/offline';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function OfflineLibraryPage() {
  const [items, setItems] = useState<OfflineItem[] | null>(null);
  const [online, setOnline] = useState(navigator.onLine);

  const refresh = async () => {
    const userId = lastOfflineUser();
    setItems(userId === null ? [] : await offlineStore.list(userId).catch(() => []));
  };

  useEffect(() => {
    void refresh();
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  return (
    <div className="container-page py-8 max-w-3xl">
      <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink-950 flex items-center gap-2">
        <CloudOff className="h-6 w-6 text-teal-600" /> Offline library
      </h1>
      <p className="mt-1.5 text-sm text-ink-600">
        Materials you saved on this device. They open inside the app only and stop working when your access period ends.
      </p>
      {!online && (
        <Alert tone="info" className="mt-4">
          <span className="inline-flex items-center gap-1.5">
            <WifiOff className="h-4 w-4" /> You are offline. Saved materials are still available.
          </span>
        </Alert>
      )}

      <div className="mt-6 space-y-3">
        {items === null ? (
          <p className="text-sm text-ink-500">Loading…</p>
        ) : items.length === 0 ? (
          <Card className="p-8 text-center text-sm text-ink-600">
            Nothing saved yet. Open a material and choose “Save for offline”.
            <div className="mt-4">
              <Link to="/materials">
                <Button variant="outline">Browse materials</Button>
              </Link>
            </div>
          </Card>
        ) : (
          items.map((item) => (
            <Card key={item.id} className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-ink-900 truncate">{item.title}</p>
                <p className="text-xs text-ink-500 mt-0.5">
                  {item.kinds.length} pages · {formatSize(item.bytes)} · available until{' '}
                  {new Date(item.expiresAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link to={`/materials/${item.resourceId}/read?offline=1`}>
                  <Button size="sm">Open</Button>
                </Link>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove ${item.title}`}
                  onClick={async () => {
                    await offlineStore.remove(item.id);
                    await refresh();
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
