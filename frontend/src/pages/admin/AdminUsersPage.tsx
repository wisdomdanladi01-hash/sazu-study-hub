import { useEffect, useState } from 'react';
import { adminService, type AdminUserItem, type RoleItem } from '@/services/admin';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';
import { Dialog } from '@/components/ui/Dialog';
import {
  Users,
  Shield,
  ShieldCheck,
  Plus,
  RefreshCw,
  Edit2,
  CheckCircle2,
} from 'lucide-react';
import { formatDate } from '@/utils/format';

export function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Create Modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState('content_admin');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Edit Role Modal
  const [roleModalItem, setRoleModalItem] = useState<AdminUserItem | null>(null);
  const [editRoleName, setEditRoleName] = useState('content_admin');

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [uList, rList] = await Promise.all([
        adminService.listAdminUsers(),
        adminService.listRoles().catch(() => [] as RoleItem[]),
      ]);
      setUsers(uList);
      setRoles(rList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load administrative users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      await adminService.createAdminUser({
        full_name: fullName,
        email,
        password: password || undefined,
        role_name: selectedRole,
      });
      setSuccess(`Administrator ${fullName} created successfully.`);
      setCreateModalOpen(false);
      setFullName('');
      setEmail('');
      setPassword('');
      await loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create administrator.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleModalItem) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await adminService.updateAdminUserRole(roleModalItem.id, editRoleName);
      setSuccess(`Updated role for ${roleModalItem.full_name} to ${editRoleName}.`);
      setRoleModalItem(null);
      await loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to update administrator role.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-950 flex items-center gap-2">
            <Users className="h-6 w-6 text-teal-600" />
            Administrator Authorities & Roles
          </h1>
          <p className="mt-1 text-sm text-ink-600">
            Enforce role-based access control (RBAC). Super admins can provision administrators and assign authorities.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadData} loading={loading} leftIcon={<RefreshCw className="h-4 w-4" />}>
            Refresh
          </Button>
          <Button size="sm" onClick={() => setCreateModalOpen(true)} leftIcon={<Plus className="h-4 w-4" />}>
            New Administrator
          </Button>
        </div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {success && (
        <Alert tone="success" onClose={() => setSuccess(null)}>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>{success}</span>
          </div>
        </Alert>
      )}

      {/* Users Table */}
      <Card className="overflow-hidden">
        <div className="p-4 bg-ink-50 border-b border-ink-100 flex items-center justify-between text-xs font-bold text-ink-700">
          <span>{users.length} authorized administrator{users.length === 1 ? '' : 's'}</span>
        </div>

        {users.length === 0 ? (
          <div className="p-12 text-center text-sm text-ink-500">
            No administrative users found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-ink-50/50 border-b border-ink-100 text-xs font-bold uppercase text-ink-600">
                <tr>
                  <th className="px-4 py-3">Administrator</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Authorities / Capabilities</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-ink-50/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink-900">{u.full_name}</span>
                        {u.is_superuser && (
                          <Badge tone="teal" className="text-[10px]">Superuser</Badge>
                        )}
                      </div>
                      <p className="text-xs text-ink-500">{u.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        tone={
                          u.role_name === 'super_admin'
                            ? 'teal'
                            : u.role_name === 'finance_admin'
                            ? 'amber'
                            : u.role_name === 'verification_officer'
                            ? 'neutral'
                            : 'green'
                        }
                      >
                        {u.role_name ?? (u.is_superuser ? 'super_admin' : 'admin')}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1 max-w-md">
                        {u.is_superuser ? (
                          <span className="text-xs text-teal-800 font-semibold">All permissions (Full platform superuser)</span>
                        ) : u.permissions && u.permissions.length > 0 ? (
                          u.permissions.map((cap) => (
                            <span
                              key={cap}
                              className="inline-block text-[10px] font-mono bg-ink-100 text-ink-700 px-1.5 py-0.5 rounded"
                            >
                              {cap}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-ink-400">None assigned</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-500 whitespace-nowrap">
                      {formatDate(u.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setRoleModalItem(u);
                          setEditRoleName(u.role_name || 'content_admin');
                        }}
                        leftIcon={<Edit2 className="h-3.5 w-3.5" />}
                      >
                        Change Role
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create Administrator Dialog */}
      <Dialog
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Provision New Administrator"
      >
        <form onSubmit={handleCreateAdmin} className="space-y-4 pt-2">
          {formError && <Alert tone="error">{formError}</Alert>}

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-ink-600 mb-1">
              Full Name
            </label>
            <Input
              required
              placeholder="e.g. Amina Bello"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-ink-600 mb-1">
              Official Email
            </label>
            <Input
              required
              type="email"
              placeholder="e.g. amina@sazu.edu.ng"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-ink-600 mb-1">
              Assigned Authority Role
            </label>
            <Select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
            >
              <option value="content_admin">Content Admin (Materials, Tests & Directory)</option>
              <option value="finance_admin">Finance Admin (Packages, Payments & Refunds)</option>
              <option value="verification_officer">Verification Officer (Student Verification Documents)</option>
              <option value="super_admin">Super Admin (Full Access & User Management)</option>
            </Select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-ink-600 mb-1">
              Password
            </label>
            <Input
              required
              type="password"
              placeholder="Minimum 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-ink-100">
            <Button type="button" variant="ghost" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting} leftIcon={<ShieldCheck className="h-4 w-4" />}>
              Create Administrator
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Edit Role Dialog */}
      <Dialog
        open={Boolean(roleModalItem)}
        onClose={() => setRoleModalItem(null)}
        title={`Change Role: ${roleModalItem?.full_name}`}
      >
        <form onSubmit={handleUpdateRole} className="space-y-4 pt-2">
          {formError && <Alert tone="error">{formError}</Alert>}

          <p className="text-sm text-ink-600">
            Assigning a new role dynamically updates this administrator&apos;s permissions across the API.
          </p>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-ink-600 mb-1">
              Select Role
            </label>
            <Select
              value={editRoleName}
              onChange={(e) => setEditRoleName(e.target.value)}
            >
              <option value="content_admin">Content Admin (Materials, Tests & Directory)</option>
              <option value="finance_admin">Finance Admin (Packages, Payments & Refunds)</option>
              <option value="verification_officer">Verification Officer (Student Documents)</option>
              <option value="super_admin">Super Admin (Full Platform Authority)</option>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-ink-100">
            <Button type="button" variant="ghost" onClick={() => setRoleModalItem(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Save Authority Role
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
