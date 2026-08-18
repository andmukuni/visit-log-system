import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  Bell,
  BellRing,
  CheckCircle2,
  Copy,
  Mail,
  MessageSquare,
  Printer,
  RefreshCw,
  ScanFace,
  Settings,
  Shield,
  User,
} from 'lucide-react';
import {
  PageHeader,
  FormField,
  LoadingButton,
  Spinner,
  UnderlineTabs,
  useToast,
} from '../../components/ui';
import PlatformHealthPanel from '../../components/platform/PlatformHealthPanel';
import { useAuth } from '../../context/AuthContext';
import { formatNrcInput, isCompleteNrc, NRC_INPUT_MAX_LENGTH, NRC_PLACEHOLDER, printNrcVerificationSlip } from '../../utils/helpers';
import { settingsApi } from '../../utils/settingsApi';
import { notificationsApi } from '../../utils/visitorApi';
import { isPushSupported, subscribeToPushNotifications } from '../../pwa/pushNotifications';

const BASE_TABS = [
  { value: 'general', label: 'General', icon: Settings },
  { value: 'account', label: 'Account', icon: User },
  { value: 'security', label: 'Security', icon: Shield },
  { value: 'notifications', label: 'Notifications', icon: Bell },
  { value: 'smtp', label: 'SMTP', icon: Mail },
  { value: 'dojah', label: 'Dojah KYC', icon: ScanFace },
  { value: 'sms', label: 'SMS', icon: MessageSquare },
  { value: 'push', label: 'Push', icon: BellRing },
];

const HEALTH_TAB = { value: 'health', label: 'System Health', icon: Activity };

const NOTIFICATION_CATEGORIES = [
  { key: 'visit_registered', label: 'Visit registered / invite', description: 'When a visitor is invited or pre-registered.' },
  { key: 'visit_host_booking', label: 'Host booking confirmed', description: 'When a host or executive books a confirmed visit.' },
  { key: 'visit_pending_approval', label: 'Pending approval', description: 'When a visit is waiting for host approval.' },
  { key: 'visit_approved', label: 'Visit approved', description: 'When a host or security approves a visit.' },
  { key: 'visit_rejected', label: 'Visit rejected', description: 'When a visit request is declined.' },
  { key: 'visit_cancelled', label: 'Visit cancelled', description: 'When a visit is cancelled.' },
  { key: 'visit_rescheduled', label: 'Visit rescheduled', description: 'When a visit time is changed.' },
  { key: 'visit_reminder', label: 'Pre-arrival reminder', description: 'About one hour before expected arrival.' },
  { key: 'visit_arrived_gate', label: 'Arrived at gate', description: 'When a visitor (or vehicle) arrives at the gate.' },
  { key: 'visit_checked_in', label: 'Reception check-in', description: 'When a visitor checks in at reception.' },
  { key: 'visit_waiting', label: 'Waiting / in meeting', description: 'When a visitor is waiting or a meeting starts.' },
  { key: 'visit_checked_out', label: 'Visit check-out', description: 'When a visitor completes their visit.' },
];

