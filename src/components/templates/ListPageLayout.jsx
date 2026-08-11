import { useMemo, useState } from 'react';
import PageHeader from '../ui/PageHeader';
import FilterPills from '../ui/FilterPills';
import DataTable from '../ui/DataTable';
import BulkActionBar from '../ui/BulkActionBar';
import RecordDrawer from '../ui/RecordDrawer';

export default function ListPageLayout({
  title,
  subtitle,
  breadcrumbs,
  headerActions,
  filters,
  filterOptions,
  filterValue,
  onFilterChange,
  columns,
  data,
  loading,
  emptyTitle,
  emptyDescription,
  emptyAction,
  drawerOpen,
  onDrawerClose,
  drawerTitle,
  drawerSubtitle,
  drawerContent,
  drawerFooter,
  onSelectionChange,
  onRowClick,
  bulkActions,
  className = '',
}) {
  const [selected, setSelected] = useState([]);

  const handleSelectionChange = (rows) => {
    setSelected(rows);
    onSelectionChange?.(rows);
  };

  const bulkBar = useMemo(() => (
    <BulkActionBar
      count={selected.length}
      onClear={() => handleSelectionChange([])}
      {...bulkActions}
    />
  ), [selected.length, bulkActions]);

  return (
    <div className={className}>
      <PageHeader title={title} subtitle={subtitle} breadcrumbs={breadcrumbs} actions={headerActions} />

      {filterOptions?.length > 0 && (
        <FilterPills options={filterOptions} value={filterValue} onChange={onFilterChange} className="mb-4" />
      )}

      {filters}

      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        emptyAction={emptyAction}
        selectable
        onSelectionChange={handleSelectionChange}
        onRowClick={onRowClick}
      />

      {bulkBar}

      <RecordDrawer
        open={drawerOpen}
        onClose={onDrawerClose}
        title={drawerTitle}
        subtitle={drawerSubtitle}
        footer={drawerFooter}
      >
        {drawerContent}
      </RecordDrawer>
    </div>
  );
}
