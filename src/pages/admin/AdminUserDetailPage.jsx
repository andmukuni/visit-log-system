import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Edit3,
  KeyRound,
  Mail,
  Shield,
  User,
  UserCheck,
} from 'lucide-react';
import {
  PageHeader,
  StatusBadge,
  Modal,
  FormField,
  LoadingButton,
} from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { formatDate } from '../../utils/helpers';
import { getApiBase } from '../../utils/apiBase';
import { getAdminAuthHeaders } from '../../utils/authHeaders';

const API_BASE = getApiBase();

async function adminFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...getAdminAuthHeaders(),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) {
    throw new Error(json?.message || `Request failed (${res.status})`);
  }
  return json;
}

function DetailItem({ icon: Icon, label, value }) {
  return (
    <div className="flex gap-3">
      <Icon size={16} className="mt-0.5 shrink-0 text-gray-400" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <p className="mt-1 text-sm font-semibold text-navy-900 break-words">{value || '—'}</p>
      </div>
    </div>
  );
}

export default function AdminUserDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [user, setUser] = useState(null);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [roleId, setRoleId] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [userJson, rolesJson] = await Promise.all([
        adminFetch(`/admin/users/${encodeURIComponent(id)}`),
        adminFetch('/admin/roles'),
      ]);
      setUser(userJson.data);
      setRoles(Array.isArray(rolesJson.data) ? rolesJson.data : []);
    } catch (err) {
      setUser(null);
      toast.error(err?.message || 'Unable to load user.');
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const openEdit = () => {
    if (!user) return;
    setRoleId(user.role_id || '');
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const json = await adminFetch(`/admin/users/${encodeURIComponent(user.id)}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ roleId: roleId || null }),
      });
      setUser(json.data);
      toast.success(`Role updated for ${user.name || user.email}.`);
      setModalOpen(false);
    } catch (err) {
      toast.error(err?.message || 'Could not update role.');
    } finally {
      setSaving(false);
    }
  };

  const roleOptions = roles.map((role) => ({ value: role.id, label: role.name }));

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <PageHeader
          title="User"
          breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Users', to: '/admin/users' }, { label: 'Details' }]}
        />
        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-10 text-sm text-gray-500 shadow-sm">
          Loading user…
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col gap-3">
        <PageHeader
          title="User not found"
          breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Users', to: '/admin/users' }, { label: 'Details' }]}
        />
        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-8 shadow-sm">
          <p className="text-sm text-gray-600">This user could not be found or you do not have access.</p>
          <Link
            to="/admin/users"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#1a73e8] hover:underline"
          >
            <ArrowLeft size={14} /> Back to users
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 sm:gap-3">
      <PageHeader
        title={user.name || 'Unnamed user'}
        subtitle={user.email || 'No email'}
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Users', to: '/admin/users' },
          { label: user.name || user.email || 'User' },
        ]}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/admin/users')}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50 sm:px-3"
            >
              <ArrowLeft size={14} />
              Back
            </button>
            <button
              type="button"
              onClick={openEdit}
              className="inline-flex items-center gap-1.5 rounded-md bg-navy-900 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-navy-800 sm:px-3"
            >
              <Edit3 size={14} />
              Edit role
            </button>
          </div>
        )}
      />

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-navy-900">{user.name || 'Unnamed user'}</h2>
              <StatusBadge status={user.email_verified ? 'confirmed' : 'pending'} />
            </div>
            <p className="mt-1 text-sm text-gray-500">{user.email || 'No email'}</p>
          </div>
        </div>

        <div className="grid gap-5 px-4 py-5 sm:px-6 lg:grid-cols-2">
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-400">Account</h3>
            <div className="mt-2.5 grid gap-2.5">
              <DetailItem icon={User} label="Name" value={user.name} />
              <DetailItem icon={Mail} label="Email" value={user.email} />
              <DetailItem
                icon={UserCheck}
                label="Verified"
                value={user.email_verified ? 'Yes' : 'No'}
              />
              <DetailItem icon={Mail} label="Joined" value={formatDate(user.created_at)} />
            </div>
          </section>
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-400">Access</h3>
            <div className="mt-2.5 grid gap-2.5">
              <DetailItem icon={Shield} label="Portal role" value={user.role_name || 'No portal role'} />
              <DetailItem icon={KeyRound} label="Legacy role" value={user.role || 'user'} />
            </div>
          </section>
        </div>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title="Edit portal role"
        subtitle={`Assign a portal role for ${user.name || user.email}.`}
        size="md"
        footer={(
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => setModalOpen(false)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700"
            >
              Cancel
            </button>
            <LoadingButton loading={saving} onClick={handleSave}>
              Save role
            </LoadingButton>
          </div>
        )}
      >
        <FormField
          label="Portal role"
          name="roleId"
          type="select"
          value={roleId}
          onChange={(e) => setRoleId(e.target.value)}
          options={[
            { value: '', label: 'No portal role' },
            ...roleOptions,
          ]}
        />
      </Modal>
    </div>
  );
}
