import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, PenLine, ShieldCheck } from 'lucide-react';
import { LoadingButton } from '../../components/ui';
import SignaturePad from '../../components/ui/SignaturePad';
import { useToast } from '../../context/ToastContext';
import { signBoardApi } from '../../utils/signBoardApi';
import { LOGO_PATH, APP_NAME_SHORT } from '../../../shared/branding.js';

function initials(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || '?';
}

function formatClock(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function RequestCard({ row, onOpen }) {
  const pending = row.status === 'pending';
  return (
    <button
      type="button"
      onClick={() => pending && onOpen(row)}
      disabled={!pending}
      className={`flex w-full items-center gap-4 rounded-3xl px-5 py-4 text-left transition-all ${
        pending
          ? 'bg-white text-navy-900 shadow-[0_12px_40px_rgba(0,0,0,0.18)] ring-1 ring-white/70 hover:-translate-y-0.5 hover:shadow-[0_16px_48px_rgba(0,0,0,0.22)] active:translate-y-0'
          : 'bg-white/6 text-white/70 ring-1 ring-white/10'
      }`}
    >
      <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-semibold ${
        pending ? 'bg-navy-900 text-white' : 'bg-white/10 text-white'
      }`}
      >
        {initials(row.full_name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-lg font-semibold ${pending ? 'text-navy-900' : 'text-white'}`}>
          {row.full_name}
        </span>
        <span className={`mt-0.5 block truncate text-sm ${pending ? 'text-navy-400' : 'text-white/40'}`}>
          {row.phone || 'No mobile number'}
        </span>
      </span>
      {row.signature_data ? (
        <img
          src={row.signature_data}
          alt=""
          className="h-10 w-auto max-w-[120px] rounded-lg bg-white object-contain px-2 py-1"
        />
      ) : null}
      <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
        pending
          ? 'bg-amber-100 text-amber-800'
          : 'bg-emerald-500/20 text-emerald-200'
      }`}
      >
        {pending ? 'Tap to sign' : 'Signed'}
      </span>
    </button>
  );
}

export default function SignBoardPage() {
  const { token } = useParams();
  const toast = useToast();

  const [board, setBoard] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [items, setItems] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 8;
  const [loading, setLoading] = useState(true);
  const [clock, setClock] = useState(() => new Date());

  const [activeRow, setActiveRow] = useState(null);
  const [signature, setSignature] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const pageRef = useRef(page);
  useEffect(() => { pageRef.current = page; }, [page]);

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

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
        setItems((prev) => [row, ...prev].slice(0, pageSize));
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

  const closePad = () => {
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
      closePad();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const pendingCount = items.filter((row) => row.status === 'pending').length;

  if (notFound) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-navy-950 p-8 text-center text-white">
        <div className="max-w-md">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-white/8 ring-1 ring-white/10">
            <PenLine size={28} aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-semibold">Signature pad not found</h1>
          <p className="mt-2 text-sm text-white/55">This link is no longer valid. Ask reception for a fresh one.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-screen min-h-0 flex-col overflow-hidden bg-navy-950 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(56,190,201,0.16),_transparent_55%),radial-gradient(ellipse_at_bottom,_rgba(16,42,67,0.9),_transparent_60%)]" />

      <header className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-8">
        <div className="flex items-center gap-3">
          <img src={LOGO_PATH} alt="" width={40} height={40} decoding="async" className="h-10 w-10 object-contain" />
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-white/45">{APP_NAME_SHORT}</p>
            <h1 className="text-xl font-semibold tracking-tight">
              Signature pad{board?.siteName ? ` · ${board.siteName}` : ''}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm text-white/60">
          <span className="hidden items-center gap-2 rounded-full bg-white/8 px-3 py-1.5 ring-1 ring-white/10 sm:inline-flex">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            Live
          </span>
          <span className="tabular-nums">{formatClock(clock)}</span>
        </div>
      </header>

      <main className="relative z-10 flex min-h-0 flex-1 flex-col px-4 pb-6 sm:px-8">
        <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-2xl font-semibold tracking-tight sm:text-3xl">Please sign in</p>
              <p className="mt-1 text-sm text-white/50">Tap your name, then sign with your finger or stylus.</p>
            </div>
            <p className="shrink-0 rounded-full bg-white/8 px-3 py-1 text-xs font-medium text-white/60 ring-1 ring-white/10">
              {pendingCount} waiting
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pr-1">
            {loading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((key) => (
                  <div key={key} className="h-[88px] animate-pulse rounded-3xl bg-white/8" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="flex min-h-[22rem] flex-col items-center justify-center rounded-[2rem] border border-dashed border-white/15 bg-white/5 px-8 text-center">
                <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-white/8 text-cyan-200">
                  <PenLine size={28} aria-hidden="true" />
                </span>
                <p className="text-lg font-semibold">Waiting for a request</p>
                <p className="mt-1 max-w-sm text-sm text-white/45">
                  New names from reception appear here automatically.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((row) => (
                  <RequestCard key={row.id} row={row} onOpen={openRow} />
                ))}
              </div>
            )}
          </div>

          {totalItems > pageSize ? (
            <div className="mt-4 flex items-center justify-between text-sm text-white/50">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((n) => Math.max(1, n - 1))}
                className="inline-flex items-center gap-1 rounded-full px-3 py-2 disabled:opacity-30"
              >
                <ChevronLeft size={16} aria-hidden="true" /> Previous
              </button>
              <span className="tabular-nums">{page} / {totalPages}</span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((n) => Math.min(totalPages, n + 1))}
                className="inline-flex items-center gap-1 rounded-full px-3 py-2 disabled:opacity-30"
              >
                Next <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </div>
      </main>

      {activeRow ? (
        <div className="absolute inset-0 z-20 flex items-end justify-center bg-navy-950/70 p-3 backdrop-blur-md sm:items-center sm:p-6">
          <div className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-[2rem] bg-[#f7f4ee] text-navy-900 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
            <div className="flex items-start justify-between gap-4 px-6 pt-6 sm:px-8">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-navy-400">Visitor signature</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight">{activeRow.full_name}</h2>
                {activeRow.phone ? (
                  <p className="mt-0.5 text-sm text-navy-400">{activeRow.phone}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={closePad}
                className="rounded-full px-3 py-1.5 text-sm font-medium text-navy-500 hover:bg-navy-900/5"
              >
                Close
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 sm:px-8">
              {activeRow.status === 'signed' ? (
                <div className="flex flex-col items-center gap-4 rounded-[1.5rem] bg-white px-6 py-10 text-center ring-1 ring-navy-100">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                    <ShieldCheck size={26} aria-hidden="true" />
                  </span>
                  <p className="text-lg font-semibold">Thank you — signed</p>
                  {activeRow.signature_data ? (
                    <img
                      src={activeRow.signature_data}
                      alt="Submitted signature"
                      className="h-20 w-auto max-w-[240px] object-contain"
                    />
                  ) : null}
                </div>
              ) : (
                <SignaturePad
                  value={signature}
                  onChange={setSignature}
                  label="Sign here"
                  hint="Use your finger or stylus"
                  paper
                  showGuide
                  minHeight={240}
                  maxHeight={380}
                  aspect={0.42}
                />
              )}
            </div>

            {activeRow.status !== 'signed' ? (
              <div className="flex items-center justify-end gap-3 border-t border-navy-100/70 px-6 py-4 sm:px-8">
                <button
                  type="button"
                  onClick={closePad}
                  className="rounded-2xl px-4 py-3 text-sm font-medium text-navy-500 hover:bg-navy-900/5"
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
                  className="h-12 rounded-2xl px-5"
                >
                  Submit signature
                </LoadingButton>
              </div>
            ) : (
              <div className="flex justify-end px-6 py-4 sm:px-8">
                <button
                  type="button"
                  onClick={closePad}
                  className="rounded-2xl bg-navy-900 px-5 py-3 text-sm font-medium text-white"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}

    </div>
  );
}
