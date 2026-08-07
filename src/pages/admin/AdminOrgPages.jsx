import { useCallback, useEffect, useState } from 'react';
import { PageHeader, Card, DataTable, Spinner } from '../../components/ui';
import { visitorApi } from '../../utils/visitorApi';

function AdminListPage({ title, subtitle, fetchFn, columns, breadcrumbs }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchFn();
      setRows(data);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [fetchFn]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} breadcrumbs={breadcrumbs} />
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card>
          <DataTable columns={columns} data={rows} emptyTitle={`No ${title.toLowerCase()} found`} />
        </Card>
      )}
    </div>
  );
}

const PAGE_CONFIG = {
  sites: {
    title: 'Sites & Branches',
    subtitle: 'Offices, facilities and branches',
    fetchFn: () => visitorApi.getSites(),
    breadcrumbs: [{ label: 'Admin', to: '/admin' }, { label: 'Sites' }],
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'code', label: 'Code' },
      { key: 'address', label: 'Address' },
      { key: 'status', label: 'Status' },
    ],
  },
  stations: {
    title: 'Stations & Gates',
    subtitle: 'Reception desks and entry points',
    fetchFn: () => visitorApi.getStations(),
    breadcrumbs: [{ label: 'Admin', to: '/admin' }, { label: 'Stations' }],
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'site_name', label: 'Site' },
      { key: 'type', label: 'Type' },
      { key: 'status', label: 'Status' },
    ],
  },
  departments: {
    title: 'Departments',
    subtitle: 'Organisational departments',
    fetchFn: () => visitorApi.getDepartments(),
    breadcrumbs: [{ label: 'Admin', to: '/admin' }, { label: 'Departments' }],
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'code', label: 'Code' },
    ],
  },
  hosts: {
    title: 'Employees & Hosts',
    subtitle: 'People who may receive visitors',
    fetchFn: () => visitorApi.getHosts(),
    breadcrumbs: [{ label: 'Admin', to: '/admin' }, { label: 'Hosts' }],
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'department_name', label: 'Department' },
      { key: 'status', label: 'Status' },
    ],
  },
  categories: {
    title: 'Visitor Categories',
    subtitle: 'Guest, contractor, supplier and delivery types',
    fetchFn: () => visitorApi.getCategories(),
    breadcrumbs: [{ label: 'Admin', to: '/admin' }, { label: 'Categories' }],
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'slug', label: 'Slug' },
      {
        key: 'requires_approval',
        label: 'Requires approval',
        render: (_, row) => (row.requires_approval ? 'Yes' : 'No'),
      },
      { key: 'default_duration_minutes', label: 'Default duration (min)' },
    ],
  },
  badges: {
    title: 'Badge Inventory',
    subtitle: 'Available, issued and blocked badges',
    fetchFn: () => visitorApi.getBadges(),
    breadcrumbs: [{ label: 'Admin', to: '/admin' }, { label: 'Badges' }],
    columns: [
      { key: 'badge_number', label: 'Badge #' },
      { key: 'status', label: 'Status' },
    ],
  },
};

export default function AdminOrgPages({ page = 'sites' }) {
  const config = PAGE_CONFIG[page] || PAGE_CONFIG.sites;
  return <AdminListPage {...config} />;
}

export function AdminSitesPage() {
  return <AdminOrgPages page="sites" />;
}

export function AdminStationsPage() {
  return <AdminOrgPages page="stations" />;
}

export function AdminDepartmentsPage() {
  return <AdminOrgPages page="departments" />;
}

export function AdminHostsPage() {
  return <AdminOrgPages page="hosts" />;
}

export function AdminCategoriesPage() {
  return <AdminOrgPages page="categories" />;
}

export function AdminBadgesPage() {
  return <AdminOrgPages page="badges" />;
}
