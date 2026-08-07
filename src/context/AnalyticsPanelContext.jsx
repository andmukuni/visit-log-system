import { createContext, useContext, useMemo, useState } from 'react';

const AnalyticsPanelContext = createContext({
  content: null,
  setContent: () => {},
  collapsed: false,
  setCollapsed: () => {},
});

export function AnalyticsPanelProvider({ children }) {
  const [content, setContent] = useState(null);
  const [collapsed, setCollapsed] = useState(false);

  const value = useMemo(
    () => ({ content, setContent, collapsed, setCollapsed }),
    [content, collapsed],
  );

  return (
    <AnalyticsPanelContext.Provider value={value}>
      {children}
    </AnalyticsPanelContext.Provider>
  );
}

export function useAnalyticsPanel() {
  return useContext(AnalyticsPanelContext);
}
