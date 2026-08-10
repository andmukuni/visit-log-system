import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useAuth } from './AuthContext';
import { visitorApi } from '../utils/visitorApi';
import {
  ADMIN_ORG_FILTER_ALL,
  ADMIN_ORG_FILTER_STORAGE_KEY,
  canSelectAdminOrganisation,
} from '../../shared/adminOrganisationAccess.js';

const AdminOrganisationContext = createContext(null);

function readStoredOrganisationId() {
  try {
    // null => never chosen (auto-pick); '' => explicit "All organisations"
    return sessionStorage.getItem(ADMIN_ORG_FILTER_STORAGE_KEY);
  } catch {
    return null;
  }
}

function pickDefaultOrganisation(rows = []) {
  if (!rows.length) return ADMIN_ORG_FILTER_ALL;
  const wonderful = rows.find((row) => /wonderful/i.test(String(row.name || '')));
  if (wonderful?.id) return wonderful.id;
  return rows[0]?.id || ADMIN_ORG_FILTER_ALL;
}

export function AdminOrganisationProvider({ children }) {
  const { user, hasPermission } = useAuth();
  const canSelect = canSelectAdminOrganisation(user, hasPermission);
  const [organisationId, setOrganisationIdState] = useState(() => readStoredOrganisationId());
  const [organisations, setOrganisations] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!canSelect) {
      setOrganisations([]);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    visitorApi.getOrganisations()
      .then((rows) => {
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : [];
        setOrganisations(list);

        // First visit: land on the primary company, not "All" (avoids demo-org noise).
        if (readStoredOrganisationId() === null) {
          const preferred = pickDefaultOrganisation(list);
          setOrganisationIdState(preferred);
          try {
            sessionStorage.setItem(ADMIN_ORG_FILTER_STORAGE_KEY, preferred);
          } catch {
            /* ignore */
          }
        }
      })
      .catch(() => {
        if (!cancelled) setOrganisations([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canSelect, user?.id]);

  const setOrganisationId = useCallback((nextId) => {
    const value = nextId == null ? ADMIN_ORG_FILTER_ALL : String(nextId);
    setOrganisationIdState(value);
    try {
      sessionStorage.setItem(ADMIN_ORG_FILTER_STORAGE_KEY, value);
    } catch {
      /* ignore */
    }
  }, []);

  const selectedOrganisation = useMemo(
    () => organisations.find((row) => row.id === organisationId) || null,
    [organisations, organisationId],
  );

  // null means default not resolved yet — wait before querying "All".
  const filterReady = !canSelect || organisationId !== null;
  const resolvedOrganisationId = !canSelect
    ? ADMIN_ORG_FILTER_ALL
    : (organisationId == null ? ADMIN_ORG_FILTER_ALL : organisationId);

  const queryParams = useMemo(() => {
    if (!canSelect) return {};
    if (organisationId == null) return {};
    if (!organisationId) return {};
    return { organisation_id: organisationId };
  }, [canSelect, organisationId]);

  const value = useMemo(() => ({
    canSelect,
    loading: loading || (canSelect && !filterReady),
    organisations,
    organisationId: resolvedOrganisationId,
    selectedOrganisation,
    setOrganisationId,
    queryParams,
    filterReady,
    label: selectedOrganisation?.name || 'All organisations',
  }), [
    canSelect,
    loading,
    filterReady,
    organisations,
    resolvedOrganisationId,
    selectedOrganisation,
    setOrganisationId,
    queryParams,
  ]);

  return (
    <AdminOrganisationContext.Provider value={value}>
      {children}
    </AdminOrganisationContext.Provider>
  );
}

export function useAdminOrganisation() {
  const ctx = useContext(AdminOrganisationContext);
  if (!ctx) {
    return {
      canSelect: false,
      loading: false,
      organisations: [],
      organisationId: ADMIN_ORG_FILTER_ALL,
      selectedOrganisation: null,
      setOrganisationId: () => {},
      queryParams: {},
      filterReady: true,
      label: 'All organisations',
    };
  }
  return ctx;
}
