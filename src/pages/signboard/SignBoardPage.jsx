import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PenLine, ShieldCheck } from 'lucide-react';
import { DataTable, Modal, LoadingButton, StatusBadge } from '../../components/ui';
import SignaturePad from '../../components/ui/SignaturePad';
import { useToast } from '../../context/ToastContext';
import { signBoardApi } from '../../utils/signBoardApi';
import { LOGO_PATH, APP_NAME_SHORT } from '../../../shared/branding.js';

export default function SignBoardPage() {
  const { token } = useParams();
  const toast = useToast();

  const [board, setBoard] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [items, setItems] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);

  const [activeRow, setActiveRow] = useState(null);
  const [signature, setSignature] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const pageRef = useRef(page);
  const pageSizeRef = useRef(pageSize);
  useEffect(() => { pageRef.current = page; }, [page]);
  useEffect(() => { pageSizeRef.current = pageSize; }, [pageSize]);

  const loadBoard = useCallback(async () => {
    try {
      const data = await signBoardApi.getBoard(token);
      setBoard(data);
    } catch {
      setNotFound(true);
    }
  }, [token]);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const data = await signBoardApi.getRequests(token, { page, pageSize });
      setItems(data.items);
      setTotalItems(data.totalItems);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, page, pageSize, toast]);

  useEffect(() => { void loadBoard(); }, [loadBoard]);
  useEffect(() => {
    if (notFound) return;
    void loadRequests();
  }, [loadRequests, notFound]);

  useEffect(() => {
    if (notFound) return undefined;
    const source = new EventSource(signBoardApi.streamUrl(token));

    source.addEventListener('request.created', (e) => {
      const row = JSON.parse(e.data);
      setTotalItems((n) => n + 1);
      if (pageRef.current === 1) {
        setItems((prev) => [row, ...prev].slice(0, pageSizeRef.current));
      }
    });

    source.addEventListener('request.updated', (e) => {
      const row = JSON.parse(e.data);
      setItems((prev) => prev.map((item) => (item.id === row.id ? row : item)));
      setActiveRow((prev) => (prev && prev.id === row.id ? row : prev));
    });

    source.addEventListener('request.cancelled', (e) => {
      const { id } = JSON.parse(e.data);
      setItems((prev) => prev.filter((item) => item.id !== id));
      setTotalItems((n) => Math.max(0, n - 1));
      setActiveRow((prev) => (prev && prev.id === id ? null : prev));
    });

    return () => source.close();
  }, [token, notFound]);

  const openRow = (row) => {
    if (row.status !== 'pending') return;
    setActiveRow(row);
    setSignature('');
  };

  const closeModal = () => {
    setActiveRow(null);
    setSignature('');
  };

  const submitSignature = async () => {
    if (!activeRow || !signature) {
      toast.error('Please sign before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      const signed = await signBoardApi.sign(token, activeRow.id, signature);
      setItems((prev) => prev.map((item) => (item.id === signed.id ? signed : item)));
      toast.success('Signature submitted.');
      closeModal();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    { key: 'full_name', label: 'Visitor name' },
    { key: 'phone', label: 'Mobile number', render: (value) => value || '—' },
    {
      key: 'signature_data',
      label: 'Signature',
      render: (value) => (value ? (
        <img src={value} alt="Signature" className="h-8 w-auto max-w-[120px] rounded border border-gray-200 bg-white object-contain" />
      ) : (
        <span className="text-gray-400">—</span>
      )),
    },
    {
      key: 'status',
      label: 'Status',
      render: (value) => (
        value === 'signed'
          ? <StatusBadge status="confirmed" label="Signed" />
          : <StatusBadge status="pending" label="Pending" />
      ),
    },
  ];

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white p-8 text-center">
        <div>
          <h1 className="text-xl font-semibold">Signature board not found</h1>
          <p className="mt-2 text-sm text-white/60">This link is no longer valid. Ask reception for a fresh one.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="px-6 py-4 flex items-center gap-3 border-b border-white/10">
        <img src={LOGO_PATH} alt="" width={36} height={36} decoding="async" className="h-9 w-9 object-contain" />
        <div>
          <p className="text-xs uppercase tracking-widest text-gray-400">{APP_NAME_SHORT}</p>
          <h1 className="text-lg font-semibold">Signature requests{board?.siteName ? ` — ${board.siteName}` : ''}</h1>
        </div>
      </header>

      <main className="p-4 sm:p-6">
        <div className="mx-auto max-w-5xl">
          <p className="mb-4 flex items-center gap-2 text-sm text-white/60">
            <PenLine size={16} aria-hidden="true" />
            Tap a pending request to sign for that visitor.
          </p>

          <div className="rounded-2xl overflow-hidden">
            <DataTable
              columns={columns}
              data={items}
              loading={loading}
              emptyTitle="No signature requests"
              emptyDescription="New requests from reception will appear here automatically."
              onRowClick={openRow}
              getRowId={(row) => row.id}
              serverPagination
              page={page}
              pageSize={pageSize}
              totalItems={totalItems}
              onPageChange={setPage}
              onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
            />
          </div>
        </div>
      </main>

      <Modal
        isOpen={Boolean(activeRow)}
        onClose={closeModal}
        title="Sign for visitor"
        subtitle={activeRow ? `${activeRow.full_name}${activeRow.phone ? ` · ${activeRow.phone}` : ''}` : ''}
        footer={(
          <>
            <button
              type="button"
              onClick={closeModal}
              className="rounded-xl px-4 py-2 text-sm font-medium text-navy-600 hover:bg-navy-50"
            >
              Cancel
            </button>
            <LoadingButton
              type="button"
              loading={submitting}
              loadingLabel="Submitting…"
              icon={ShieldCheck}
              onClick={submitSignature}
              disabled={!signature}
            >
              Submit signature
            </LoadingButton>
          </>
        )}
      >
        {activeRow?.status === 'signed' ? (
          <div className="flex items-center gap-2 text-sm text-emerald-700">
            <ShieldCheck size={16} aria-hidden="true" />
            This request was just signed.
          </div>
        ) : (
          <SignaturePad
            value={signature}
            onChange={setSignature}
            label="Visitor signature"
            hint="Sign with finger or stylus"
          />
        )}
      </Modal>
    </div>
  );
}
