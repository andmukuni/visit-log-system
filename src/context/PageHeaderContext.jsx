import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const EMPTY_HEADER = {
  title: '',
  subtitle: '',
  breadcrumbs: [],
  actions: null,
};

const PageHeaderContext = createContext({
  header: EMPTY_HEADER,
  setHeader: () => {},
});

export function PageHeaderProvider({ children }) {
  const [header, setHeader] = useState(EMPTY_HEADER);

  const value = useMemo(() => ({ header, setHeader }), [header]);

  return (
    <PageHeaderContext.Provider value={value}>
      {children}
    </PageHeaderContext.Provider>
  );
}

export function usePageHeaderState() {
  return useContext(PageHeaderContext);
}

export function useRegisterPageHeader({ title, subtitle, breadcrumbs, actions }) {
  const { setHeader } = usePageHeaderState();

  useEffect(() => {
    setHeader({
      title: title || '',
      subtitle: subtitle || '',
      breadcrumbs: breadcrumbs || [],
      actions: actions ?? null,
    });
    return () => setHeader(EMPTY_HEADER);
  }, [title, subtitle, breadcrumbs, actions, setHeader]);
}
