import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { catalogService } from '@/services/catalog';
import { useAuth } from '@/auth/AuthContext';
import { useRecentlyViewed } from '@/hooks/useRecentlyViewed';
import { API_BASE_URL, ApiError } from '@/services/api';
import { paymentService, type SubscriptionPackage } from '@/services/payments';
import type { CatalogResource } from '@/services/catalog';
import type { ResourcePreview } from '@/types';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { ProtectedActionDialog } from '@/components/ProtectedActionDialog';
import { ResourceCard } from '@/components/ResourceCard';
import {
  ArrowLeft,
  Lock,
  Download,
  ListChecks,
  ShieldCheck,
  FileText,
  Tag,
  ChevronRight,
  Eye,
  ExternalLink,
  Copy,
  Check,
  FileCode,
  Image as ImageIcon,
  GraduationCap,
  Sparkles,
} from 'lucide-react';
import { formatRelative } from '@/utils/format';

export function ResourceDetailPage() {
  const { id } = useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const recentlyViewed = useRecentlyViewed();
  const [authDialog, setAuthDialog] = useState(false);
  const [resource, setResource] = useState<CatalogResource | null>(null);
  const [preview, setPreview] = useState<ResourcePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewAuthRequired, setPreviewAuthRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadError] = useState<string | null>(null);
  const [copiedExcerpt, setCopiedExcerpt] = useState(false);
  const [packages, setPackages] = useState<SubscriptionPackage[]>([]);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  useEffect(() => {
    paymentService.listPackages().then(setPackages).catch(() => { });
  }, []);

  const unlockingPlans = packages.filter((p) => {
    if (!resource) return false;
    if (p.package_type === 'resource' && p.resource_id === Number(resource.id)) return true;
    if (p.package_type === 'course' && p.course_id === Number(resource.course.id)) return true;
    if (p.package_type === 'semester' || p.package_type === 'subscription' || p.package_type === 'session') return true;
    return false;
  }).sort((a, b) => a.price_minor - b.price_minor);

  const cheapestPlan = unlockingPlans[0] ?? null;

  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoading(true);
    catalogService
      .getResource(id)
      .then((item) => {
        if (!active) return;
        if (!item) setError('This learning material is unavailable.');
        else {
          setResource(item);
          recentlyViewed.add(item.id);
        }
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to load this learning material.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setPreviewLoading(true);
    setPreviewAuthRequired(false);

    catalogService
      .getResourcePreview(id)
      .then((data) => {
        if (!active) return;
        setPreview(data);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 401) {
          setPreviewAuthRequired(true);
        } else {
          setPreview(null);
        }
      })
      .finally(() => {
        if (active) setPreviewLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id, profile]);

  const [related, setRelated] = useState<CatalogResource[]>([]);
  useEffect(() => {
    if (!resource) return;
    let active = true;
    catalogService
      .getRelatedResources(resource.id)
      .then((items) => {
        if (active) setRelated(items);
      })
      .catch(() => {
        if (active) setRelated([]);
      });
    return () => {
      active = false;
    };
  }, [resource]);

  if (loading) {
    return <div className="container-page py-16 text-sm text-ink-600">Loading learning material…</div>;
  }
  if (!resource || error) {
    return (
      <div className="container-page py-16">
        <Alert tone="error" title="Learning material unavailable">
          {error ?? 'This learning material is unavailable.'}
        </Alert>
        <div className="mt-4">
          <Link to="/materials">
            <Button variant="outline" leftIcon={<ArrowLeft className="h-4 w-4" />}>
              Back to materials
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Students read in the secure viewer (with offline saving); raw downloads are disabled.
  const handleOpen = () => {
    if (!profile) {
      setAuthDialog(true);
      return;
    }
    navigate(`/materials/${resource.id}/read`);
  };

  const handleCopyExcerpt = () => {
    if (!preview?.preview_content) return;
    navigator.clipboard.writeText(preview.preview_content);
    setCopiedExcerpt(true);
    setTimeout(() => setCopiedExcerpt(false), 2000);
  };

  const renderPreviewSection = () => {
    if (previewLoading) {
      return (
        <Card className="p-8 text-center bg-white border border-ink-100">
          <div className="animate-pulse space-y-3 max-w-md mx-auto">
            <div className="h-4 bg-ink-100 rounded w-1/3 mx-auto"></div>
            <div className="h-3 bg-ink-50 rounded w-3/4 mx-auto"></div>
            <div className="h-3 bg-ink-50 rounded w-1/2 mx-auto"></div>
          </div>
          <p className="mt-4 text-xs text-ink-400">Loading resource preview…</p>
        </Card>
      );
    }

    if (previewAuthRequired) {
      return (
        <Card className="overflow-hidden border border-ink-200 shadow-xs">
          <div className="flex items-center justify-between px-4 py-2.5 bg-ink-50 border-b border-ink-100">
            <span className="text-xs font-semibold text-ink-700 inline-flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-amber-600" /> Member Preview Available
            </span>
            <Badge tone="neutral">Sign-in Required</Badge>
          </div>
          <div className="p-6 bg-white text-center sm:text-left sm:flex sm:items-center sm:justify-between gap-6">
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-ink-900">Sign in to read this sample excerpt</h4>
              <p className="text-xs text-ink-600 max-w-md">
                The author or administrator has published a sample excerpt for verified and signed-in students.
                Log in or create a free student account to preview this document.
              </p>
            </div>
            <div className="mt-4 sm:mt-0 shrink-0">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAuthDialog(true)}
                leftIcon={<Lock className="h-3.5 w-3.5" />}
              >
                Sign in to view
              </Button>
            </div>
          </div>
        </Card>
      );
    }

    if (preview?.preview_available) {
      // 1. Text preview
      if (preview.preview_type === 'text' && preview.preview_content) {
        return (
          <Card className="overflow-hidden border border-ink-200 shadow-xs">
            <div className="flex items-center justify-between px-4 py-2.5 bg-ink-50 border-b border-ink-100">
              <span className="text-xs font-semibold text-ink-700 inline-flex items-center gap-1.5">
                <FileCode className="h-4 w-4 text-teal-600" /> Sample Excerpt
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyExcerpt}
                  className="inline-flex items-center gap-1 text-xs text-ink-600 hover:text-ink-950 font-medium px-2 py-0.5 rounded hover:bg-ink-100 transition"
                >
                  {copiedExcerpt ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 text-ink-400" /> Copy excerpt
                    </>
                  )}
                </button>
                <Badge tone="teal">Verified Sample</Badge>
              </div>
            </div>
            <div className="p-5 sm:p-6 bg-white max-h-96 overflow-y-auto font-mono text-xs sm:text-sm text-ink-800 whitespace-pre-wrap leading-relaxed select-text border-b border-ink-50">
              {preview.preview_content}
            </div>
            <div className="px-4 py-2 bg-ink-50/50 flex items-center justify-between text-[11px] text-ink-500">
              <span>Showing sample excerpt. Full document available on download.</span>
              <span>{preview.preview_content.length} characters</span>
            </div>
          </Card>
        );
      }

      // 2. Image preview
      if (preview.preview_type === 'image' && preview.preview_url) {
        const fullImgUrl = preview.preview_url.startsWith('http')
          ? preview.preview_url
          : `${API_BASE_URL}${preview.preview_url}`;

        return (
          <Card className="overflow-hidden border border-ink-200 shadow-xs">
            <div className="flex items-center justify-between px-4 py-2.5 bg-ink-50 border-b border-ink-100">
              <span className="text-xs font-semibold text-ink-700 inline-flex items-center gap-1.5">
                <ImageIcon className="h-4 w-4 text-teal-600" /> Document Sample Image
              </span>
              <a
                href={fullImgUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-teal-700 hover:text-teal-900 font-medium"
              >
                Open full size <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="p-4 bg-ink-50 flex items-center justify-center min-h-[240px] max-h-[460px] overflow-hidden">
              <img
                src={fullImgUrl}
                alt={preview.title}
                className="max-h-[420px] w-auto rounded-lg shadow-sm object-contain"
                loading="lazy"
              />
            </div>
          </Card>
        );
      }

      // 3. PDF preview
      if (preview.preview_type === 'pdf' && preview.preview_url) {
        const fullPdfUrl = preview.preview_url.startsWith('http')
          ? preview.preview_url
          : `${API_BASE_URL}${preview.preview_url}`;

        return (
          <Card className="overflow-hidden border border-ink-200 shadow-xs">
            <div className="flex items-center justify-between px-4 py-2.5 bg-ink-50 border-b border-ink-100">
              <span className="text-xs font-semibold text-ink-700 inline-flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-teal-600" /> Public PDF Preview
              </span>
              <a
                href={fullPdfUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-teal-700 hover:text-teal-900 font-medium"
              >
                Open in new tab <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="bg-ink-100 h-[480px] w-full">
              <iframe
                src={`${fullPdfUrl}#toolbar=0`}
                title={preview.title}
                className="w-full h-full border-none"
              />
            </div>
          </Card>
        );
      }
    }

    // Default / No preview published
    return (
      <Card className="overflow-hidden border border-ink-100">
        <div className="flex items-center justify-between px-4 py-2.5 bg-ink-50 border-b border-ink-100">
          <span className="text-xs font-semibold text-ink-600 inline-flex items-center gap-1.5">
            <FileText className="h-4 w-4 text-ink-400" /> Resource information
          </span>
          <span className="text-xs text-ink-400">No preview provided</span>
        </div>
        <div className="p-5 sm:p-7 bg-white">
          <p className="text-sm text-ink-600">
            No preview has been published for this item. You can inspect its course code, academic level, and description, or request access to download the full material.
          </p>
        </div>
      </Card>
    );
  };

  return (
    <div className="container-page py-6 sm:py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-ink-500 mb-5" aria-label="Breadcrumb">
        <Link to="/materials" className="hover:text-teal-700 inline-flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Materials
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="truncate text-ink-700">{resource.course.code}</span>
      </nav>

      {/* Draft banner for Admin */}
      {!resource.is_published && profile?.isAdmin && (
        <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-center gap-3">
          <Lock className="h-5 w-5 text-amber-700 shrink-0" />
          <div>
            <p className="font-bold text-sm">Draft — not visible to students (Admin preview mode)</p>
            <p className="text-xs text-amber-700 mt-0.5">
              This learning material has not been published. As an administrator, you are inspecting this draft in student preview mode.
            </p>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Badge tone="teal">{resource.type}</Badge>
            <Badge tone="neutral">Level {resource.level}</Badge>
            <Badge tone="neutral">{resource.semester} semester</Badge>
            <Badge tone="neutral">
              {resource.accessPolicy === 'public' ? (
                <Download className="h-3 w-3" />
              ) : (
                <Lock className="h-3 w-3" />
              )}{' '}
              {resource.accessPolicy === 'public' ? 'Public access' : 'Access controlled'}
            </Badge>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink-950 text-balance">
            {resource.title}
          </h1>
          <p className="mt-2 text-sm font-semibold text-ink-600">
            <Link to={`/materials?q=${encodeURIComponent(resource.course.code)}`} className="hover:text-teal-700">
              {resource.course.code} &middot; {resource.course.title}
            </Link>
          </p>

          <p className="mt-4 text-ink-700 leading-relaxed">{resource.description}</p>

          {resource.authorTag && (
            <p className="mt-3 text-xs text-ink-500 italic">{resource.authorTag}</p>
          )}

          {/* Pedagogical Advisory for MTH201 or 100-Level */}
          {((resource.course.code || '').toUpperCase().replace(/\s+/g, '') === 'MTH201' || (resource.course.title || '').toLowerCase().includes('mathematical method')) && (
            <Card className="mt-5 p-4 sm:p-5 border-amber-300 bg-linear-to-r from-amber-50/80 via-white to-amber-50/40">
              <div className="flex items-start gap-3">
                <span className="p-2 rounded-xl bg-amber-100 text-amber-800 shrink-0">
                  <Sparkles className="h-5 w-5" />
                </span>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-amber-950">
                    Crucial Pass-Booster: MTH201 Mathematical Method I
                  </h3>
                  <p className="text-xs text-amber-900 leading-relaxed">
                    MTH201 is historically recognized as one of the most demanding courses at 200 Level with a high failure rate across Science and Computing departments. Studying these verified continuous assessment questions, past examinations, and step-by-step worked solutions significantly boosts your problem-solving accuracy and exam pass rate.
                  </p>
                </div>
              </div>
            </Card>
          )}

          {(resource.level === '100' || (resource.course.code || '').match(/^[A-Z]+\s*1/i)) && ((resource.course.code || '').toUpperCase().replace(/\s+/g, '') !== 'MTH201') && (
            <Card className="mt-5 p-4 sm:p-5 border-teal-200 bg-linear-to-r from-teal-50/70 via-white to-teal-50/30">
              <div className="flex items-start gap-3">
                <span className="p-2 rounded-xl bg-teal-100 text-teal-800 shrink-0">
                  <GraduationCap className="h-5 w-5" />
                </span>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-teal-950">
                    First-Year Academic Gateway: Build Your CGPA Foundation Early
                  </h3>
                  <p className="text-xs text-teal-900 leading-relaxed">
                    First-year academic performance establishes the foundation for your cumulative GPA (CGPA). Mastering this 100-level course with verified past questions and marking guides protects your academic standing early and sets you up for honors classification.
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* Real Preview Section */}
          <section className="mt-7">
            <div className="flex items-center gap-2 mb-3">
              <Eye className="h-5 w-5 text-teal-600" />
              <h2 className="font-display text-lg font-bold text-ink-950">Resource Preview</h2>
            </div>
            {renderPreviewSection()}
          </section>

          {/* Related */}
          {related.length > 0 && (
            <section className="mt-10">
              <h2 className="font-display text-lg font-bold text-ink-950 mb-4">
                Related resources for {resource.course.code}
              </h2>
              <div className="grid sm:grid-cols-2 gap-4">
                {related.map((r) => (
                  <ResourceCard key={r.id} resource={r} course={r.course} />
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Sticky actions sidebar */}
        <aside className="lg:sticky lg:top-20 lg:self-start space-y-4">
          <Card className="p-5">
            <h3 className="font-display font-bold text-ink-950">Access this resource</h3>
            <p className="mt-1 text-sm text-ink-600">
              {profile
                ? profile.isAdmin
                  ? 'Administrator account recognized. Full watermarked viewer preview is authorized.'
                  : profile.hasSubscription
                  ? 'Your semester subscription is active. You can read the full material.'
                  : "You're signed in. Add a semester subscription to unlock the full material."
                : 'Sign in to unlock the full material. A semester subscription may also be required.'}
            </p>
            <div className="mt-4 space-y-2.5">
              <Button
                fullWidth
                variant={profile?.isAdmin || profile?.hasSubscription ? 'primary' : 'outline'}
                onClick={handleOpen}
                leftIcon={<Eye className="h-4 w-4" />}
              >
                {profile?.isAdmin ? 'Open in Reader (Admin Preview)' : 'Open material'}
              </Button>
              <Link to={`/practice?course=${encodeURIComponent(resource.course.code)}`}>
                <Button fullWidth variant="ghost" leftIcon={<ListChecks className="h-4 w-4" />}>
                  Practise related questions
                </Button>
              </Link>
            </div>

            {downloadError && (
              <Alert tone="warning" className="mt-4">
                <p className="text-xs sm:text-sm">{downloadError}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link to="/pricing">
                    <Button size="sm" leftIcon={<Tag className="h-3.5 w-3.5" />}>
                      Unlock for ₦300
                    </Button>
                  </Link>
                  <Link to="/pricing">
                    <Button size="sm" variant="outline">
                      Semester Pass (₦1,500)
                    </Button>
                  </Link>
                </div>
              </Alert>
            )}
            {!profile && (
              <p className="mt-3 text-xs text-ink-500">
                You&apos;re browsing as a visitor. Signing in does not automatically grant paid access.
              </p>
            )}
          </Card>

          {/* Micro-access: Cheapest available pass to unlock this material */}
          {(!profile || !profile.hasSubscription) && cheapestPlan && (
            <Card className="p-5 border-teal-200/90 bg-gradient-to-br from-teal-50/70 via-white to-white shadow-xs">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-teal-700" />
                <h4 className="font-display font-bold text-ink-950 text-sm">
                  {cheapestPlan.name}
                </h4>
              </div>
              <p className="text-xs text-ink-600 leading-relaxed">
                Unlock this document and sit related practice test questions with this plan for{' '}
                <span className="font-bold text-ink-900">
                  ₦{(cheapestPlan.price_minor / 100).toLocaleString()}
                </span>.
              </p>
              <div className="mt-4 space-y-2">
                <Button
                  fullWidth
                  size="sm"
                  className="font-semibold shadow-xs"
                  loading={checkoutLoading}
                  onClick={async () => {
                    if (!profile) {
                      navigate(`/login?redirect=${encodeURIComponent(`/materials/${resource.id}`)}`);
                      return;
                    }
                    setCheckoutLoading(true);
                    try {
                      const res = await paymentService.initializePayment(cheapestPlan.id);
                      window.location.assign(res.checkout_url);
                    } catch (err) {
                      alert(err instanceof Error ? err.message : 'Unable to initiate checkout');
                      setCheckoutLoading(false);
                    }
                  }}
                >
                  Unlock Now (₦{(cheapestPlan.price_minor / 100).toLocaleString()})
                </Button>
                <div className="text-center pt-1">
                  <Link
                    to="/pricing"
                    className="text-[11px] font-semibold text-teal-700 hover:text-teal-900 hover:underline"
                  >
                    View all access passes &rarr;
                  </Link>
                </div>
              </div>
            </Card>
          )}

          <Card className="p-5">
            <h3 className="font-display font-bold text-ink-950 text-sm">Resource details</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <Row label="Course" value={`${resource.course.code} · ${resource.course.title}`} />
              <Row label="Type" value={resource.type} />
              <Row label="Level" value={`Level ${resource.level}`} />
              <Row label="Semester" value={resource.semester} />
              <Row label="File size" value={formatFileSize(resource.fileSizeBytes)} />
              <Row label="Added" value={formatRelative(resource.uploadedAt)} />
              <Row
                label="Content preview"
                value={
                  preview?.preview_available
                    ? `${preview.preview_type === 'text' ? 'Text Excerpt' : preview.preview_type === 'image' ? 'Sample Image' : 'PDF Sample'}`
                    : previewAuthRequired
                      ? 'Requires sign-in'
                      : 'Not published'
                }
              />
            </dl>
          </Card>

          <Card className="p-5 bg-ink-950 text-white border-ink-950">
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="h-5 w-5 text-teal-300 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-white">How access works</p>
                <p className="text-xs text-ink-300 mt-1">
                  The service checks your account and entitlements before granting access to a protected download.
                </p>
              </div>
            </div>
          </Card>
        </aside>
      </div>

      <ProtectedActionDialog
        open={authDialog}
        onClose={() => setAuthDialog(false)}
        reason="Sign in to open this learning material. Your subscription and verification status will be checked by the service."
        destination={`/materials/${resource.id}`}
      />
    </div>
  );
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return 'Not provided';
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-500 shrink-0">{label}</dt>
      <dd className="text-ink-900 font-medium text-right">{value}</dd>
    </div>
  );
}
