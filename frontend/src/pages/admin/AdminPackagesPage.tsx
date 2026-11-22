import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CreditCard,
  Plus,
  RefreshCw,
  CheckCircle2,
  Edit2,
  Trash2,
  GraduationCap,
  Calendar,
  Layers,
  FileText,
  BookOpen,
} from 'lucide-react';
import {
  adminService,
  type AdminAcademicSession,
  type AdminCourse,
  type AdminResourceItem,
  type AdminSemester,
  type AdminSubscriptionPackage,
} from '@/services/admin';
import { catalogService } from '@/services/catalog';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';
import { Dialog } from '@/components/ui/Dialog';
import { formatDate } from '@/utils/format';

interface PaymentRecord {
  id: number;
  user_id: number;
  reference: string;
  status: string;
  amount_minor: number;
  currency: string;
  created_at: string;
}

export function AdminPackagesPage() {
  const [packages, setPackages] = useState<AdminSubscriptionPackage[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [sessions, setSessions] = useState<AdminAcademicSession[]>([]);
  const [semesters, setSemesters] = useState<AdminSemester[]>([]);
  const [courses, setCourses] = useState<AdminCourse[]>([]);
  const [resources, setResources] = useState<AdminResourceItem[]>([]);
  const [levels, setLevels] = useState<Array<{ id: number; name: string; code: string }>>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'packages' | 'payments'>('packages');

  // Create / Edit Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<AdminSubscriptionPackage | null>(null);
  const [deleteModalPackage, setDeleteModalPackage] = useState<AdminSubscriptionPackage | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [packageName, setPackageName] = useState('');
  const [packageDesc, setPackageDesc] = useState('');
  const [packageType, setPackageType] = useState<string>('semester');
  const [packageNairaPrice, setPackageNairaPrice] = useState('1500');
  const [packageSubscriberNairaPrice, setPackageSubscriberNairaPrice] = useState('');
  const [packageSemesterId, setPackageSemesterId] = useState<string>('');
  const [packageSessionId, setPackageSessionId] = useState<string>('');
  const [packageLevelId, setPackageLevelId] = useState<string>('');
  const [packageCourseId, setPackageCourseId] = useState<string>('');
  const [packageResourceId, setPackageResourceId] = useState<string>('');
  const [availableFrom, setAvailableFrom] = useState('');
  const [availableUntil, setAvailableUntil] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [pkgs, pms, sessList, semList, cList, rList, cat] = await Promise.all([
        adminService.listPackages(),
        adminService.listPayments().catch(() => [] as PaymentRecord[]),
        adminService.listSessions().catch(() => [] as AdminAcademicSession[]),
        adminService.listSemesters().catch(() => [] as AdminSemester[]),
        adminService.listCourses().catch(() => [] as AdminCourse[]),
        adminService.listResources().catch(() => [] as AdminResourceItem[]),
        catalogService.getAcademicCatalogue().catch(() => null),
      ]);
      setPackages(pkgs);
      setPayments(pms);
      setSessions(sessList);
      setSemesters(semList);
      setCourses(cList);
      setResources(rList);
      if (cat?.levels) {
        setLevels(cat.levels);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load subscription packages');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenCreate = () => {
    setEditingPackage(null);
    setPackageName('');
    setPackageDesc('');
    setPackageType('semester');
    setPackageNairaPrice('1500');
    setPackageSubscriberNairaPrice('');
    setPackageSemesterId(semesters[0]?.id ? String(semesters[0].id) : '');
    setPackageSessionId(sessions[0]?.id ? String(sessions[0].id) : '');
    setPackageLevelId(levels[0]?.id ? String(levels[0].id) : '');
    setPackageCourseId(courses[0]?.id ? String(courses[0].id) : '');
    setPackageResourceId(resources[0]?.id ? String(resources[0].id) : '');
    setAvailableFrom('');
    setAvailableUntil('');
    setIsActive(true);
    setFormError(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (pkg: AdminSubscriptionPackage) => {
    setEditingPackage(pkg);
    setPackageName(pkg.name);
    setPackageDesc(pkg.description || '');
    const normalizedType = (pkg.package_type === 'subscription' || !pkg.package_type) ? 'semester' : pkg.package_type;
    setPackageType(normalizedType);
    setPackageNairaPrice((pkg.price_minor / 100).toString());
    setPackageSubscriberNairaPrice(
      pkg.subscriber_price_minor ? (pkg.subscriber_price_minor / 100).toString() : ''
    );
    setPackageSemesterId(pkg.semester_id ? String(pkg.semester_id) : (semesters[0]?.id ? String(semesters[0].id) : ''));
    setPackageSessionId(pkg.academic_session_id ? String(pkg.academic_session_id) : (sessions[0]?.id ? String(sessions[0].id) : ''));
    setPackageLevelId(pkg.academic_level_id ? String(pkg.academic_level_id) : (levels[0]?.id ? String(levels[0].id) : ''));
    setPackageCourseId(pkg.course_id ? String(pkg.course_id) : (courses[0]?.id ? String(courses[0].id) : ''));
    setPackageResourceId(pkg.resource_id ? String(pkg.resource_id) : (resources[0]?.id ? String(resources[0].id) : ''));
    setAvailableFrom(pkg.available_from ? pkg.available_from.substring(0, 10) : '');
    setAvailableUntil(pkg.available_until ? pkg.available_until.substring(0, 10) : '');
    setIsActive(pkg.is_active);
    setFormError(null);
    setModalOpen(true);
  };

  const handleToggleActive = async (pkg: AdminSubscriptionPackage) => {
    try {
      await adminService.updatePackage(pkg.id, { is_active: !pkg.is_active });
      setSuccessMessage(`Package "${pkg.name}" is now ${!pkg.is_active ? 'active and visible to students' : 'inactive'}.`);
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to toggle package status.');
    }
  };

  const handleDeletePackage = async () => {
    if (!deleteModalPackage) return;
    setDeleting(true);
    try {
      await adminService.deletePackage(deleteModalPackage.id);
      setSuccessMessage(`Package "${deleteModalPackage.name}" removed or archived successfully.`);
      setDeleteModalPackage(null);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete package.');
    } finally {
      setDeleting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const priceNaira = parseFloat(packageNairaPrice);
    if (isNaN(priceNaira) || priceNaira <= 0) {
      setFormError('Please enter a valid price in Naira.');
      return;
    }
    const priceMinor = Math.round(priceNaira * 100);

    let subscriberPriceMinor: number | null = null;
    if (packageSubscriberNairaPrice.trim()) {
      const subPrice = parseFloat(packageSubscriberNairaPrice);
      if (isNaN(subPrice) || subPrice < 0) {
        setFormError('Please enter a valid subscriber discounted price.');
        return;
      }
      subscriberPriceMinor = Math.round(subPrice * 100);
    }

    if (packageType === 'semester' && !packageSemesterId) {
      setFormError('Please select a target semester. If none exist, create one in Academic Directory.');
      return;
    }
    if (packageType === 'session' && !packageSessionId) {
      setFormError('Please select a target academic session.');
      return;
    }
    if (packageType === 'level' && !packageLevelId) {
      setFormError('Please select a target academic level.');
      return;
    }
    if (packageType === 'course' && !packageCourseId) {
      setFormError('Please select a target course.');
      return;
    }
    if (packageType === 'resource' && !packageResourceId) {
      setFormError('Please select a target resource.');
      return;
    }

    setSubmitting(true);
    try {
      if (editingPackage) {
        await adminService.updatePackage(editingPackage.id, {
          name: packageName.trim(),
          description: packageDesc.trim() || null,
          package_type: packageType,
          price_minor: priceMinor,
          subscriber_price_minor: subscriberPriceMinor,
          semester_id: packageType === 'semester' ? Number(packageSemesterId) : null,
          academic_session_id: packageType === 'session' ? Number(packageSessionId) : null,
          academic_level_id: packageType === 'level' ? Number(packageLevelId) : null,
          course_id: packageType === 'course' ? Number(packageCourseId) : null,
          resource_id: packageType === 'resource' ? Number(packageResourceId) : null,
          is_active: isActive,
        });
        setSuccessMessage(`Package "${packageName}" updated successfully.`);
      } else {
        await adminService.createPackage({
          name: packageName.trim(),
          description: packageDesc.trim() || null,
          package_type: packageType,
          price_minor: priceMinor,
          subscriber_price_minor: subscriberPriceMinor,
          currency: 'NGN',
          semester_id: packageType === 'semester' ? Number(packageSemesterId) : null,
          academic_session_id: packageType === 'session' ? Number(packageSessionId) : null,
          academic_level_id: packageType === 'level' ? Number(packageLevelId) : null,
          course_id: packageType === 'course' ? Number(packageCourseId) : null,
          resource_id: packageType === 'resource' ? Number(packageResourceId) : null,
          available_from: availableFrom ? new Date(availableFrom).toISOString() : null,
          available_until: availableUntil ? new Date(availableUntil).toISOString() : null,
          is_active: isActive,
        });
        setSuccessMessage(`Package "${packageName}" created successfully.`);
      }
      setModalOpen(false);
      await fetchData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save package');
    } finally {
      setSubmitting(false);
    }
  };

  const getSemesterLabel = (sem: AdminSemester) => {
    const sess = sessions.find((s) => s.id === sem.academic_session_id);
    const semName = sem.number === 1 ? '1st Semester' : sem.number === 2 ? '2nd Semester' : `Semester ${sem.number}`;
    return `${sess?.name ?? 'Session'} - ${semName} (${formatDate(sem.starts_on)} to ${formatDate(sem.ends_on)})`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <CreditCard className="h-6 w-6 text-teal-700" />
            <Badge tone="teal">Access & Commerce</Badge>
          </div>
          <h1 className="font-display text-2xl font-bold text-ink-950">
            Subscription Packages & Commercial Access
          </h1>
          <p className="mt-1 text-sm text-ink-600">
            Configure access plans (semester subscriptions, session passes, cross-level passes, course & resource passes), view metrics, subscriber discounts, and payments.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} loading={loading} leftIcon={<RefreshCw className="h-4 w-4" />}>
            Refresh
          </Button>
          <Button size="sm" onClick={handleOpenCreate} leftIcon={<Plus className="h-4 w-4" />}>
            New Package
          </Button>
        </div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {successMessage && (
        <Alert tone="success" onClose={() => setSuccessMessage(null)}>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
        </Alert>
      )}

      {/* Tabs */}
      <div className="border-b border-ink-200 flex gap-2">
        <button
          onClick={() => setActiveTab('packages')}
          className={`pb-3 px-3 text-sm font-bold border-b-2 transition-colors ${
            activeTab === 'packages'
              ? 'border-teal-600 text-teal-800'
              : 'border-transparent text-ink-500 hover:text-ink-800'
          }`}
        >
          Access Packages ({packages.length})
        </button>
        <button
          onClick={() => setActiveTab('payments')}
          className={`pb-3 px-3 text-sm font-bold border-b-2 transition-colors ${
            activeTab === 'payments'
              ? 'border-teal-600 text-teal-800'
              : 'border-transparent text-ink-500 hover:text-ink-800'
          }`}
        >
          Payment Transactions ({payments.length})
        </button>
      </div>

      {/* PACKAGES TAB */}
      {activeTab === 'packages' && (
        <Card className="overflow-hidden">
          <div className="p-4 bg-ink-50 border-b border-ink-100 flex items-center justify-between text-xs font-bold text-ink-700">
            <span>{packages.length} package{packages.length === 1 ? '' : 's'} configured</span>
          </div>

          {packages.length === 0 ? (
            <div className="p-12 text-center text-sm text-ink-500">
              No packages found. Create a package to allow students to purchase access.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-ink-50/50 border-b border-ink-100 text-xs font-bold uppercase text-ink-600">
                  <tr>
                    <th className="px-4 py-3">Package Name</th>
                    <th className="px-4 py-3">Plan Type</th>
                    <th className="px-4 py-3">Target Scope</th>
                    <th className="px-4 py-3">Regular Price</th>
                    <th className="px-4 py-3">Subscriber Price</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Subscribers</th>
                    <th className="px-4 py-3">Total Revenue</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {packages.map((pkg) => (
                    <tr key={pkg.id} className="hover:bg-ink-50/50">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-ink-900">{pkg.name}</p>
                        {pkg.description && (
                          <p className="text-xs text-ink-500 line-clamp-1">{pkg.description}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          tone={
                            pkg.package_type === 'session'
                              ? 'teal'
                              : pkg.package_type === 'level'
                              ? 'teal'
                              : pkg.package_type === 'course'
                              ? 'green'
                              : pkg.package_type === 'resource'
                              ? 'amber'
                              : 'neutral'
                          }
                        >
                          {pkg.package_type === 'session'
                            ? 'Session Pass'
                            : pkg.package_type === 'level'
                            ? 'Level Pass'
                            : pkg.package_type === 'course'
                            ? 'Course Pass'
                            : pkg.package_type === 'resource'
                            ? 'Single Resource'
                            : 'Semester Plan'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-700 font-medium max-w-xs truncate">
                        {pkg.target_name ?? 'Entire Catalogue'}
                      </td>
                      <td className="px-4 py-3 font-semibold text-ink-900 whitespace-nowrap">
                        ₦{(pkg.price_minor / 100).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {pkg.subscriber_price_minor ? (
                          <span className="font-semibold text-emerald-700">
                            ₦{(pkg.subscriber_price_minor / 100).toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-xs text-ink-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={pkg.is_active ? 'green' : 'neutral'}>
                          {pkg.is_active ? 'Active & Published' : 'Inactive (Hidden)'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-ink-700">
                        {pkg.buyers_count ?? 0}
                      </td>
                      <td className="px-4 py-3 font-semibold text-emerald-700 whitespace-nowrap">
                        ₦{((pkg.total_revenue_minor ?? 0) / 100).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right space-x-1 whitespace-nowrap">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleToggleActive(pkg)}
                          title="Toggle student visibility"
                        >
                          {pkg.is_active ? 'Hide' : 'Activate'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleOpenEdit(pkg)}
                          leftIcon={<Edit2 className="h-3.5 w-3.5" />}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => setDeleteModalPackage(pkg)}
                          title="Delete package"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* PAYMENTS TAB */}
      {activeTab === 'payments' && (
        <Card className="overflow-hidden">
          <div className="p-4 bg-ink-50 border-b border-ink-100 flex items-center justify-between text-xs font-bold text-ink-700">
            <span>{payments.length} transaction{payments.length === 1 ? '' : 's'} recorded</span>
          </div>

          {payments.length === 0 ? (
            <div className="p-12 text-center text-sm text-ink-500">
              No verified payment transactions recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-ink-50/50 border-b border-ink-100 text-xs font-bold uppercase text-ink-600">
                  <tr>
                    <th className="px-4 py-3">Reference</th>
                    <th className="px-4 py-3">Student ID</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {payments.map((p) => (
                    <tr key={p.id} className="hover:bg-ink-50/50">
                      <td className="px-4 py-3 font-mono text-xs font-bold text-ink-900">{p.reference}</td>
                      <td className="px-4 py-3 text-xs text-ink-600">User #{p.user_id}</td>
                      <td className="px-4 py-3 font-semibold text-ink-900">₦{(p.amount_minor / 100).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <Badge tone={p.status === 'succeeded' ? 'green' : p.status === 'pending' ? 'amber' : 'neutral'}>
                          {p.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-500 whitespace-nowrap">{formatDate(p.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* CREATE / EDIT PACKAGE DIALOG */}
      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingPackage ? 'Edit Access Package' : 'Create Access Package'}
      >
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {formError && <Alert tone="error">{formError}</Alert>}

          {/* Missing semester warning */}
          {semesters.length === 0 && (
            <Alert tone="warning">
              <div className="flex flex-col gap-1.5">
                <span className="font-bold">No academic semesters exist yet.</span>
                <span className="text-xs">
                  A semester or academic session is required to target semester and session passes.
                </span>
                <Link to="/admin/academic" className="text-xs font-semibold text-teal-800 underline">
                  Create an academic session and semester first &rarr;
                </Link>
              </div>
            </Alert>
          )}

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-ink-600 mb-1">
              Package Name
            </label>
            <Input
              required
              placeholder="e.g. 2026/2027 1st Semester Pass"
              value={packageName}
              onChange={(e) => setPackageName(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-ink-600 mb-1">
              Description
            </label>
            <Input
              placeholder="e.g. Full access to lecture handouts and practice exams"
              value={packageDesc}
              onChange={(e) => setPackageDesc(e.target.value)}
            />
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-ink-600 mb-1">
                Plan Type
              </label>
              <Select
                value={packageType}
                onChange={(e) => setPackageType(e.target.value)}
              >
                <option value="semester">Semester Subscription</option>
                <option value="session">Session Pass (Both Semesters)</option>
                <option value="level">Level Pass (Cross-Level / Study Ahead)</option>
                <option value="course">Course Pass (Single Course Pass)</option>
                <option value="resource">Single Resource Pass</option>
              </Select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-ink-600 mb-1">
                Regular Price (₦)
              </label>
              <Input
                required
                type="number"
                min="50"
                step="50"
                placeholder="1500"
                value={packageNairaPrice}
                onChange={(e) => setPackageNairaPrice(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-ink-600 mb-1">
                Subscriber Price (₦)
              </label>
              <Input
                type="number"
                min="0"
                step="50"
                placeholder="e.g. 1000 or 200"
                value={packageSubscriberNairaPrice}
                onChange={(e) => setPackageSubscriberNairaPrice(e.target.value)}
                title="Discounted price for students with active subscription"
              />
            </div>
          </div>

          {/* Conditional Target Scope Picker */}
          {packageType === 'semester' && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-ink-600 mb-1">
                Target Semester
              </label>
              {semesters.length > 0 ? (
                <Select
                  value={packageSemesterId}
                  onChange={(e) => setPackageSemesterId(e.target.value)}
                  required
                >
                  {semesters.map((sem) => (
                    <option key={sem.id} value={sem.id}>
                      {getSemesterLabel(sem)}
                    </option>
                  ))}
                </Select>
              ) : (
                <p className="text-xs text-red-600 font-semibold">
                  No semesters available. Please create a semester in Academic Directory.
                </p>
              )}
            </div>
          )}

          {packageType === 'session' && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-ink-600 mb-1">
                Target Academic Session
              </label>
              <Select
                value={packageSessionId}
                onChange={(e) => setPackageSessionId(e.target.value)}
                required
              >
                {sessions.map((sess) => (
                  <option key={sess.id} value={sess.id}>
                    Session {sess.name} ({formatDate(sess.starts_on)} to {formatDate(sess.ends_on)})
                  </option>
                ))}
              </Select>
            </div>
          )}

          {packageType === 'level' && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-ink-600 mb-1">
                Target Academic Level (All Level Resources)
              </label>
              <Select
                value={packageLevelId}
                onChange={(e) => setPackageLevelId(e.target.value)}
                required
              >
                {levels.map((lvl) => (
                  <option key={lvl.id} value={lvl.id}>
                    {lvl.name} ({lvl.code})
                  </option>
                ))}
              </Select>
            </div>
          )}

          {packageType === 'course' && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-ink-600 mb-1">
                Target Course
              </label>
              <Select
                value={packageCourseId}
                onChange={(e) => setPackageCourseId(e.target.value)}
                required
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} &middot; {c.title}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {packageType === 'resource' && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-ink-600 mb-1">
                Target Resource
              </label>
              <Select
                value={packageResourceId}
                onChange={(e) => setPackageResourceId(e.target.value)}
                required
              >
                {resources.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title} ({r.file_name})
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="package_is_active"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded border-ink-300 text-teal-600 focus:ring-teal-500 h-4 w-4"
            />
            <label htmlFor="package_is_active" className="text-sm font-medium text-ink-800">
              Active and visible in Student Pricing store
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-ink-100">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              {editingPackage ? 'Update Package' : 'Publish Package'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* DELETE CONFIRMATION DIALOG */}
      {deleteModalPackage && (
        <Dialog
          open
          onClose={() => setDeleteModalPackage(null)}
          title="Delete / Deactivate Package"
        >
          <div className="space-y-4">
            <p className="text-sm text-ink-700 leading-relaxed">
              Are you sure you want to delete <strong>{deleteModalPackage.name}</strong>?
            </p>
            <p className="text-xs text-ink-500">
              Note: If this package has past payments or active student entitlements, the system will safely archive and deactivate it so students retain their historical receipts.
            </p>
            <div className="flex justify-end gap-2 pt-3 border-t border-ink-100">
              <Button variant="outline" onClick={() => setDeleteModalPackage(null)}>
                Cancel
              </Button>
              <Button
                className="bg-red-600 hover:bg-red-700 text-white"
                loading={deleting}
                onClick={handleDeletePackage}
              >
                Confirm Delete
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
