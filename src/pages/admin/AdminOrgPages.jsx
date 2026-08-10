import { useCallback, useEffect, useState } from 'react';
import { PageHeader, Card, DataTable, Spinner } from '../../components/ui';
import { visitorApi } from '../../utils/visitorApi';
import { useOrganisationPrerequisite } from '../../hooks/useOrganisationPrerequisite';
import OrganisationRequiredBanner from '../../components/admin/OrganisationRequiredBanner';

function AdminListPage({ title, subtitle, fetchFn, columns, breadcrumbs, requiresOrganisation = false }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const { hasOrganisation, hasActiveOrganisation, loading: orgLoading } = useOrganisationPrerequisite();
  const canManageStructure = hasOrganisation && hasActiveOrganisation;

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

  const showOrgGate = requiresOrganisation && !orgLoading && !canManageStructure;

  return (
    <div className="flex flex-col gap-2.5 sm:gap-3">
      <PageHeader
        title={title}
        subtitle={
          requiresOrganisation
            ? `${subtitle} Belong to an organisation — cannot exist without one.`
            : subtitle
        }
        breadcrumbs={breadcrumbs}
      />
      {showOrgGate && <OrganisationRequiredBanner entityLabel={title} />}
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card>
          <DataTable
            columns={columns}
            data={rows}
            emptyTitle={showOrgGate ? 'No organisation yet' : `No ${title.toLowerCase()} found`}
            emptyDescription={
              showOrgGate
                ? `Create an organisation first. ${title} cannot exist without an organisation.`
                : undefined
            }
          />
        </Card>
      )}
    </div>
  );
}

const PAGE_CONFIG = {
  sites: {
    title: 'Sites & Branches',
    subtitle: 'Offices, facilities and branches.',
    fetchFn: () => visitorApi.getSites(),
    breadcrumbs: [{ label: 'Admin', to: '/admin' }, { label: 'Sites' }],
    requiresOrganisation: true,
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'code', label: 'Code' },
      { key: 'address', label: 'Address' },
      { key: 'status', label: 'Status' },
    ],
  },
  stations: {
    title: 'Stations & Gates',
    subtitle: 'Reception desks and entry points.',
    fetchFn: () => visitorApi.getStations(),
    breadcrumbs: [{ label: 'Admin', to: '/admin' }, { label: 'Stations' }],
    requiresOrganisation: true,
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'site_name', label: 'Site' },
      { key: 'type', label: 'Type' },
      { key: 'status', label: 'Status' },
    ],
  },
  departments: {
    title: 'Departments',
    subtitle: 'Organisational departments.',
    fetchFn: () => visitorApi.getDepartments(),
    breadcrumbs: [{ label: 'Admin', to: '/admin' }, { label: 'Departments' }],
    requiresOrganisation: true,
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'code', label: 'Code' },
      { key: 'office_count', label: 'Offices' },
    ],
  },
  offices: {
    title: 'Offices',
    subtitle: 'Office numbers mapped to building, department and organisation.',
    fetchFn: () => visitorApi.getOffices(),
    breadcrumbs: [{ label: 'Admin', to: '/admin' }, { label: 'Offices' }],
    requiresOrganisation: true,
    columns: [
      { key: 'office_number', label: 'Office #' },
      { key: 'name', label: 'Name' },
      { key: 'department_name', label: 'Department' },
      { key: 'building_name', label: 'Building' },
      { key: 'site_name', label: 'Site' },
      { key: 'status', label: 'Status' },
    ],
  },
  hosts: {
    title: 'Employees & Hosts',
    subtitle: 'Employees linked to department and site/branch.',
    fetchFn: () => visitorApi.getHosts(),
    breadcrumbs: [{ label: 'Admin', to: '/admin' }, { label: 'Hosts' }],
    requiresOrganisation: true,
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'department_name', label: 'Department' },
      { key: 'site_name', label: 'Site / Branch' },
      { key: 'office_number', label: 'Office #' },
      { key: 'organisation_name', label: 'Organisation' },
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

export function AdminStationsPage() {
  return <AdminOrgPages page="stations" />;
}

export function AdminDepartmentsPage() {
  return <AdminOrgPages page="departments" />;
}

export function AdminOfficesPage() {
  return <AdminOrgPages page="offices" />;
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
