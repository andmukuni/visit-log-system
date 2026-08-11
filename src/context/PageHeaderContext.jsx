import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

const EMPTY_BREADCRUMBS = [];

const EMPTY_HEADER = {
  title: '',
  subtitle: '',
  breadcrumbs: EMPTY_BREADCRUMBS,
  actions: null,
  iconKey: '',
};

const PageHeaderContext = createContext({
  header: EMPTY_HEADER,
  setHeader: () => {},
});

function headersEqual(a, b) {
  return (
    a.title === b.title
    && a.subtitle === b.subtitle
    && a.iconKey === b.iconKey
    && a.actions === b.actions
    && JSON.stringify(a.breadcrumbs) === JSON.stringify(b.breadcrumbs)
  );
}

export function PageHeaderProvider({ children }) {
  const location = useLocation();
  const [header, setHeaderState] = useState(EMPTY_HEADER);

  useEffect(() => {
    setHeaderState(EMPTY_HEADER);
  }, [location.pathname]);

  const setHeader = useCallback((next) => {
    setHeaderState((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      return headersEqual(prev, resolved) ? prev : resolved;
    });
  }, []);

  const value = useMemo(() => ({ header, setHeader }), [header, setHeader]);

  return (
    <PageHeaderContext.Provider value={value}>
      {children}
    </PageHeaderContext.Provider>
  );
}

export function usePageHeaderState() {
  return useContext(PageHeaderContext);
}

export function useRegisterPageHeader({ title, subtitle, breadcrumbs, actions, iconKey }) {
  const { setHeader } = usePageHeaderState();
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const resolvedBreadcrumbs = breadcrumbs ?? EMPTY_BREADCRUMBS;
  const breadcrumbsKey = JSON.stringify(resolvedBreadcrumbs);

  useEffect(() => {
    setHeader({
      title: title || '',
      subtitle: subtitle || '',
      breadcrumbs: JSON.parse(breadcrumbsKey),
      actions: actionsRef.current ?? null,
      iconKey: iconKey || '',
    });
    return () => setHeader(EMPTY_HEADER);
  }, [title, subtitle, breadcrumbsKey, iconKey, setHeader]);
}
