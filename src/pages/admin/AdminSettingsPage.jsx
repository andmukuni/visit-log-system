import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  PageHeader,
  FormField,
  LoadingButton,
  Spinner,
  FilterPills,
  useToast,
} from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { settingsApi } from '../../utils/settingsApi';

const TABS = [
  { value: 'general', label: 'General' },
  { value: 'account', label: 'Account' },
  { value: 'security', label: 'Security' },
  { value: 'notifications', label: 'Notifications' },
  { value: 'smtp', label: 'SMTP' },
  { value: 'dojah', label: 'Dojah KYC' },
  { value: 'sms', label: 'SMS' },
];

const NOTIFICATION_CATEGORIES = [
  { key: 'visit_registered', label: 'Visit registered', description: 'When a new visit is logged at a station or kiosk.' },
  { key: 'visit_approved', label: 'Visit approved', description: 'When a host or security approves a visit.' },
  { key: 'visit_rejected', label: 'Visit rejected', description: 'When a visit request is declined.' },
  { key: 'visit_checked_in', label: 'Visit check-in', description: 'When a visitor checks in on-site.' },
  { key: 'visit_checked_out', label: 'Visit check-out', description: 'When a visitor completes their visit.' },
  { key: 'visit_reminder', label: 'Visit reminder', description: 'Upcoming visit reminders for hosts and visitors.' },
  { key: 'vehicle_registered', label: 'Vehicle registered', description: 'When a vehicle entry is recorded at a gate.' },
  { key: 'emergency_roll_call', label: 'Emergency roll call', description: 'During emergency roll-call events.' },
  { key: 'incident_reported', label: 'Incident reported', description: 'When a security incident is logged.' },
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
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-2xl border border-gray-100 px-4 py-3 hover:bg-gray-50/80">
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        {description && <p className="mt-0.5 text-xs text-gray-500">{description}</p>}
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
      />
    </label>
  );
}