function SettingsCard({ children, className = '' }) {
  return (
    <div className={`rounded-3xl border border-gray-200 bg-white shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function TabPanelHeader({ title, subtitle }) {
  return (
    <div className="mb-6 border-b border-gray-100 pb-4">
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
    </div>
  );
}

function IntegrationStatusBanner({
  icon: Icon,
  title,
  description,
  configured,
  enabled,
  source,
  envVars,
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-navy-50/70 via-white to-white p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700 ring-1 ring-cyan-100">
          <Icon size={22} strokeWidth={2} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-navy-900">{title}</h2>
            {configured ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-600/20">
                <CheckCircle2 size={12} aria-hidden="true" />
                Configured
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-600/20">
                <AlertCircle size={12} aria-hidden="true" />
                Not configured
              </span>
            )}
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                enabled
                  ? 'bg-cyan-50 text-cyan-700 ring-cyan-600/20'
                  : 'bg-gray-100 text-gray-600 ring-gray-500/20'
              }`}
            >
              {enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <p className="mt-1.5 text-sm text-navy-500">{description}</p>
          {configured && source ? (
            <p className="mt-2 text-xs text-navy-400">
              Active configuration from{' '}
              <span className="font-medium text-navy-600">{source}</span>
            </p>
          ) : null}
          {!configured && envVars ? (
            <p className="mt-2 text-xs text-navy-400">
              Or configure via{' '}
              <code className="rounded-md bg-navy-100 px-1.5 py-0.5 font-mono text-[11px] text-navy-700">
                {envVars}
              </code>{' '}
              environment variables
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SettingsFormBlock({ title, subtitle, children, className = '' }) {
  return (
    <section className={`overflow-hidden rounded-2xl border border-gray-200 bg-white ${className}`}>
      {(title || subtitle) && (
        <div className="border-b border-gray-100 bg-navy-50/50 px-5 py-4">
          {title && <h3 className="text-sm font-semibold text-navy-900">{title}</h3>}
          {subtitle && <p className="mt-0.5 text-xs text-navy-500">{subtitle}</p>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

function TabSection({ title, subtitle, children }) {
  return (
    <section className="mt-8 border-t border-gray-100 pt-8">
      {(title || subtitle) && (
        <div className="mb-4">
          {title && <h3 className="text-sm font-semibold text-gray-900">{title}</h3>}
          {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

function ToggleRow({ label, description, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-gray-200 bg-navy-50/40 px-4 py-3.5 transition-colors hover:border-gray-300 hover:bg-navy-50/70">
      <div className="min-w-0">
        <p className="text-sm font-medium text-navy-900">{label}</p>
        {description && <p className="mt-0.5 text-xs text-navy-500">{description}</p>}
      </div>
      <div className="relative inline-flex shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          className="block h-6 w-11 rounded-full bg-gray-200 transition-colors peer-checked:bg-cyan-600 peer-focus-visible:ring-2 peer-focus-visible:ring-cyan-500 peer-focus-visible:ring-offset-2"
          aria-hidden="true"
        />
        <span
          className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5"
          aria-hidden="true"
        />
      </div>
    </label>
  );
}

function MiniToggle({ checked, onChange, label, title }) {
  return (
    <label className="relative inline-flex cursor-pointer items-center" title={title}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span className="sr-only">{label}</span>
      <span
        className="block h-5 w-9 rounded-full bg-gray-200 transition-colors peer-checked:bg-cyan-600 peer-focus-visible:ring-2 peer-focus-visible:ring-cyan-500 peer-focus-visible:ring-offset-2"
        aria-hidden="true"
      />
      <span
        className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4"
        aria-hidden="true"
      />
    </label>
  );
}

export default function AdminSettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, updateSession, hasPermission } = useAuth();
  const toast = useToast();
  const tabs = useMemo(() => {
    if (hasPermission('platform.health') || hasPermission('admin.settings')) {
      return hasPermission('platform.health') ? [...BASE_TABS, HEALTH_TAB] : BASE_TABS;
    }
    return BASE_TABS;
  }, [hasPermission]);
  const tabFromUrl = searchParams.get('tab');
  const [tab, setTab] = useState(() => (
    tabFromUrl && tabs.some((item) => item.value === tabFromUrl) ? tabFromUrl : 'general'
  ));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState(null);
  const [accountForm, setAccountForm] = useState({ name: '', phone: '' });
  const [notificationForm, setNotificationForm] = useState({});
  const [securityForm, setSecurityForm] = useState({});
  const [generalForm, setGeneralForm] = useState({});
  const [smtpForm, setSmtpForm] = useState({});
  const [dojahForm, setDojahForm] = useState({});
  const [smsForm, setSmsForm] = useState({});
  const [pushForm, setPushForm] = useState({});
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [testEmail, setTestEmail] = useState('');
  const [testNrc, setTestNrc] = useState('');
  const [dojahLookupResult, setDojahLookupResult] = useState(null);
  const [testSmsPhone, setTestSmsPhone] = useState('');
  const [testSmsMessage, setTestSmsMessage] = useState('');
  const [savingAccount, setSavingAccount] = useState(false);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [savingSecurity, setSavingSecurity] = useState(false);
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [savingDojah, setSavingDojah] = useState(false);
  const [savingSms, setSavingSms] = useState(false);
  const [savingPush, setSavingPush] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [testingDojah, setTestingDojah] = useState(false);
  const [testingSms, setTestingSms] = useState(false);
  const [testingPush, setTestingPush] = useState(false);
  const [generatingPushKeys, setGeneratingPushKeys] = useState(false);
  const [subscribingPush, setSubscribingPush] = useState(false);
  const [browserPushSubscribed, setBrowserPushSubscribed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await settingsApi.getSettings();
      setSettings(data);
      setAccountForm({
        name: data?.user?.name || '',
        phone: data?.user?.phone || '',
      });
      setNotificationForm(data?.notifications || {});
      setSecurityForm(data?.security || {});
      setGeneralForm(data?.general || {});
      setSmtpForm({
        enabled: data?.smtp?.enabled || false,
        host: data?.smtp?.host || '',
        port: data?.smtp?.port || 587,
        secure: data?.smtp?.secure || false,
        user: data?.smtp?.user || '',
        from: data?.smtp?.from || '',
        from_name: data?.smtp?.from_name || '',
        pass: '',
      });
      setDojahForm({
        enabled: data?.dojah?.enabled || false,
        app_id: data?.dojah?.app_id || '',
        public_key: data?.dojah?.public_key || '',
        use_sandbox: data?.dojah?.use_sandbox || false,
        private_key: '',
      });
      setSmsForm({
        enabled: data?.sms?.enabled || false,
        provider: data?.sms?.provider || 'console',
        twilio_account_sid: data?.sms?.twilio_account_sid || '',
        twilio_from: data?.sms?.twilio_from || '',
        twilio_auth_token: '',
        base_url: data?.sms?.base_url || 'https://bulksms.ontech.co.zm/smsservice',
        access_id: '',
        sender_id: data?.sms?.sender_id || '',
      });
      setPushForm({
        enabled: data?.push?.enabled || false,
        subject: data?.push?.subject || '',
        public_key: data?.push?.public_key || '',
        private_key: '',
      });
      setTestEmail(data?.user?.email || user?.email || '');
    } catch (err) {
      setError(err?.message || 'Failed to load settings.');
    } finally {
      setLoading(false);
    }
  }, [user?.email]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!isPushSupported()) return;
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setBrowserPushSubscribed(Boolean(subscription)))
      .catch(() => {});
  }, [tab]);

  useEffect(() => {
    const urlTab = searchParams.get('tab');
    if (urlTab && tabs.some((item) => item.value === urlTab)) {
      setTab(urlTab);
    }
  }, [searchParams, tabs]);

  const handleTabChange = (nextTab) => {
    setTab(nextTab);
    if (nextTab === 'general') {
      setSearchParams({}, { replace: true });
      return;
    }
    setSearchParams({ tab: nextTab }, { replace: true });
  };

  const saveAccount = async (event) => {
    event.preventDefault();
    setSavingAccount(true);
    try {
      const data = await settingsApi.updateAccount(accountForm);
      updateSession({ name: data.name, phone: data.phone });
      toast.success('Account details updated.');
      await load();
    } catch (err) {
      toast.error(err.message || 'Could not update account.');
    } finally {
      setSavingAccount(false);
    }
  };

  const savePassword = async (event) => {
    event.preventDefault();
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      toast.error('New passwords do not match.');
      return;
    }
    setSavingPassword(true);
    try {
      await settingsApi.changePassword({
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password,
      });
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
      toast.success('Password updated.');
    } catch (err) {
      toast.error(err.message || 'Could not update password.');
    } finally {
      setSavingPassword(false);
    }
  };

  const saveNotifications = async (event) => {
    event.preventDefault();
    setSavingNotifications(true);
    try {
      await settingsApi.updateNotifications(notificationForm);
      toast.success('Notification preferences saved.');
      await load();
    } catch (err) {
      toast.error(err.message || 'Could not save notifications.');
    } finally {
      setSavingNotifications(false);
    }
  };

  const allEmailEnabled = NOTIFICATION_CATEGORIES.every((cat) => notificationForm[`email_${cat.key}`]);
  const allSmsEnabled = NOTIFICATION_CATEGORIES.every((cat) => notificationForm[`sms_${cat.key}`]);

  const setChannelForAll = (channel, value) => {
    setNotificationForm((prev) => {
      const next = { ...prev };
      NOTIFICATION_CATEGORIES.forEach((cat) => {
        next[`${channel}_${cat.key}`] = value;
      });
      return next;
    });
  };

  const saveSecurity = async (event) => {
    event.preventDefault();
    setSavingSecurity(true);
    try {
      await settingsApi.updateSecurity(securityForm);
      toast.success('Security policy saved.');
      await load();
    } catch (err) {
      toast.error(err.message || 'Could not save security settings.');
    } finally {
      setSavingSecurity(false);
    }
  };

  const saveGeneral = async (event) => {
    event.preventDefault();
    setSavingGeneral(true);
    try {
      await settingsApi.updateGeneral(generalForm);
      toast.success('General settings saved.');
      await load();
    } catch (err) {
      toast.error(err.message || 'Could not save general settings.');
    } finally {
      setSavingGeneral(false);
    }
  };

  const saveSmtp = async (event) => {
    event.preventDefault();
    setSavingSmtp(true);
    try {
      const payload = { ...smtpForm };
      if (!payload.pass) delete payload.pass;
      await settingsApi.updateSmtp(payload);
      toast.success('SMTP settings saved.');
      setSmtpForm((prev) => ({ ...prev, pass: '' }));
      await load();
    } catch (err) {
      toast.error(err.message || 'Could not save SMTP settings.');
    } finally {
      setSavingSmtp(false);
    }
  };

  const runSmtpTest = async () => {
    setTestingSmtp(true);
    try {
      const json = await settingsApi.testSmtp({ to: testEmail });
      toast.success(json.message || 'Test email sent.');
    } catch (err) {
      toast.error(err.message || 'SMTP test failed.');
    } finally {
      setTestingSmtp(false);
    }
  };

  const saveDojah = async (event) => {
    event.preventDefault();
    setSavingDojah(true);
    try {
      const payload = { ...dojahForm };
      if (!payload.private_key) delete payload.private_key;
      await settingsApi.updateDojah(payload);
      toast.success('Dojah settings saved.');
      setDojahForm((prev) => ({ ...prev, private_key: '' }));
      await load();
    } catch (err) {
      toast.error(err.message || 'Could not save Dojah settings.');
    } finally {
      setSavingDojah(false);
    }
  };

  const runDojahTest = async () => {
    const nrc = formatNrcInput(testNrc);
    if (nrc && !isCompleteNrc(nrc)) {
      toast.error(`Enter a complete NRC (${NRC_PLACEHOLDER}).`);
      return;
    }
    setTestingDojah(true);
    setDojahLookupResult(null);
    try {
      const json = await settingsApi.testDojah({ nrc: nrc || undefined });
      toast.success(json.message || 'Dojah connection successful.');
      if (json.mode === 'nrc_lookup' && json.sample) {
        setDojahLookupResult({
          message: json.message,
          verifiedAt: new Date(),
          ...json.sample,
        });
      }
    } catch (err) {
      toast.error(err.message || 'Dojah test failed.');
    } finally {
      setTestingDojah(false);
    }
  };

  const printDojahLookup = () => {
    if (!dojahLookupResult) {
      toast.error('Run an NRC lookup first.');
      return;
    }
    const printed = printNrcVerificationSlip({
      nrc: dojahLookupResult.nrc,
      taxpayerName: dojahLookupResult.taxpayer_name,
      currentStatus: dojahLookupResult.current_status,
      tpin: dojahLookupResult.tpin,
      verifiedAt: dojahLookupResult.verifiedAt,
      appName: generalForm.app_name || settings?.general?.app_name || 'Visitor Log',
    });
    if (!printed) {
      toast.error('Allow pop-ups to print the verification slip.');
    }
  };

  const saveSms = async (event) => {
    event.preventDefault();
    setSavingSms(true);
    try {
      const payload = { ...smsForm };
      if (!payload.twilio_auth_token) delete payload.twilio_auth_token;
      if (!payload.access_id) delete payload.access_id;
      await settingsApi.updateSms(payload);
      toast.success('SMS settings saved.');
      setSmsForm((prev) => ({ ...prev, twilio_auth_token: '', access_id: '' }));
      await load();
    } catch (err) {
      toast.error(err.message || 'Could not save SMS settings.');
    } finally {
      setSavingSms(false);
    }
  };

  const runSmsTest = async () => {
    setTestingSms(true);
    try {
      const json = await settingsApi.testSms({
        phone: testSmsPhone.trim() || undefined,
        message: testSmsMessage.trim() || undefined,
      });
      toast.success(json.message || 'SMS test successful.');
    } catch (err) {
      toast.error(err.message || 'SMS test failed.');
    } finally {
      setTestingSms(false);
    }
  };

  const savePush = async (event) => {
    event.preventDefault();
    setSavingPush(true);
    try {
      const payload = { ...pushForm };
      if (!payload.private_key) delete payload.private_key;
      await settingsApi.updatePush(payload);
      toast.success('Push notification settings saved.');
      setPushForm((prev) => ({ ...prev, private_key: '' }));
      await load();
    } catch (err) {
      toast.error(err.message || 'Could not save push settings.');
    } finally {
      setSavingPush(false);
    }
  };

  const generatePushKeys = async () => {
    setGeneratingPushKeys(true);
    try {
      const keys = await settingsApi.generatePushKeys();
      setPushForm((prev) => ({
        ...prev,
        public_key: keys.public_key,
        private_key: keys.private_key,
      }));
      toast.success('New VAPID key pair generated. Review, then save to apply.');
    } catch (err) {
      toast.error(err.message || 'Could not generate VAPID keys.');
    } finally {
      setGeneratingPushKeys(false);
    }
  };

  const copyPushPublicKey = async () => {
    try {
      await navigator.clipboard.writeText(pushForm.public_key || '');
      toast.success('Public key copied.');
    } catch {
      toast.error('Could not copy — select and copy manually.');
    }
  };

  const enablePushOnThisBrowser = async () => {
    setSubscribingPush(true);
    try {
      const result = await subscribeToPushNotifications({
        getVapidPublicKey: async () => ({ publicKey: await notificationsApi.getVapidPublicKey() }),
        subscribePush: notificationsApi.subscribePush,
      });
      if (result.ok) {
        setBrowserPushSubscribed(true);
        toast.success('Push enabled on this browser.');
        return;
      }
      if (result.reason === 'denied') {
        toast.error('Notifications are blocked for this site. Allow them in your browser’s site settings, then try again.');
      } else if (result.reason === 'unsupported') {
        toast.error('This browser does not support push notifications.');
      } else if (result.reason === 'no_vapid_key') {
        toast.error('Save VAPID keys above first, then enable push on this browser.');
      } else {
        toast.error('Could not enable push on this browser.');
      }
    } catch (err) {
      toast.error(err.message || 'Could not enable push on this browser.');
    } finally {
      setSubscribingPush(false);
    }
  };

  const runPushTest = async () => {
    setTestingPush(true);
    try {
      const json = await settingsApi.testPush();
      toast.success(json.message || 'Test push sent.');
    } catch (err) {
      toast.error(err.message || 'Push test failed.');
    } finally {
      setTestingPush(false);
    }
  };

  if (loading) {
    return (
      <>
        <PageHeader
          title="System Settings"
          subtitle="Configure organisation preferences, security, and delivery integrations"
          breadcrumbs={[
            { label: 'Administration', to: '/admin' },
            { label: 'Settings' },
          ]}
        />
        <div className="flex justify-center py-16">
          <Spinner size={28} />
        </div>
      </>
    );
  }

  const profile = settings?.user || user;

  return (
    <div>
      <PageHeader
        title="System Settings"
        subtitle="Configure organisation preferences, security, and delivery integrations"
        breadcrumbs={[
          { label: 'Administration', to: '/admin' },
          { label: 'Settings' },
        ]}
      />

      {error && (
        <SettingsCard className="mb-4 p-4">
          <p className="text-sm text-red-600">{error}</p>
        </SettingsCard>
      )}

      <SettingsCard className="mb-6 overflow-hidden">
        <UnderlineTabs scrollable options={tabs} value={tab} onChange={handleTabChange} />

        <div className="p-5 sm:p-6">
        {tab === 'general' && (
          <div className="max-w-3xl">
            <TabPanelHeader
              title="General"
              subtitle="Application identity and support contact details"
            />
            <form onSubmit={saveGeneral} className="space-y-4">
              <FormField
                label="Application name"
                name="app_name"
                value={generalForm.app_name || ''}
                onChange={(e) => setGeneralForm({ ...generalForm, app_name: e.target.value })}
                required
              />
              <FormField
                label="Support email"
                name="support_email"
                type="email"
                value={generalForm.support_email || ''}
                onChange={(e) => setGeneralForm({ ...generalForm, support_email: e.target.value })}
              />
              <FormField
                label="Support phone"
                name="support_phone"
                value={generalForm.support_phone || ''}
                onChange={(e) => setGeneralForm({ ...generalForm, support_phone: e.target.value })}
              />
              <LoadingButton type="submit" loading={savingGeneral}>
                Save general settings
              </LoadingButton>
            </form>

            <TabSection title="Environment" subtitle="Read-only deployment information">
              <ul className="space-y-2 text-sm text-gray-600">
                <li><span className="font-medium text-gray-800">NODE_ENV</span> — {settings?.environment?.node_env || '—'}</li>
                <li><span className="font-medium text-gray-800">APP_URL</span> — {settings?.environment?.app_url || '—'}</li>
                <li><span className="font-medium text-gray-800">CORS_ORIGINS</span> — {settings?.environment?.cors_origins || '—'}</li>
                <li><span className="font-medium text-gray-800">Database</span> — {settings?.environment?.db_name || '—'}</li>
              </ul>
            </TabSection>
          </div>
        )}

        {tab === 'account' && (
          <div className="max-w-2xl">
            <TabPanelHeader title="Account" subtitle={profile?.email || ''} />
            <form onSubmit={saveAccount} className="space-y-4">
              <FormField
                label="Name"
                name="name"
                value={accountForm.name}
                onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
                required
              />
              <FormField
                label="Phone"
                name="phone"
                value={accountForm.phone}
                onChange={(e) => setAccountForm({ ...accountForm, phone: e.target.value })}
              />
              <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm">
                <p className="text-gray-400">Email</p>
                <p className="font-medium text-gray-900">{profile?.email || '—'}</p>
                <p className="mt-2 text-xs text-gray-500">Email is managed by your administrator.</p>
              </div>
              <LoadingButton type="submit" loading={savingAccount}>
                Save account
              </LoadingButton>
            </form>
          </div>
        )}

        {tab === 'security' && (
          <div className="max-w-3xl">
            <TabPanelHeader
              title="Security policy"
              subtitle="Password rules, session limits, and MFA options"
            />
            <form onSubmit={saveSecurity} className="space-y-4">
              <FormField
                label="Minimum password length"
                name="min_password_length"
                type="number"
                min="6"
                max="128"
                value={securityForm.min_password_length ?? 8}
                onChange={(e) => setSecurityForm({ ...securityForm, min_password_length: Number(e.target.value) })}
              />
              <FormField
                label="Session timeout (minutes)"
                name="session_timeout_minutes"
                type="number"
                min="15"
                max="10080"
                value={securityForm.session_timeout_minutes ?? 480}
                onChange={(e) => setSecurityForm({ ...securityForm, session_timeout_minutes: Number(e.target.value) })}
              />
              <ToggleRow
                label="Require email verification"
                description="New users must verify email before signing in."
                checked={Boolean(securityForm.require_email_verification)}
                onChange={(value) => setSecurityForm({ ...securityForm, require_email_verification: value })}
              />
              <TabSection title="Multi-factor authentication" subtitle="Control MFA availability and requirements">
                <div className="space-y-3">
                  <ToggleRow
                    label="MFA enabled"
                    description="Allow users to enrol in multi-factor authentication."
                    checked={securityForm.mfa_enabled !== false}
                    onChange={(value) => setSecurityForm({ ...securityForm, mfa_enabled: value })}
                  />
                  <ToggleRow
                    label="Allow SMS MFA"
                    checked={securityForm.mfa_allow_sms !== false}
                    onChange={(value) => setSecurityForm({ ...securityForm, mfa_allow_sms: value })}
                  />
                  <ToggleRow
                    label="Allow email MFA"
                    checked={securityForm.mfa_allow_email !== false}
                    onChange={(value) => setSecurityForm({ ...securityForm, mfa_allow_email: value })}
                  />
                  <ToggleRow
                    label="Allow authenticator app (TOTP)"
                    checked={securityForm.mfa_allow_totp !== false}
                    onChange={(value) => setSecurityForm({ ...securityForm, mfa_allow_totp: value })}
                  />
                  <ToggleRow
                    label="Require MFA for all users"
                    checked={Boolean(securityForm.mfa_require_all_users)}
                    onChange={(value) => setSecurityForm({ ...securityForm, mfa_require_all_users: value })}
                  />
                  <ToggleRow
                    label="Require MFA for administrators"
                    checked={Boolean(securityForm.mfa_require_admin_users)}
                    onChange={(value) => setSecurityForm({ ...securityForm, mfa_require_admin_users: value })}
                  />
                </div>
              </TabSection>
              <LoadingButton type="submit" loading={savingSecurity}>
                Save security policy
              </LoadingButton>
            </form>

            <TabSection title="Change password">
              <form onSubmit={savePassword} className="space-y-4">
                <FormField
                  label="Current password"
                  name="current_password"
                  type="password"
                  value={passwordForm.current_password}
                  onChange={(e) => setPasswordForm({ ...passwordForm, current_password: e.target.value })}
                  required
                />
                <FormField
                  label="New password"
                  name="new_password"
                  type="password"
                  value={passwordForm.new_password}
                  onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                  required
                />
                <FormField
                  label="Confirm new password"
                  name="confirm_password"
                  type="password"
                  value={passwordForm.confirm_password}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })}
                  required
                />
                <LoadingButton type="submit" loading={savingPassword}>
                  Update password
                </LoadingButton>
              </form>
            </TabSection>
          </div>
        )}

        {tab === 'notifications' && (
          <div className="max-w-3xl">
            <TabPanelHeader
              title="Notification categories"
              subtitle="Organisation defaults enforced at send time. Hosts and executives can mute channels further on their Notifications page."
            />
            <form onSubmit={saveNotifications} className="space-y-4">
              <ToggleRow
                label="In-app notifications"
                description="Master switch for in-app alerts for signed-in users across all categories below."
                checked={Boolean(notificationForm.in_app_notifications)}
                onChange={(value) => setNotificationForm({ ...notificationForm, in_app_notifications: value })}
              />

              <p className="text-xs text-navy-500">
                Toggle a single event below, or use the header switches to flip a whole channel at once. Turning a channel off here blocks it for everyone, including visitors.
              </p>

              <div className="overflow-hidden rounded-2xl border border-gray-200">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead className="bg-gray-50">
                      <tr className="border-b border-gray-200">
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Event
                        </th>
                        <th className="w-28 px-3 py-3 text-center">
                          <div className="flex flex-col items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                              <Mail size={13} aria-hidden="true" />
                              Email
                            </span>
                            <MiniToggle
                              checked={allEmailEnabled}
                              onChange={(value) => setChannelForAll('email', value)}
                              label="Toggle email for all events"
                              title={allEmailEnabled ? 'Turn off email for all events' : 'Turn on email for all events'}
                            />
                          </div>
                        </th>
                        <th className="w-28 px-3 py-3 text-center">
                          <div className="flex flex-col items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                              <MessageSquare size={13} aria-hidden="true" />
                              SMS
                            </span>
                            <MiniToggle
                              checked={allSmsEnabled}
                              onChange={(value) => setChannelForAll('sms', value)}
                              label="Toggle SMS for all events"
                              title={allSmsEnabled ? 'Turn off SMS for all events' : 'Turn on SMS for all events'}
                            />
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {NOTIFICATION_CATEGORIES.map((cat) => (
                        <tr key={cat.key} className="transition-colors hover:bg-gray-50/70">
                          <td className="px-4 py-3.5 align-middle">
                            <p className="text-sm font-medium text-gray-900">{cat.label}</p>
                            {cat.description && <p className="mt-0.5 text-xs text-gray-500">{cat.description}</p>}
                          </td>
                          <td className="px-3 py-3.5 text-center align-middle">
                            <MiniToggle
                              checked={Boolean(notificationForm[`email_${cat.key}`])}
                              onChange={(value) => setNotificationForm({ ...notificationForm, [`email_${cat.key}`]: value })}
                              label={`Email for ${cat.label}`}
                            />
                          </td>
                          <td className="px-3 py-3.5 text-center align-middle">
                            <MiniToggle
                              checked={Boolean(notificationForm[`sms_${cat.key}`])}
                              onChange={(value) => setNotificationForm({ ...notificationForm, [`sms_${cat.key}`]: value })}
                              label={`SMS for ${cat.label}`}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <LoadingButton type="submit" loading={savingNotifications} className="mt-4">
                Save notification preferences
              </LoadingButton>
            </form>
          </div>
        )}

        {tab === 'smtp' && (
          <div className="space-y-6">
            <IntegrationStatusBanner
              icon={Mail}
              title="SMTP"
              description="Send visit notifications, approvals, and system emails through your mail server."
              configured={settings?.smtp?.configured}
              enabled={smtpForm.enabled}
              source={settings?.smtp?.source}
              envVars="SMTP_*"
            />

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
              <SettingsFormBlock title="Mail server" subtitle="Host, authentication, and sender details">
                <form onSubmit={saveSmtp} className="space-y-4">
                  <ToggleRow
                    label="Enable SMTP"
                    description="Turn off to queue emails without sending."
                    checked={Boolean(smtpForm.enabled)}
                    onChange={(value) => setSmtpForm({ ...smtpForm, enabled: value })}
                  />
                  <FormField label="Host" name="host" value={smtpForm.host} onChange={(e) => setSmtpForm({ ...smtpForm, host: e.target.value })} />
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField
                      label="Port"
                      name="port"
                      type="number"
                      value={smtpForm.port}
                      onChange={(e) => {
                        const port = Number(e.target.value) || 587;
                        setSmtpForm({ ...smtpForm, port, secure: port === 465 });
                      }}
                      helpText="587 for STARTTLS, 465 for SSL"
                    />
                    <FormField label="From address" name="from" value={smtpForm.from} onChange={(e) => setSmtpForm({ ...smtpForm, from: e.target.value })} />
                  </div>
                  <FormField label="From name" name="from_name" value={smtpForm.from_name} onChange={(e) => setSmtpForm({ ...smtpForm, from_name: e.target.value })} />
                  <FormField label="Username" name="user" value={smtpForm.user} onChange={(e) => setSmtpForm({ ...smtpForm, user: e.target.value })} />
                  <FormField
                    label="Password"
                    name="pass"
                    type="password"
                    value={smtpForm.pass}
                    onChange={(e) => setSmtpForm({ ...smtpForm, pass: e.target.value })}
                    placeholder={settings?.smtp?.pass_set ? 'Leave blank to keep existing password' : ''}
                  />
                  <ToggleRow
                    label="Use TLS/SSL"
                    description="Enable for port 465 or when your server requires a secure connection."
                    checked={Boolean(smtpForm.secure)}
                    onChange={(value) => setSmtpForm({ ...smtpForm, secure: value })}
                  />
                  <div className="flex justify-end border-t border-gray-100 pt-4">
                    <LoadingButton type="submit" loading={savingSmtp}>
                      Save SMTP settings
                    </LoadingButton>
                  </div>
                </form>
              </SettingsFormBlock>

              <SettingsFormBlock title="Send test email" subtitle="Uses the effective SMTP configuration">
                <div className="space-y-4">
                  <FormField
                    label="Recipient"
                    name="test_email"
                    type="email"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                  />
                  <LoadingButton type="button" loading={testingSmtp} onClick={runSmtpTest} className="w-full sm:w-auto">
                    Send test
                  </LoadingButton>
                  <p className="rounded-xl bg-navy-50 px-3 py-2 text-xs text-navy-500">
                    Delivery queue: {settings?.stats?.email_pending ?? 0} pending,{' '}
                    {settings?.stats?.email_sent ?? 0} delivered
                  </p>
                </div>
              </SettingsFormBlock>
            </div>
          </div>
        )}

        {tab === 'dojah' && (
          <div className="space-y-6">
            <IntegrationStatusBanner
              icon={ScanFace}
              title="Dojah KYC"
              description="Verify visitor identity using National Registration Card lookup at gate entry and reception."
              configured={settings?.dojah?.configured}
              enabled={dojahForm.enabled}
              source={settings?.dojah?.source}
              envVars="DOJAH_*"
            />

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
              <SettingsFormBlock title="API credentials" subtitle="Keys from your Dojah developer dashboard">
                <form onSubmit={saveDojah} className="space-y-4">
                  <ToggleRow
                    label="Enable Dojah"
                    description="Verify visitor identity via Dojah NRC lookup."
                    checked={Boolean(dojahForm.enabled)}
                    onChange={(value) => setDojahForm({ ...dojahForm, enabled: value })}
                  />
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField label="App ID" name="app_id" value={dojahForm.app_id} onChange={(e) => setDojahForm({ ...dojahForm, app_id: e.target.value })} helpText="Required header: AppId" />
                    <FormField label="Public key" name="public_key" value={dojahForm.public_key} onChange={(e) => setDojahForm({ ...dojahForm, public_key: e.target.value })} helpText="Optional — for Dojah widgets/SDK only" />
                  </div>
                  <FormField
                    label="Private key"
                    name="private_key"
                    type="password"
                    value={dojahForm.private_key}
                    onChange={(e) => setDojahForm({ ...dojahForm, private_key: e.target.value })}
                    placeholder={settings?.dojah?.private_key_set ? 'Leave blank to keep existing key' : ''}
                    helpText="Sent as Authorization header (raw secret key, not Bearer)"
                  />
                  <ToggleRow
                    label="Use sandbox"
                    description="Connect to Dojah sandbox instead of production."
                    checked={Boolean(dojahForm.use_sandbox)}
                    onChange={(value) => setDojahForm({ ...dojahForm, use_sandbox: value })}
                  />
                  <div className="flex justify-end border-t border-gray-100 pt-4">
                    <LoadingButton type="submit" loading={savingDojah}>
                      Save Dojah settings
                    </LoadingButton>
                  </div>
                </form>
              </SettingsFormBlock>

              <SettingsFormBlock title="Test connection" subtitle="Optional NRC lookup to verify credentials">
                <div className="space-y-4">
                  <FormField
                    label="Test NRC"
                    name="test_nrc"
                    value={testNrc}
                    onChange={(e) => {
                      setTestNrc(formatNrcInput(e.target.value));
                      setDojahLookupResult(null);
                    }}
                    placeholder={NRC_PLACEHOLDER}
                    inputMode="numeric"
                    maxLength={NRC_INPUT_MAX_LENGTH}
                    helpText="Enter 9 digits only — formatted automatically as 123456/78/9"
                  />
                  <div className="flex flex-wrap gap-2">
                    <LoadingButton type="button" loading={testingDojah} onClick={runDojahTest} className="sm:w-auto">
                      {testNrc.trim() ? 'Lookup NRC' : 'Test connection'}
                    </LoadingButton>
                    {dojahLookupResult ? (
                      <button
                        type="button"
                        onClick={printDojahLookup}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-navy-800 transition-colors hover:border-gray-300 hover:bg-navy-50"
                      >
                        <Printer size={16} aria-hidden="true" />
                        Print result
                      </button>
                    ) : null}
                  </div>
                  {dojahLookupResult ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                      <div className="mb-3 flex items-start gap-2">
                        <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
                        <div>
                          <p className="text-sm font-semibold text-emerald-900">Lookup successful</p>
                          <p className="text-xs text-emerald-700">{dojahLookupResult.message}</p>
                        </div>
                      </div>
                      <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                        <div>
                          <dt className="text-xs font-medium uppercase tracking-wide text-emerald-800/70">NRC</dt>
                          <dd className="font-medium text-emerald-950">{dojahLookupResult.nrc || '—'}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium uppercase tracking-wide text-emerald-800/70">Status</dt>
                          <dd className="font-medium text-emerald-950">{dojahLookupResult.current_status || '—'}</dd>
                        </div>
                        <div className="sm:col-span-2">
                          <dt className="text-xs font-medium uppercase tracking-wide text-emerald-800/70">Registered name</dt>
                          <dd className="font-medium text-emerald-950">{dojahLookupResult.taxpayer_name || '—'}</dd>
                        </div>
                        {dojahLookupResult.tpin ? (
                          <div>
                            <dt className="text-xs font-medium uppercase tracking-wide text-emerald-800/70">TPIN</dt>
                            <dd className="font-medium text-emerald-950">{dojahLookupResult.tpin}</dd>
                          </div>
                        ) : null}
                      </dl>
                    </div>
                  ) : null}
                </div>
              </SettingsFormBlock>
            </div>
          </div>
        )}

        {tab === 'sms' && (
          <div className="space-y-6">
            <IntegrationStatusBanner
              icon={MessageSquare}
              title="SMS provider"
              description="Send visit alerts and reminders via Twilio, Ontech, or console logging."
              configured={settings?.sms?.configured}
              enabled={smsForm.enabled}
              source={settings?.sms?.source ? `${settings.sms.source} (${settings?.sms?.provider || 'console'})` : undefined}
              envVars="SMS_* / ONTECH_* / TWILIO_*"
            />

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
              <SettingsFormBlock title="Provider settings" subtitle="Choose a delivery provider and credentials">
                <form onSubmit={saveSms} className="space-y-4">
                  <ToggleRow
                    label="Enable SMS"
                    description="Turn off to stop outbound SMS delivery."
                    checked={Boolean(smsForm.enabled)}
                    onChange={(value) => setSmsForm({ ...smsForm, enabled: value })}
                  />
                  <FormField
                    label="Provider"
                    name="provider"
                    type="select"
                    value={smsForm.provider}
                    onChange={(e) => setSmsForm({ ...smsForm, provider: e.target.value })}
                    options={[
                      { value: 'console', label: 'Console (log only)' },
                      { value: 'twilio', label: 'Twilio' },
                      { value: 'ontech', label: 'Ontech (Zambia)' },
                    ]}
                  />

                  {smsForm.provider === 'twilio' && (
                    <>
                      <FormField
                        label="Twilio Account SID"
                        name="twilio_account_sid"
                        value={smsForm.twilio_account_sid}
                        onChange={(e) => setSmsForm({ ...smsForm, twilio_account_sid: e.target.value })}
                      />
                      <FormField
                        label="Twilio Auth Token"
                        name="twilio_auth_token"
                        type="password"
                        value={smsForm.twilio_auth_token}
                        onChange={(e) => setSmsForm({ ...smsForm, twilio_auth_token: e.target.value })}
                        placeholder={settings?.sms?.twilio_auth_token_set ? 'Leave blank to keep existing token' : ''}
                      />
                      <FormField
                        label="From number"
                        name="twilio_from"
                        value={smsForm.twilio_from}
                        onChange={(e) => setSmsForm({ ...smsForm, twilio_from: e.target.value })}
                      />
                    </>
                  )}

                  {smsForm.provider === 'ontech' && (
                    <>
                      <FormField
                        label="API base URL"
                        name="base_url"
                        value={smsForm.base_url}
                        onChange={(e) => setSmsForm({ ...smsForm, base_url: e.target.value })}
                        placeholder="https://bulksms.ontech.co.zm/smsservice"
                      />
                      <FormField
                        label="API key"
                        name="access_id"
                        type="password"
                        value={smsForm.access_id}
                        onChange={(e) => setSmsForm({ ...smsForm, access_id: e.target.value })}
                        placeholder={settings?.sms?.access_id_set ? 'Leave blank to keep existing key' : ''}
                      />
                      <FormField
                        label="Sender ID"
                        name="sender_id"
                        value={smsForm.sender_id}
                        onChange={(e) => setSmsForm({ ...smsForm, sender_id: e.target.value })}
                        placeholder="VisitorsLog"
                        maxLength={11}
                        helpText="Max 11 characters; must be approved on your Ontech account."
                      />
                    </>
                  )}

                  <div className="flex justify-end border-t border-gray-100 pt-4">
                    <LoadingButton type="submit" loading={savingSms}>
                      Save SMS settings
                    </LoadingButton>
                  </div>
                </form>
              </SettingsFormBlock>

              <SettingsFormBlock title="Send test SMS" subtitle="Uses the saved provider settings">
                <div className="space-y-4">
                  <FormField
                    label="Phone number"
                    name="test_sms_phone"
                    value={testSmsPhone}
                    onChange={(e) => setTestSmsPhone(e.target.value)}
                    placeholder="260971234567"
                    helpText="Zambian numbers are normalized to 260…"
                  />
                  <FormField
                    label="Message"
                    name="test_sms_message"
                    value={testSmsMessage}
                    onChange={(e) => setTestSmsMessage(e.target.value)}
                    placeholder="Visitors Log SMS test — connection successful."
                  />
                  <LoadingButton type="button" loading={testingSms} onClick={runSmsTest} className="w-full sm:w-auto">
                    Send test
                  </LoadingButton>
                </div>
              </SettingsFormBlock>
            </div>
          </div>
        )}

        {tab === 'push' && (
          <div className="space-y-6">
            <IntegrationStatusBanner
              icon={BellRing}
              title="Web Push"
              description="Deliver browser and installed-app push notifications using VAPID keys."
              configured={settings?.push?.configured}
              enabled={pushForm.enabled}
              source={settings?.push?.source}
              envVars="VAPID_*"
            />

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
              <SettingsFormBlock title="VAPID keys" subtitle="A P-256 key pair identifying this server to push services">
                <form onSubmit={savePush} className="space-y-4">
                  <ToggleRow
                    label="Enable Web Push"
                    description="Turn off to stop sending browser/app push notifications."
                    checked={Boolean(pushForm.enabled)}
                    onChange={(value) => setPushForm({ ...pushForm, enabled: value })}
                  />
                  <FormField
                    label="Subject"
                    name="subject"
                    value={pushForm.subject}
                    onChange={(e) => setPushForm({ ...pushForm, subject: e.target.value })}
                    placeholder="mailto:systems.wonderfulgroup@gmail.com"
                    helpText="A mailto: address or https:// URL push services can use to contact you."
                  />
                  <FormField
                    label="Public key"
                    name="public_key"
                    value={pushForm.public_key}
                    onChange={(e) => setPushForm({ ...pushForm, public_key: e.target.value })}
                    helpText="Sent to browsers to authorize subscriptions."
                  />
                  <FormField
                    label="Private key"
                    name="private_key"
                    type="password"
                    value={pushForm.private_key}
                    onChange={(e) => setPushForm({ ...pushForm, private_key: e.target.value })}
                    placeholder={settings?.push?.private_key_set ? 'Leave blank to keep existing key' : ''}
                    helpText="Kept server-side only. Never sent to browsers."
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={generatePushKeys}
                        disabled={generatingPushKeys}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-navy-800 transition-colors hover:border-gray-300 hover:bg-navy-50 disabled:opacity-60"
                      >
                        <RefreshCw size={16} aria-hidden="true" className={generatingPushKeys ? 'animate-spin' : ''} />
                        Generate new pair
                      </button>
                      {pushForm.public_key ? (
                        <button
                          type="button"
                          onClick={copyPushPublicKey}
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-navy-800 transition-colors hover:border-gray-300 hover:bg-navy-50"
                        >
                          <Copy size={16} aria-hidden="true" />
                          Copy public key
                        </button>
                      ) : null}
                    </div>
                    <LoadingButton type="submit" loading={savingPush}>
                      Save push settings
                    </LoadingButton>
                  </div>
                  <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-amber-600/20">
                    Rotating keys (generating a new pair or pasting a different one) invalidates every existing
                    subscription — users will need to re-enable notifications afterward.
                  </p>
                </form>
              </SettingsFormBlock>

              <SettingsFormBlock title="Send test push" subtitle="Delivers to your own signed-in browser subscription">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-navy-50/40 px-3 py-2.5 text-xs">
                    {browserPushSubscribed ? (
                      <span className="inline-flex items-center gap-1.5 text-emerald-700">
                        <CheckCircle2 size={14} aria-hidden="true" />
                        This browser is subscribed
                      </span>
                    ) : (
                      <span className="text-navy-500">This browser is not subscribed yet.</span>
                    )}
                  </div>
                  <LoadingButton
                    type="button"
                    loading={subscribingPush}
                    onClick={enablePushOnThisBrowser}
                    variant={browserPushSubscribed ? 'secondary' : 'primary'}
                    className="w-full sm:w-auto"
                  >
                    {browserPushSubscribed ? 'Re-subscribe this browser' : 'Enable on this browser'}
                  </LoadingButton>
                  <p className="text-xs text-navy-500">
                    Requires saved VAPID keys and browser notification permission. Then send a test push to confirm
                    delivery end-to-end.
                  </p>
                  <LoadingButton type="button" loading={testingPush} onClick={runPushTest} className="w-full sm:w-auto">
                    Send test
                  </LoadingButton>
                </div>
              </SettingsFormBlock>
            </div>
          </div>
        )}

        {tab === 'health' && hasPermission('platform.health') && (
          <div>
            <TabPanelHeader
              title="System Health"
              subtitle="API, database and notification delivery status"
            />
            <PlatformHealthPanel />
          </div>
        )}
        </div>
      </SettingsCard>
    </div>
  );
}
