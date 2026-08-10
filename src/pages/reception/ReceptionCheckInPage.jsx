import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, LogIn, UserPlus, Users } from 'lucide-react';
import {
  PageHeader,
  Spinner,
  LoadingButton,
  IconButton,
  StatusBadge,
  UnderlineTabs,
} from '../../components/ui';
import GateCheckInPanel from '../station/GateCheckInPanel';
import QueueToHostModal from '../../components/reception/QueueToHostModal';
import { useToast } from '../../context/ToastContext';
import { receptionApi } from '../../utils/visitorApi';

const TABS = {
  ready: 'ready',
  atReception: 'at-reception',
};

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
  const [tab, setTab] = useState(TABS.ready);

  const loadRef = useCallback(async () => {
    setLoading(true);
    try {
      const ref = await receptionApi.getReferenceData();
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
        (rows || []).filter((row) => ['reception_check_in', 'checked_in'].includes(row.status)),
      );
    } catch {
      setReadyToQueue([]);
    }
  }, []);

  useEffect(() => {
    loadRef();
    loadReadyToQueue();
  }, [loadRef, loadReadyToQueue]);

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
      await receptionApi.queueToHost(queueVisit.id, payload);
      toast.success('Visitor queued — host notified.');
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
  ], [pendingCount, readyToQueue.length]);

  return (
    <div className="w-full">
      <PageHeader
        title="Check-in Desk"
        subtitle="Check in gate arrivals and today’s appointments, then queue them to the host"
        breadcrumbs={[{ label: 'Reception', to: '/reception' }, { label: 'Check-in' }]}
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
                                <StatusBadge status={row.status} />
                              </div>
                            </div>
                            <div className="min-w-0">
                              <span className="text-xs font-semibold uppercase tracking-wide text-navy-400 sm:hidden">
                                Purpose of visit
                              </span>
                              <p
                                className="truncate text-sm text-navy-700"
                                title={row.purpose || row.appointment_title || ''}
                              >
                                {row.purpose || row.appointment_title || '—'}
                              </p>
                            </div>
                            <div className="hidden sm:block">
                              <StatusBadge status={row.status} />
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
    </div>
  );
}