export default function AdminSettingsPage() {
  const location = useLocation();
  const isPlatform = location.pathname.startsWith('/platform');
  const { user, updateSession } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('general');
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
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [testEmail, setTestEmail] = useState('');
  const [testNrc, setTestNrc] = useState('');
  const [testSmsPhone, setTestSmsPhone] = useState('');
  const [savingAccount, setSavingAccount] = useState(false);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [savingSecurity, setSavingSecurity] = useState(false);
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [savingDojah, setSavingDojah] = useState(false);
  const [savingSms, setSavingSms] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [testingDojah, setTestingDojah] = useState(false);
  const [testingSms, setTestingSms] = useState(false);

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
        access_id: data?.sms?.access_id || '',
        sender_id: data?.sms?.sender_id || '',
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
    setTestingDojah(true);
    try {
      const json = await settingsApi.testDojah({ nrc: testNrc.trim() || undefined });
      toast.success(json.message || 'Dojah connection successful.');
    } catch (err) {
      toast.error(err.message || 'Dojah test failed.');
    } finally {
      setTestingDojah(false);
    }
  };

  const saveSms = async (event) => {
    event.preventDefault();
    setSavingSms(true);
    try {
      const payload = { ...smsForm };
      if (!payload.twilio_auth_token) delete payload.twilio_auth_token;
      await settingsApi.updateSms(payload);
      toast.success('SMS settings saved.');
      setSmsForm((prev) => ({ ...prev, twilio_auth_token: '' }));
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
      const json = await settingsApi.testSms({ phone: testSmsPhone.trim() || undefined });
      toast.success(json.message || 'SMS test successful.');
    } catch (err) {
      toast.error(err.message || 'SMS test failed.');
    } finally {
      setTestingSms(false);
    }
  };

  if (loading) {
    return (
      <>
        <PageHeader
          title="System Settings"
          subtitle="Configure organisation preferences, security, and delivery integrations"
          breadcrumbs={[
            { label: isPlatform ? 'Platform' : 'Administration', to: isPlatform ? '/platform' : '/admin' },
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
          { label: isPlatform ? 'Platform' : 'Administration', to: isPlatform ? '/platform' : '/admin' },
          { label: 'Settings' },
        ]}
      />

      {error && (
        <SettingsCard className="mb-4 p-4">
          <p className="text-sm text-red-600">{error}</p>
        </SettingsCard>
      )}

      <FilterPills options={TABS} value={tab} onChange={setTab} className="mb-4" />

      <SettingsCard className="p-5 sm:p-6">
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
          <div className="max-w-2xl">
            <TabPanelHeader
              title="Notification categories"
              subtitle="Choose which visitor-system events trigger email and SMS alerts"
            />
            <form onSubmit={saveNotifications} className="space-y-3">
              <ToggleRow
                label="In-app notifications"
                description="Show alerts inside the portal for signed-in users."
                checked={Boolean(notificationForm.in_app_notifications)}
                onChange={(value) => setNotificationForm({ ...notificationForm, in_app_notifications: value })}
              />

              {NOTIFICATION_CATEGORIES.map((cat) => (
                <div key={cat.key} className="rounded-2xl border border-gray-100 p-4 space-y-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{cat.label}</p>
                    {cat.description && <p className="text-xs text-gray-500">{cat.description}</p>}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <ToggleRow
                      label="Email"
                      checked={Boolean(notificationForm[`email_${cat.key}`])}
                      onChange={(value) => setNotificationForm({ ...notificationForm, [`email_${cat.key}`]: value })}
                    />
                    <ToggleRow
                      label="SMS"
                      checked={Boolean(notificationForm[`sms_${cat.key}`])}
                      onChange={(value) => setNotificationForm({ ...notificationForm, [`sms_${cat.key}`]: value })}
                    />
                  </div>
                </div>
              ))}

              <LoadingButton type="submit" loading={savingNotifications} className="mt-4">
                Save notification preferences
              </LoadingButton>
            </form>
          </div>
        )}

        {tab === 'smtp' && (
          <div className="max-w-2xl">
            <TabPanelHeader
              title="SMTP"
              subtitle={settings?.smtp?.configured
                ? `Configured via ${settings.smtp.source}`
                : 'Not configured — set values below or use SMTP_* environment variables'}
            />
            <form onSubmit={saveSmtp} className="space-y-4">
              <ToggleRow
                label="Enable SMTP"
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
              <LoadingButton type="submit" loading={savingSmtp}>
                Save SMTP settings
              </LoadingButton>
            </form>

            <TabSection title="Send test email" subtitle="Uses the effective SMTP configuration">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <FormField
                  label="Recipient"
                  name="test_email"
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                />
                <LoadingButton type="button" loading={testingSmtp} onClick={runSmtpTest}>
                  Send test
                </LoadingButton>
              </div>
              <p className="mt-3 text-xs text-gray-500">
                Delivery queue: {settings?.stats?.email_pending ?? 0} pending, {settings?.stats?.email_sent ?? 0} delivered
              </p>
            </TabSection>
          </div>
        )}

        {tab === 'dojah' && (
          <div className="max-w-2xl">
            <TabPanelHeader
              title="Dojah KYC"
              subtitle={settings?.dojah?.configured
                ? `Configured via ${settings.dojah.source}`
                : 'Not configured — set credentials below or use DOJAH_* environment variables'}
            />
            <form onSubmit={saveDojah} className="space-y-4">
              <ToggleRow
                label="Enable Dojah"
                description="Verify visitor identity via Dojah NRC lookup."
                checked={Boolean(dojahForm.enabled)}
                onChange={(value) => setDojahForm({ ...dojahForm, enabled: value })}
              />
              <FormField label="App ID" name="app_id" value={dojahForm.app_id} onChange={(e) => setDojahForm({ ...dojahForm, app_id: e.target.value })} />
              <FormField label="Public key" name="public_key" value={dojahForm.public_key} onChange={(e) => setDojahForm({ ...dojahForm, public_key: e.target.value })} />
              <FormField
                label="Private key"
                name="private_key"
                type="password"
                value={dojahForm.private_key}
                onChange={(e) => setDojahForm({ ...dojahForm, private_key: e.target.value })}
                placeholder={settings?.dojah?.private_key_set ? 'Leave blank to keep existing key' : ''}
              />
              <ToggleRow
                label="Use sandbox"
                description="Connect to Dojah sandbox instead of production."
                checked={Boolean(dojahForm.use_sandbox)}
                onChange={(value) => setDojahForm({ ...dojahForm, use_sandbox: value })}
              />
              <LoadingButton type="submit" loading={savingDojah}>
                Save Dojah settings
              </LoadingButton>
            </form>

            <TabSection title="Test connection" subtitle="Optional NRC lookup to verify credentials">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <FormField
                  label="Test NRC (optional)"
                  name="test_nrc"
                  value={testNrc}
                  onChange={(e) => setTestNrc(e.target.value)}
                  helpText="Leave empty to run a lightweight balance check."
                />
                <LoadingButton type="button" loading={testingDojah} onClick={runDojahTest}>
                  Test connection
                </LoadingButton>
              </div>
            </TabSection>
          </div>
        )}

        {tab === 'sms' && (
          <div className="max-w-2xl">
            <TabPanelHeader
              title="SMS provider"
              subtitle={settings?.sms?.configured
                ? `Configured via ${settings.sms.source} (${settings?.sms?.provider || 'console'})`
                : 'Not configured — choose a provider below or use environment variables'}
            />
            <form onSubmit={saveSms} className="space-y-4">
              <ToggleRow
                label="Enable SMS"
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
                  />
                  <FormField
                    label="Access ID / API key"
                    name="access_id"
                    value={smsForm.access_id}
                    onChange={(e) => setSmsForm({ ...smsForm, access_id: e.target.value })}
                  />
                  <FormField
                    label="Sender ID"
                    name="sender_id"
                    value={smsForm.sender_id}
                    onChange={(e) => setSmsForm({ ...smsForm, sender_id: e.target.value })}
                  />
                </>
              )}

              <LoadingButton type="submit" loading={savingSms}>
                Save SMS settings
              </LoadingButton>
            </form>

            <TabSection title="Send test SMS" subtitle="Requires a phone number when using Twilio or Ontech">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <FormField
                  label="Phone number"
                  name="test_sms_phone"
                  value={testSmsPhone}
                  onChange={(e) => setTestSmsPhone(e.target.value)}
                  placeholder="971234567"
                />
                <LoadingButton type="button" loading={testingSms} onClick={runSmsTest}>
                  Send test
                </LoadingButton>
              </div>
            </TabSection>
          </div>
        )}
      </SettingsCard>
    </div>
  );
}
