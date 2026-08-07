import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Lock, Mail, Eye, EyeOff, LogIn, HelpCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { LoadingButton, IconButton } from '../../components/ui';
import { purgeInvalidAuthState } from '../../utils/authHeaders';
import { APP_NAME, APP_NAME_SHORT, APP_TAGLINE, LOGO_PATH } from '../../../shared/branding.js';
import { CACHED_STATIC_ASSETS, warmLoginHeroAsset, warmLogoAsset } from '../../utils/staticAssetCache';
import { resolvePrimaryPortal, PORTALS } from '../../../shared/portalNavigation.js';
import { permissionMatches } from '../../../shared/rbacPermissions.js';

const LOGIN_HERO_SRC = CACHED_STATIC_ASSETS.loginHero;
const LOGO_SRC = LOGO_PATH;

function portalRouteForPermissions(permissions = []) {
  const hasPermission = (key) => permissionMatches(permissions, key);
  return PORTALS[resolvePrimaryPortal(hasPermission)]?.routePrefix || '/admin';
}

export default function LoginPage() {
  const { login, isAuthenticated, loginError, clearLoginError, isLoading, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const from = location.state?.from?.pathname;
  const defaultPortal = portalRouteForPermissions(user?.permissions || user?.admin_permissions || []);

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
    const success = await login(email, password);
    if (success) {
      toast.success('Signed in successfully.');
      navigate(from || defaultPortal, { replace: true });
    }
  };

  useEffect(() => {
    if (loginError) toast.error(loginError);
  }, [loginError, toast]);

  return (
    <div className="min-h-screen flex">
      <aside className="relative z-10 hidden lg:flex lg:w-1/2 xl:w-[55%] min-h-screen overflow-hidden [clip-path:polygon(0_0,100%_0,calc(100%-3.5rem)_100%,0_100%)] xl:[clip-path:polygon(0_0,100%_0,calc(100%-4.5rem)_100%,0_100%)] bg-gray-950">
        <img
          src={LOGIN_HERO_SRC}
          alt=""
          width={720}
          height={1080}
          decoding="async"
          fetchPriority="high"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gray-950/50" />
        <div className="relative z-10 flex min-h-screen w-full flex-1 flex-col items-center justify-center px-10 py-14 xl:px-14">
          <div className="flex w-full max-w-2xl flex-col items-center text-center lg:-translate-x-4 xl:-translate-x-5">
            <div className="mb-6">
              <img
                src={LOGO_SRC}
                alt={APP_NAME}
                width={200}
                height={80}
                decoding="async"
                className="h-16 max-w-[200px] w-auto object-contain xl:h-20"
              />
            </div>
            <h1 className="whitespace-nowrap text-[clamp(1.5rem,2.6vw,2.75rem)] font-black text-white uppercase leading-none tracking-tight">
              {APP_NAME}
            </h1>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-gray-300">
              {APP_TAGLINE}
            </p>
          </div>
        </div>
      </aside>

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
                  tooltip="Demo: admin@template.dev / admin123"
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
