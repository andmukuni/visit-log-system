import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, Download } from 'lucide-react';
import {
  PageHeader, Card, DataTable, Spinner, FormField, LoadingButton,
  IconButton, PrintAction,
} from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';
import { useToast } from '../../context/ToastContext';
import { reportsApi, downloadReportExport } from '../../utils/visitorApi';

const MASK_LABELS = {
  full: 'Full detail',
  security: 'Security view',
  operational: 'Operational',
  management: 'Masked (management)',
  compliance: 'Masked (compliance)',
  minimum: 'Minimum detail',
};

export default function ReportsPage({
  portalLabel,
  portalPath,
  title = 'Reports',
  subtitle = 'Preview and export authorised data — field masking matches your role',
}) {
  const toast = useToast();
  const printRef = useRef(null);
  const [types, setTypes] = useState([]);
  const [reportType, setReportType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [purpose, setPurpose] = useState('');
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    reportsApi.getTypes()
      .then((data) => {
        setTypes(data);
        if (data[0]?.type) setReportType(data[0].type);
      })
      .catch(() => setTypes([]));
  }, []);

  const loadPreview = useCallback(async (pageNum = 1) => {
    if (!reportType) return;
    setLoading(true);
    try {
      const data = await reportsApi.preview({
        type: reportType,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        status: status || undefined,
        search: search || undefined,
        page: pageNum,
        limit: 50,
      });
      setPreview(data);
      setPage(pageNum);
    } catch (err) {
      toast.error(err.message);
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [reportType, dateFrom, dateTo, status, search, toast]);

  useEffect(() => {
    if (reportType) loadPreview(1);
  }, [reportType, loadPreview]);

  const runSearch = (e) => {
    e?.preventDefault();
    loadPreview(1);
  };

  const exportCsv = async () => {
    if (!purpose.trim()) {
      toast.error('Please enter an export purpose for the audit trail.');
      return;
    }
    setExporting(true);
    try {
      await downloadReportExport({
        type: reportType,
        purpose: purpose.trim(),
        filters: {
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          status: status || undefined,
          search: search || undefined,
        },
        format: 'csv',
      });
      toast.success('Export downloaded. Recorded in export audit log.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setExporting(false);
    }
  };

  const printPreview = () => {
    if (!preview?.rows?.length) {
      toast.error('Nothing to print.');
      return;
    }
    const win = window.open('', '_blank');
    if (!win) return;
    const cols = preview.columns || [];
    const header = cols.map((c) => `<th>${c.label}</th>`).join('');
    const body = preview.rows.map((row) => (
      `<tr>${cols.map((c) => `<td>${row[c.key] ?? ''}</td>`).join('')}</tr>`
    )).join('');
    win.document.write(`
      <html><head><title>${title} — ${reportType}</title>
      <style>body{font-family:sans-serif;padding:24px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;font-size:12px}th{background:#f4f4f4}</style>
      </head><body>
      <h1>${title}</h1>
      <p>${reportType} · ${preview.maskLevel ? MASK_LABELS[preview.maskLevel] : ''} · ${new Date().toLocaleString()}</p>
      <table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>
      </body></html>
    `);
    win.document.close();
    win.focus();
    win.print();
  };

  const tableColumns = (preview?.columns || []).map((col) => ({
    key: col.key,
    label: col.label,
    render: (_, row) => {
      const val = row[col.key];
      if (col.key.includes('_at') && val) return formatDateTime(val);
      return val ?? '—';
    },
  }));

  const totalPages = preview ? Math.max(1, Math.ceil(preview.total / preview.limit)) : 1;

  return (
    <div ref={printRef}>
      <PageHeader
        title={title}
        subtitle={subtitle}
        breadcrumbs={[{ label: portalLabel, to: portalPath }, { label: 'Reports' }]}
      />

      <Card title="Report filters" className="mb-6">
        <form onSubmit={runSearch} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <FormField
            name="reportType"
            label="Report type"
            type="select"
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
            options={types.map((t) => ({ value: t.type, label: t.label }))}
          />
          <FormField name="dateFrom" label="From date" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <FormField name="dateTo" label="To date" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          {reportType === 'visitors' && (
            <FormField
              name="status"
              label="Status"
              type="select"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              options={[
                { value: '', label: 'All statuses' },
                { value: 'checked_in', label: 'Checked in' },
                { value: 'approved', label: 'Approved' },
                { value: 'pending_approval', label: 'Pending approval' },
                { value: 'completed', label: 'Completed' },
                { value: 'rejected', label: 'Rejected' },
              ]}
            />
          )}
          {(reportType === 'visitors' || reportType === 'audit') && (
            <FormField name="search" label="Search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, phone, action…" />
          )}
          <div className="flex items-end">
            <LoadingButton type="submit" loading={loading} icon={Eye} iconOnly aria-label="Preview" />
          </div>
        </form>
      </Card>

      {preview && (
        <Card
          title={`Preview — ${preview.total} row${preview.total === 1 ? '' : 's'}`}
          subtitle={preview.maskLevel ? `Data masking: ${MASK_LABELS[preview.maskLevel] || preview.maskLevel}` : undefined}
          className="mb-6"
        >
          {loading ? (
            <div className="flex justify-center py-12"><Spinner size={28} /></div>
          ) : (
            <>
              <DataTable
                columns={tableColumns}
                data={preview.rows}
                emptyTitle="No data"
                emptyDescription="Adjust filters and preview again."
              />
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-navy-100">
                  <IconButton
                    icon={ChevronLeft}
                    label="Previous"
                    tooltip="Previous"
                    variant="secondary"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => loadPreview(page - 1)}
                  />
                  <span className="text-sm text-navy-500">Page {page} of {totalPages}</span>
                  <IconButton
                    icon={ChevronRight}
                    label="Next"
                    tooltip="Next"
                    variant="secondary"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => loadPreview(page + 1)}
                  />
                </div>
              )}
            </>
          )}
        </Card>
      )}

      <Card title="Export">
        <p className="text-sm text-navy-600 mb-4">
          Exports apply the same field masking as the preview above. Each export is recorded with your user, purpose, filters and row count.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
          <FormField
            name="purpose"
            label="Export purpose (required)"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="e.g. Monthly visitor review for HR"
            required
          />
        </div>
        <div className="flex flex-wrap gap-3 mt-4">
          <LoadingButton
            loading={exporting}
            onClick={exportCsv}
            icon={Download}
            iconOnly
            aria-label="Download CSV (Excel)"
          />
          <PrintAction onClick={printPreview} label="Print / PDF" />
        </div>
      </Card>
    </div>
  );
}
