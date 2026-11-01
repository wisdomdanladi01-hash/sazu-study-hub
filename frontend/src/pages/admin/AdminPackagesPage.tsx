import { useEffect, useState } from 'react';
import {
  CreditCard,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  X,
  Edit2,
  ToggleLeft,
  ToggleRight,
  Receipt,
} from 'lucide-react';
import { adminService } from '@/services/admin';

interface SubscriptionPackage {
  id: number;
  name: string;
  description: string | null;
  price_minor: number;
  currency: string;
  semester_id: number;
  is_active: boolean;
}

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
  const [packages, setPackages] = useState<SubscriptionPackage[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'packages' | 'payments'>('packages');

  // Create / Edit Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<SubscriptionPackage | null>(null);
  const [packageName, setPackageName] = useState('');
  const [packageDesc, setPackageDesc] = useState('');
  const [packageNairaPrice, setPackageNairaPrice] = useState('2500');
  const [packageSemesterId, setPackageSemesterId] = useState('1');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [pkgs, pms] = await Promise.all([
        adminService.listPackages(),
        adminService.listPayments().catch(() => [] as PaymentRecord[]),
      ]);
      setPackages(pkgs);
      setPayments(pms);
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
    setPackageNairaPrice('2500');
    setPackageSemesterId('1');
    setFormError(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (pkg: SubscriptionPackage) => {
    setEditingPackage(pkg);
    setPackageName(pkg.name);
    setPackageDesc(pkg.description || '');
    setPackageNairaPrice((pkg.price_minor / 100).toString());
    setPackageSemesterId(pkg.semester_id?.toString() || '1');
    setFormError(null);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingPackage(null);
    setFormError(null);
  };

  const handleToggleStatus = async (pkg: SubscriptionPackage) => {
    try {
      const updated = await adminService.updatePackage(pkg.id, {
        is_active: !pkg.is_active,
      });
      setPackages((prev) =>
        prev.map((item) => (item.id === pkg.id ? { ...item, is_active: updated.is_active } : item)),
      );
      setSuccessMessage(`Package "${pkg.name}" is now ${!pkg.is_active ? 'active' : 'inactive'}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update package status');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const naira = parseFloat(packageNairaPrice);
    if (isNaN(naira) || naira < 0) {
      setFormError('Please enter a valid price in Naira.');
      return;
    }
    const priceMinor = Math.round(naira * 100);

    try {
      setSubmitting(true);
      setFormError(null);

      if (editingPackage) {
        await adminService.updatePackage(editingPackage.id, {
          name: packageName.trim(),
          description: packageDesc.trim() || undefined,
          price_minor: priceMinor,
        });
        setSuccessMessage(`Package "${packageName}" updated successfully.`);
      } else {
        await adminService.createPackage({
          name: packageName.trim(),
          description: packageDesc.trim() || undefined,
          price_minor: priceMinor,
          currency: 'NGN',
          semester_id: parseInt(packageSemesterId, 10) || 1,
        });
        setSuccessMessage(`New subscription package "${packageName}" created.`);
      }

      handleCloseModal();
      await fetchData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save package');
    } finally {
      setSubmitting(false);
    }
  };

  const formatNaira = (minor: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      maximumFractionDigits: 0,
    }).format(minor / 100);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-emerald-600" />
            <h1 className="text-2xl font-bold text-slate-900">Subscription Packages & Payments</h1>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            Configure access pricing, manage Paystack-enabled semester packages, and review payment activity.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition shadow-xs"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold text-white transition shadow-xs"
          >
            <Plus className="h-4 w-4" />
            New Package
          </button>
        </div>
      </div>

      {/* Global Alerts */}
      {successMessage && (
        <div className="flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">{successMessage}</div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-6">
        <button
          onClick={() => setActiveTab('packages')}
          className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition ${activeTab === 'packages'
            ? 'border-emerald-600 text-emerald-700'
            : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
        >
          <CreditCard className="h-4 w-4" />
          Access Packages ({packages.length})
        </button>
        <button
          onClick={() => setActiveTab('payments')}
          className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition ${activeTab === 'payments'
            ? 'border-emerald-600 text-emerald-700'
            : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
        >
          <Receipt className="h-4 w-4" />
          Live Transactions ({payments.length})
        </button>
      </div>

      {/* Tab Content: Packages */}
      {activeTab === 'packages' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {packages.map((pkg) => (
            <div
              key={pkg.id}
              className={`rounded-2xl border p-5 shadow-xs flex flex-col justify-between transition bg-white ${pkg.is_active ? 'border-slate-200' : 'border-slate-200 bg-slate-50/70 opacity-75'
                }`}
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${pkg.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                      }`}
                  >
                    {pkg.is_active ? 'Active' : 'Archived / Inactive'}
                  </span>
                  <span className="text-xs font-medium text-slate-500">ID #{pkg.id}</span>
                </div>

                <h3 className="text-lg font-bold text-slate-900 mb-1">{pkg.name}</h3>
                <p className="text-xs text-slate-500 mb-4 line-clamp-2">
                  {pkg.description || 'No specific package description provided.'}
                </p>

                <div className="bg-slate-50 rounded-xl p-3 mb-4 border border-slate-100">
                  <div className="text-xs text-slate-500 mb-0.5">Access Price</div>
                  <div className="text-2xl font-black text-slate-900 tracking-tight">
                    {formatNaira(pkg.price_minor)}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Semester ID: {pkg.semester_id}</div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => handleToggleStatus(pkg)}
                  className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition ${pkg.is_active
                    ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                    : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                    }`}
                >
                  {pkg.is_active ? (
                    <>
                      <ToggleRight className="h-4 w-4 text-emerald-600" />
                      Deactivate
                    </>
                  ) : (
                    <>
                      <ToggleLeft className="h-4 w-4 text-slate-400" />
                      Activate
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenEdit(pkg)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                  Edit
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab Content: Payments */}
      {activeTab === 'payments' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          {payments.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-sm">No payment records found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-700">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Payment ID</th>
                    <th className="px-4 py-3 font-semibold">User ID</th>
                    <th className="px-4 py-3 font-semibold">Paystack Reference</th>
                    <th className="px-4 py-3 font-semibold">Amount</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold text-right">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900">#{p.id}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">User #{p.user_id}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-800">{p.reference}</td>
                      <td className="px-4 py-3 font-bold text-slate-900">{formatNaira(p.amount_minor)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold capitalize ${p.status === 'succeeded'
                            ? 'bg-emerald-100 text-emerald-800'
                            : p.status === 'failed'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-amber-100 text-amber-800'
                            }`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-slate-500">
                        {new Date(p.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Package Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="text-base font-bold text-slate-900">
                {editingPackage ? 'Edit Access Package' : 'Create New Subscription Package'}
              </h3>
              <button
                onClick={handleCloseModal}
                className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <div>{formError}</div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Package Name *
                </label>
                <input
                  type="text"
                  required
                  value={packageName}
                  onChange={(e) => setPackageName(e.target.value)}
                  placeholder="e.g. Harmattan Semester Full Access"
                  className="w-full text-sm px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={packageDesc}
                  onChange={(e) => setPackageDesc(e.target.value)}
                  placeholder="Comprehensive access to all lecture notes, handouts, and past questions..."
                  className="w-full text-sm px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Price (NGN) *
                  </label>
                  <input
                    type="number"
                    step="100"
                    min="0"
                    required
                    value={packageNairaPrice}
                    onChange={(e) => setPackageNairaPrice(e.target.value)}
                    className="w-full text-sm px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>
                {!editingPackage && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Semester ID *
                    </label>
                    <input
                      type="number"
                      required
                      value={packageSemesterId}
                      onChange={(e) => setPackageSemesterId(e.target.value)}
                      className="w-full text-sm px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition disabled:opacity-50 shadow-xs"
                >
                  {submitting ? 'Saving...' : editingPackage ? 'Save Changes' : 'Create Package'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

