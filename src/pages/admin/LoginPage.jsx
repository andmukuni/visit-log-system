import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Lock, Mail, Eye, EyeOff, LogIn, HelpCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { LoadingButton, IconButton } from '../../components/ui';
import { purgeInvalidAuthState } from '../../utils/authHeaders';
import { APP_NAME, APP_NAME_SHORT, LOGO_PATH } from '../../../shared/branding.js';
import { CACHED_STATIC_ASSETS, warmLoginHeroAsset, warmLogoAsset } from '../../utils/staticAssetCache';
import LoginHeroPanel from '../../components/admin/LoginHeroPanel';
import { resolvePortalRoute } from '../../../shared/portalNavigation.js';

const LOGIN_HERO_SRC = CACHED_STATIC_ASSETS.loginHero;
const LOGO_SRC = LOGO_PATH;

export default function LoginPage() {
  const { login, isAuthenticated, loginError, clearLoginError, isLoading, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const from = location.state?.from?.pathname;
  const defaultPortal = resolvePortalRoute(user?.permissions || user?.admin_permissions || []);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    purgeInvalidAuthState();
  }, []);

  useEffect(() => {
    const heroPreload = document.createElement('link');
    heroPreload.rel = 'preload';
    heroPreload.as = 'image';
    heroPreload.href = LOGIN_HERO_SRC;
    heroPreload.type = 'image/webp';
    document.head.appendChild(heroPreload);

    const logoPreload = document.createElement('link');
    logoPreload.rel = 'preload';
    logoPreload.as = 'image';
    logoPreload.href = LOGO_SRC;
    logoPreload.type = 'image/png';
    document.head.appendChild(logoPreload);

    warmLoginHeroAsset();
    warmLogoAsset();

    return () => {
      heroPreload.remove();
      logoPreload.remove();
    };
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      navigate(from || defaultPortal, { replace: true });
    }
  }, [isAuthenticated, navigate, from, defaultPortal]);

  useEffect(() => {
    if (loginError) clearLoginError();
  }, [email, password]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e) => {
    e.preventDefault();
    const session = await login(email, password);
    if (session) {
      toast.success('Signed in successfully.');
      const portalRoute = resolvePortalRoute(session.permissions || session.admin_permissions || []);
      navigate(from || portalRoute, { replace: true });
    }
  };

  useEffect(() => {
    if (loginError) toast.error(loginError);
  }, [loginError, toast]);

  return (
    <div className="min-h-screen flex">
      <LoginHeroPanel />

      <main className="relative z-0 flex flex-1 items-center justify-center bg-gray-950 lg:bg-white px-6 py-12 sm:px-10 lg:-ml-14 lg:px-16 xl:-ml-[4.5rem]">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden text-center">
            <div className="inline-flex">
              <img
                src={LOGO_SRC}
                alt={APP_NAME}
                width={160}
                height={64}
                decoding="async"
                className="h-14 max-w-[160px] w-auto object-contain sm:h-16 sm:max-w-[200px]"
              />
            </div>
            <p className="text-gray-400 text-sm mt-3">{APP_NAME_SHORT}</p>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white lg:text-gray-900">Welcome back</h2>
            <p className="text-gray-400 lg:text-gray-500 text-sm mt-1.5">Sign in to your account</p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl p-8 lg:shadow-none lg:p-0 lg:bg-transparent lg:rounded-none">
            {loginError && (
              <div className="mb-6 p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                {loginError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Email address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Mail size={16} className="text-gray-400" />
                  </div>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    autoFocus
                    placeholder="admin@template.dev"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-colors"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Password
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
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    className="w-full pl-10 pr-11 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-colors"
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-1.5">
                    <IconButton
                      icon={showPassword ? EyeOff : Eye}
                      label={showPassword ? 'Hide password' : 'Show password'}
                      tooltip={showPassword ? 'Hide password' : 'Show password'}
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowPassword(!showPassword)}
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <IconButton
                  icon={HelpCircle}
                  label="Demo credentials"
                  tooltip="Super admin: admin@template.dev / admin123 · Portal users: *@demo.org / demo1234"
                  variant="ghost"
                  type="button"
                />
                <LoadingButton
                  type="submit"
                  loading={isLoading}
                  loadingLabel="Signing in"
                  icon={LogIn}
                  iconOnly
                  aria-label="Sign in"
                  disabled={!email || !password}
                  variant="primary"
                  size="lg"
                />
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
