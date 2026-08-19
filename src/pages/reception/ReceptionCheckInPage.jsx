import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarDays, Copy, ExternalLink, LogIn, QrCode, UserPlus, Users } from 'lucide-react';
import {
  PageHeader,
  Spinner,
  LoadingButton,
  IconButton,
  Modal,
  VisitStatusBadge,
  UnderlineTabs,
  TablePagination,
} from '../../components/ui';
import GateCheckInPanel from '../station/GateCheckInPanel';
import GateEntryCheckInForm from '../../components/gate/GateEntryCheckInForm';
import QueueToHostModal from '../../components/reception/QueueToHostModal';
import ReceptionVisitRowActions from '../../components/reception/ReceptionVisitRowActions';
import { useToast } from '../../context/ToastContext';
import { receptionApi, visitorApi } from '../../utils/visitorApi';
import { toastHostApprovalRequested } from '../../utils/hostApprovalToast';
import { scopeReceptionReferenceData } from '../../utils/receptionZoneScope';
import { formatDate, formatTime } from '../../utils/helpers';
import { canQueueVisitToHost } from '../../../shared/visitReceptionActions.js';

const TABS = {
  ready: 'ready',
  register: 'register',
  atReception: 'at-reception',
  expected: 'expected',
};

function toDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDaysKey(dateKey, days) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

function FormSection({ title, subtitle, children }) {
  return (
    <section className="rounded-2xl border border-navy-100 bg-white p-4 sm:p-5">
      {(title || subtitle) && (
        <div className="mb-4 border-b border-navy-100 pb-3">
          {title ? <h3 className="text-sm font-semibold text-navy-900">{title}</h3> : null}
          {subtitle ? <p className="mt-0.5 text-xs text-navy-500">{subtitle}</p> : null}
        </div>
      )}
      {children}
    </section>
  );
}

