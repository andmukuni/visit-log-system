import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Lock, LogIn } from 'lucide-react';
import { LoadingButton, IconButton } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { getApiBase } from '../utils/apiBase';
import { APP_NAME, APP_NAME_SHORT, LOGO_PATH } from '../../shared/branding.js';
import LoginHeroPanel from '../components/admin/LoginHeroPanel';

const API_BASE = getApiBase();

async function authRequest(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    throw new Error(json?.message || 'Request failed');
  }
  return json;
}

export default function ResetPasswordPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = String(searchParams.get('token') || '').trim();

  const [checking, setChecking] = useState(Boolean(token));
  const [valid, setValid] = useState(false);
  const [accountLabel, setAccountLabel] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function validate() {
      if (!token) {
        setChecking(false);
        setValid(false);
        return;
      }
      setChecking(true);
      try {
        const json = await authRequest(`/auth/reset-password?token=${encodeURIComponent(token)}`);
        if (cancelled) return;
        setValid(true);
        setAccountLabel(json.data?.email || json.data?.name || '');
      } catch (err) {
        if (cancelled) return;
        setValid(false);
        toast.error(err?.message || 'Invalid password reset link.');
      } finally {
        if (!cancelled) setChecking(false);
      }
    }
    void validate();
    return () => { cancelled = true; };
  }, [token, toast]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token) return;
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      toast.error('Passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      await authRequest('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, new_password: password }),
      });
      toast.success('Password updated. You can sign in now.');
      navigate('/login', { replace: true });
    } catch (err) {
      toast.error(err?.message || 'Could not reset password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <LoginHeroPanel />
      <main className="relative z-0 flex flex-1 items-center justify-center bg-gray-950 lg:bg-white px-6 py-12 sm:px-10 lg:-ml-14 lg:px-16 xl:-ml-[4.5rem]">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden text-center">
            <img
              src={LOGO_PATH}
              alt={APP_NAME}
              width={160}
              height={64}
              className="mx-auto h-14 max-w-[160px] w-auto object-contain"
            />
            <p className="text-gray-400 text-sm mt-3">{APP_NAME_SHORT}</p>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white lg:text-gray-900">Set a new password</h2>
            <p className="text-gray-400 lg:text-gray-500 text-sm mt-1.5">
              {accountLabel ? `Account: ${accountLabel}` : 'Choose a password for your host account.'}
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl p-8 lg:shadow-none lg:p-0 lg:bg-transparent lg:rounded-none">
            {checking ? (
              <p className="text-sm text-gray-500">Checking reset link…</p>
            ) : !token || !valid ? (
              <div className="space-y-4">
                <p className="text-sm text-red-700">
                  This password reset link is invalid or has expired. Ask an administrator to send a new one.
                </p>
                <Link to="/login" className="inline-flex items-center gap-2 text-sm font-semibold text-[#1a73e8]">
                  <LogIn size={16} /> Back to sign in
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                    New password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <Lock size={16} className="text-gray-400" />
                    </div>
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      className="w-full pl-10 pr-11 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-1.5">
                      <IconButton
                        icon={showPassword ? EyeOff : Eye}
                        label={showPassword ? 'Hide password' : 'Show password'}
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowPassword((v) => !v)}
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 mb-1.5">
                    Confirm password
                  </label>
                  <input
                    id="confirm"
                    type={showPassword ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  />
                </div>
                <div className="flex items-center justify-between gap-3 pt-1">
                  <Link to="/login" className="text-sm font-medium text-gray-500 hover:text-gray-800">
                    Back to sign in
                  </Link>
                  <LoadingButton
                    type="submit"
                    loading={saving}
                    loadingLabel="Saving"
                    disabled={!password || !confirm}
                    variant="primary"
                    size="lg"
                  >
                    Save password
                  </LoadingButton>
                </div>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
