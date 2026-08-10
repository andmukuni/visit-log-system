import { useCallback, useEffect, useState } from 'react';
import { Card, DataTable, Spinner, StatusBadge } from '../ui';
import { formatDateTime } from '../../utils/helpers';

export default function VisitLogTable({
  visitType,
  status,
  emptyTitle,
  emptyDescription,
  searchPlaceholder,
  loadRows,
  showOrganisationColumn = true,
  onRowClick,
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await loadRows({ visitType, status }));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [visitType, status, loadRows]);

  useEffect(() => {
    load();
  }, [load]);

  const showOrganisation = showOrganisationColumn && rows.some((row) => row.organisation_name);
  const isVehicle = visitType === 'vehicle';

  const columns = [
    { key: 'reference_number', label: 'Reference' },
    { key: 'visitor_name', label: 'Visitor' },
    { key: 'host_name', label: 'Host' },
    ...(showOrganisation ? [{ key: 'organisation_name', label: 'Organisation' }] : []),
    { key: 'site_name', label: 'Site' },
    { key: 'category_name', label: 'Category' },
    ...(isVehicle ? [{ key: 'plate_numbers', label: 'Plates' }] : []),
    {
      key: 'status',
      label: 'Status',
      className: 'whitespace-nowrap',
      render: (_, row) => <StatusBadge status={row.status} iconOnly />,
    },
    {
      key: 'created_at',
      label: 'Registered',
      render: (_, row) => formatDateTime(row.created_at),
    },
    {
      key: 'check_in_at',
      label: 'Check-in',
      render: (_, row) => (row.check_in_at ? formatDateTime(row.check_in_at) : '—'),
    },
    {
      key: 'check_out_at',
      label: 'Check-out',
      render: (_, row) => (row.check_out_at ? formatDateTime(row.check_out_at) : '—'),
    },
  ];

  const searchKeys = [
    'reference_number',
    'visitor_name',
    'host_name',
    'organisation_name',
    'site_name',
    ...(isVehicle ? ['plate_numbers'] : []),
  ];

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size={28} />
      </div>
    );
  }

  return (
    <Card title={`${rows.length} visit${rows.length === 1 ? '' : 's'}`}>
      <DataTable
        embedded
        columns={columns}
        data={rows}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        onRowClick={onRowClick}
        toolbar={{
          placeholder: searchPlaceholder,
          searchKeys,
        }}
      />
    </Card>
  );
}