export default function ReceptionCheckInPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [hosts, setHosts] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [offices, setOffices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastCheckedInId, setLastCheckedInId] = useState(null);
  const [readyToQueue, setReadyToQueue] = useState([]);
  const [queueVisit, setQueueVisit] = useState(null);
  const [queuing, setQueuing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [expectedVisitors, setExpectedVisitors] = useState([]);
  const [expectedLoading, setExpectedLoading] = useState(false);
  const [expectedPage, setExpectedPage] = useState(1);
  const [expectedPageSize, setExpectedPageSize] = useState(10);
  const [tab, setTab] = useState(TABS.register);

  const loadRef = useCallback(async () => {
    setLoading(true);
    try {
      const ref = scopeReceptionReferenceData(await receptionApi.getReferenceData());
      setHosts(ref.hosts || []);
      setDepartments(ref.departments || []);
      setOffices(ref.offices || []);
    } catch {
      setHosts([]);
      setDepartments([]);
      setOffices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadReadyToQueue = useCallback(async () => {
    try {
      const rows = await receptionApi.getHostQueue({ includeReady: '1' });
      setReadyToQueue(
        (rows || []).filter((row) => canQueueVisitToHost(row)),
      );
    } catch {
      setReadyToQueue([]);
    }
  }, []);

  const loadExpectedVisitors = useCallback(async () => {
    setExpectedLoading(true);
    try {
      const start = toDateKey(new Date());
      const end = addDaysKey(start, 7);
      const rows = await receptionApi.getCalendar({ start, end });
      setExpectedVisitors(Array.isArray(rows) ? rows : []);
      setExpectedPage(1);
    } catch {
      setExpectedVisitors([]);
      setExpectedPage(1);
    } finally {
      setExpectedLoading(false);
    }
  }, []);

  const expectedTotalPages = Math.max(1, Math.ceil(expectedVisitors.length / expectedPageSize));
  const safeExpectedPage = Math.min(expectedPage, expectedTotalPages);
  const pagedExpectedVisitors = useMemo(() => {
    const start = (safeExpectedPage - 1) * expectedPageSize;
    return expectedVisitors.slice(start, start + expectedPageSize);
  }, [expectedVisitors, expectedPageSize, safeExpectedPage]);

  useEffect(() => {
    loadRef();
    loadReadyToQueue();
    loadExpectedVisitors();
  }, [loadRef, loadReadyToQueue, loadExpectedVisitors]);

  useEffect(() => {
    if (tab === TABS.expected) {
      void loadExpectedVisitors();
    }
  }, [tab, loadExpectedVisitors]);

  const openQueueModal = (visitOrId) => {
    if (visitOrId && typeof visitOrId === 'object') {
      setQueueVisit(visitOrId);
      return;
    }
    const fromList = readyToQueue.find((row) => row.id === visitOrId);
    setQueueVisit(fromList || { id: visitOrId, full_name: 'Visitor' });
  };

  const handleQueueConfirm = async (payload) => {
    if (!queueVisit?.id) return;
    setQueuing(true);
    try {
      const result = await receptionApi.queueToHost(queueVisit.id, payload);
      toastHostApprovalRequested(toast, result, 'Visitor sent to host for approval.');
      setLastCheckedInId(null);
      setQueueVisit(null);
      setReadyToQueue((prev) => prev.filter((row) => row.id !== queueVisit.id));
      navigate('/reception/host-queue');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setQueuing(false);
    }
  };

  const tabOptions = useMemo(() => [
    {
      value: TABS.register,
      label: 'Register & check in',
      icon: UserPlus,
    },
    {
      value: TABS.ready,
      label: 'Ready for check-in',
      icon: LogIn,
      count: pendingCount,
    },
    {
      value: TABS.atReception,
      label: 'Queue to host',
      icon: Users,
      count: readyToQueue.length,
    },
    {
      value: TABS.expected,
      label: 'Expected visitors',
      icon: CalendarDays,
      count: expectedVisitors.length,
    },
  ], [pendingCount, readyToQueue.length, expectedVisitors.length]);

  const [boardModalOpen, setBoardModalOpen] = useState(false);
  const [boardUrl, setBoardUrl] = useState('');
  const [boardLoading, setBoardLoading] = useState(false);

  const openSignatureBoardLink = async () => {
    setBoardModalOpen(true);
    if (boardUrl) return;
    setBoardLoading(true);
    try {
      const data = await receptionApi.getSignatureBoard();
      setBoardUrl(data.boardUrl);
    } catch (err) {
      toast.error(err.message);
      setBoardModalOpen(false);
    } finally {
      setBoardLoading(false);
    }
  };

  const copyBoardLink = async () => {
    try {
      await navigator.clipboard.writeText(boardUrl);
      toast.success('Link copied.');
    } catch {
      toast.error('Could not copy — select and copy the link manually.');
    }
  };

  const receptionEntryApi = useMemo(() => ({
    getReferenceData: () => receptionApi.getReferenceData(),
    nrcLookup: (nrc) => receptionApi.checkInNrcLookup(nrc),
    searchVehicleByPlate: (plate) => visitorApi.searchVehicleByPlate(plate),
    submitWalkIn: (body) => receptionApi.checkInWalkIn(body),
    submitVehicle: (body) => receptionApi.checkInVehicle(body),
    getSignatureBoard: () => receptionApi.getSignatureBoard(),
    createSignatureRequest: (body) => receptionApi.createSignatureRequest(body),
    cancelSignatureRequest: (id) => receptionApi.cancelSignatureRequest(id),
  }), []);

  const handleDeskEntrySuccess = ({ kind, visit, result }) => {
    const visitId = visit?.id || result?.visitId;
    if (visitId) {
      setLastCheckedInId(visitId);
      void loadReadyToQueue();
      setTab(TABS.atReception);
      return;
    }
    if (kind === 'vehicle') {
      void loadReadyToQueue();
    }
  };

  return (
    <div className="w-full">
      <PageHeader
        title="Check-in Desk"
        subtitle="Check in gate arrivals, register walk-ins at the desk, then queue them to the host"
        breadcrumbs={[{ label: 'Reception', to: '/reception' }, { label: 'Check-in' }]}
        actions={(
          <LoadingButton
            variant="secondary"
            size="sm"
            icon={QrCode}
            onClick={openSignatureBoardLink}
          >
            Signature board link
          </LoadingButton>
        )}
      />

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-2xl border border-navy-100 bg-white px-2 pt-1 sm:px-4">
            <UnderlineTabs
              fullWidth
              options={tabOptions.map(({ value, label, icon, count }) => ({
                value,
                icon,
                label: count > 0 ? `${label} (${count})` : label,
              }))}
              value={tab}
              onChange={setTab}
            />
          </div>

          {tab === TABS.ready ? (
            <>
              <GateCheckInPanel
                mode="walk-in"
                showPendingHeader={false}
                fetchPendingVisits={(mode) => receptionApi.getCheckInAppointments(mode)}
                pendingSubtitle="Today's appointments and gate arrivals waiting for reception"
                pendingEmptyHint="Visitors logged at the gate (arrived at gate) and today’s appointments appear here."
                onPendingCountChange={setPendingCount}
                onCheckedIn={(visitId) => {
                  setLastCheckedInId(visitId);
                  void loadReadyToQueue();
                  setTab(TABS.atReception);
                }}
                onRowClick={(row) => navigate(`/reception/visitors/${row.id}`)}
                emptyExtra={(
                  <button
                    type="button"
                    onClick={() => setTab(TABS.atReception)}
                    className="text-sm font-medium text-cyan-700 hover:text-cyan-800"
                  >
                    Already checked in? Queue to host →
                  </button>
                )}
              />

              {lastCheckedInId ? (
                <FormSection
                  title="Next step"
                  subtitle="Visitor checked in successfully. Queue them to the host so they can be notified."
                >
                  <LoadingButton
                    size="lg"
                    icon={UserPlus}
                    onClick={() => openQueueModal(lastCheckedInId)}
                    className="bg-cyan-600 hover:bg-cyan-500 border-cyan-600"
                  >
                    Queue to host
                  </LoadingButton>
                </FormSection>
              ) : null}
            </>
          ) : tab === TABS.register ? (
            <GateEntryCheckInForm
              layout="embedded"
              entryContext="reception"
              api={receptionEntryApi}
              onSuccess={handleDeskEntrySuccess}
            />
          ) : tab === TABS.expected ? (
            <FormSection
              title="Expected visitors"
              subtitle="Host appointments and pre-registered guests arriving today through the next 7 days"
            >
              {expectedLoading ? (
                <div className="flex justify-center py-10">
                  <Spinner size={24} />
                </div>
              ) : expectedVisitors.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-navy-100 bg-navy-50 text-navy-400">
                    <CalendarDays size={22} aria-hidden="true" />
                  </span>
                  <p className="text-sm font-medium text-navy-700">No expected visitors</p>
                  <p className="max-w-sm text-xs text-navy-400">
                    When hosts create appointments, they appear here so reception knows who is coming.
                  </p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-navy-100">
                  <div className="overflow-x-auto">
                    <div className="min-w-[720px]">
                      <div className="hidden grid-cols-[minmax(0,12rem)_minmax(0,10rem)_8rem_minmax(0,9rem)_7rem_auto] gap-3 border-b border-navy-100 bg-navy-50/80 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-navy-500 sm:grid">
                        <span>Visitor</span>
                        <span>Host</span>
                        <span>When</span>
                        <span>Phone / NRC</span>
                        <span>Status</span>
                        <span className="text-right">Action</span>
                      </div>
                      <ul className="divide-y divide-navy-100">
                        {pagedExpectedVisitors.map((row) => {
                          const visitId = row.visit_id || row.id;
                          const whenLabel = row.scheduled_at
                            ? `${formatDate(row.scheduled_at)} · ${formatTime(row.scheduled_at)}`
                            : '—';
                          return (
                            <li
                              key={`${visitId}-${row.scheduled_at || row.id}`}
                              role="button"
                              tabIndex={0}
                              aria-label={`View ${row.visitor_name || 'visitor'}`}
                              onClick={() => navigate(`/reception/visitors/${visitId}`)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  navigate(`/reception/visitors/${visitId}`);
                                }
                              }}
                              className="grid cursor-pointer grid-cols-1 gap-3 px-4 py-4 transition-colors hover:bg-navy-50/70 focus-visible:bg-navy-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-500 sm:grid-cols-[minmax(0,12rem)_minmax(0,10rem)_8rem_minmax(0,9rem)_7rem_auto] sm:items-center sm:gap-3"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-base font-semibold text-navy-900">
                                  {row.visitor_name || 'Visitor'}
                                </p>
                                <p className="mt-0.5 truncate text-sm text-navy-500">
                                  {row.purpose || row.title || row.site_name || '—'}
                                </p>
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm text-navy-700">{row.host_name || '—'}</p>
                                <p className="mt-0.5 truncate text-xs text-navy-400">
                                  {row.department_name || row.site_name || ''}
                                </p>
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm text-navy-700">{whenLabel}</p>
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm text-navy-700">{row.phone || '—'}</p>
                                <p className="mt-0.5 truncate text-xs text-navy-400">
                                  NRC {row.id_number_masked || '—'}
                                </p>
                              </div>
                              <div>
                                <VisitStatusBadge visit={row} status={row.visit_status || row.status || 'expected'} />
                              </div>
                              <div
                                className="flex items-center justify-end"
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => e.stopPropagation()}
                              >
                                <ReceptionVisitRowActions
                                  row={row}
                                  visitId={visitId}
                                  onRefresh={loadExpectedVisitors}
                                />
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                  <TablePagination
                    page={safeExpectedPage}
                    pageSize={expectedPageSize}
                    totalItems={expectedVisitors.length}
                    onPageChange={setExpectedPage}
                    onPageSizeChange={(size) => {
                      setExpectedPageSize(size);
                      setExpectedPage(1);
                    }}
                  />
                </div>
              )}
            </FormSection>
          ) : (
            <FormSection
              title="Ready to queue"
              subtitle={
                readyToQueue.length > 0
                  ? `${readyToQueue.length} visitor${readyToQueue.length === 1 ? '' : 's'} at reception`
                  : 'Checked-in visitors waiting to be queued to a host'
              }
            >
              {readyToQueue.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-navy-100 bg-navy-50 text-navy-400">
                    <Users size={22} aria-hidden="true" />
                  </span>
                  <p className="text-sm font-medium text-navy-700">No visitors ready to queue</p>
                  <p className="max-w-sm text-xs text-navy-400">
                    After check-in, visitors appear here until you queue them to their host.
                  </p>
                  <button
                    type="button"
                    onClick={() => setTab(TABS.ready)}
                    className="mt-1 text-sm font-medium text-cyan-700 hover:text-cyan-800"
                  >
                    Back to ready for check-in →
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-navy-100">
                  <div className="min-w-[560px]">
                    <div className="hidden grid-cols-[minmax(0,14rem)_minmax(0,1fr)_7rem_auto] gap-3 border-b border-navy-100 bg-navy-50/80 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-navy-500 sm:grid">
                      <span>Visitor</span>
                      <span>Purpose of visit</span>
                      <span>Status</span>
                      <span className="text-right">Action</span>
                    </div>
                    <ul className="divide-y divide-navy-100">
                      {readyToQueue.map((row) => {
                        const busy = queuing && queueVisit?.id === row.id;
                        return (
                          <li
                            key={row.id}
                            role="button"
                            tabIndex={busy ? -1 : 0}
                            aria-label={`View ${row.full_name || 'visitor'}`}
                            onClick={() => {
                              if (busy) return;
                              navigate(`/reception/visitors/${row.id}`);
                            }}
                            onKeyDown={(e) => {
                              if (busy) return;
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                navigate(`/reception/visitors/${row.id}`);
                              }
                            }}
                            className={`grid grid-cols-1 gap-3 px-4 py-4 transition-colors sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_7rem_auto] sm:items-center sm:gap-3 ${
                              busy
                                ? 'opacity-70'
                                : 'cursor-pointer hover:bg-navy-50/70 focus-visible:bg-navy-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-500'
                            }`}
                          >
                            <div className="min-w-0">
                              <p className="truncate text-base font-semibold text-navy-900">
                                {row.full_name || 'Visitor'}
                              </p>
                              <p className="mt-0.5 truncate text-sm text-navy-500">
                                Host: {row.host_name || '—'}
                                {row.department_name ? ` · ${row.department_name}` : ''}
                                {row.pass_code ? ` · Pass ${row.pass_code}` : ''}
                              </p>
                              <div className="mt-2 sm:hidden">
                                <VisitStatusBadge visit={row} />
                              </div>
                            </div>
                            <div className="min-w-0">
                              <span className="text-xs font-semibold uppercase tracking-wide text-navy-400 sm:hidden">
                                Purpose of visit
                              </span>
                              <p
                                className="truncate text-sm text-navy-700"
                              >
                                {row.purpose || row.appointment_title || '—'}
                              </p>
                            </div>
                            <div className="hidden sm:block">
                              <VisitStatusBadge visit={row} />
                            </div>
                            <div
                              className="flex items-center justify-end gap-1.5"
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            >
                              <Link
                                to={`/reception/visitors/${row.id}`}
                                aria-label={`View ${row.full_name || 'visitor'}`}
                              >
                                <IconButton
                                  icon={Eye}
                                  label="View"
                                  tooltip="View"
                                  size="sm"
                                  variant="ghost"
                                />
                              </Link>
                              <LoadingButton
                                size="sm"
                                icon={UserPlus}
                                iconSize={14}
                                loading={busy}
                                loadingLabel="Queuing…"
                                disabled={queuing}
                                onClick={() => openQueueModal(row)}
                                className="bg-cyan-600 hover:bg-cyan-500 border-cyan-600"
                              >
                                Queue to host
                              </LoadingButton>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              )}
            </FormSection>
          )}
        </div>
      )}

      <QueueToHostModal
        isOpen={Boolean(queueVisit)}
        onClose={() => !queuing && setQueueVisit(null)}
        visit={queueVisit}
        hosts={hosts}
        departments={departments}
        offices={offices}
        submitting={queuing}
        onConfirm={handleQueueConfirm}
      />

      <Modal
        isOpen={boardModalOpen}
        onClose={() => setBoardModalOpen(false)}
        title="Signature board link"
        subtitle="Open this on a lobby tablet — visitors sign remote requests here"
      >
        {boardLoading ? (
          <div className="flex justify-center py-6"><Spinner size={24} /></div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={boardUrl}
                onFocus={(e) => e.target.select()}
                className="w-full min-w-0 rounded-xl border border-navy-200 bg-navy-50/60 px-3 py-2 text-sm text-navy-700"
              />
              <IconButton icon={Copy} label="Copy link" tooltip="Copy link" variant="secondary" onClick={copyBoardLink} />
              <IconButton
                icon={ExternalLink}
                label="Open board"
                tooltip="Open board"
                variant="secondary"
                onClick={() => window.open(boardUrl, '_blank', 'noopener')}
              />
            </div>
            <p className="text-xs text-navy-400">
              This link is the same for every request at this site — set it up once on the device you want visitors
              to sign on.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
