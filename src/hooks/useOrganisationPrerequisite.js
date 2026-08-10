import { useCallback, useEffect, useState } from 'react';
import { visitorApi } from '../utils/visitorApi';

/**
 * Organisation is required before any structure can exist:
 * Sites, Buildings & Zones, Offices, Stations & Gates, Departments, Hosts.
 */
export function useOrganisationPrerequisite() {
  const [loading, setLoading] = useState(true);
  const [organisations, setOrganisations] = useState([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await visitorApi.getOrganisations();
      setOrganisations(Array.isArray(rows) ? rows : []);
    } catch {
      setOrganisations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const hasOrganisation = organisations.some((org) => org?.id);
  const hasActiveOrganisation = organisations.some((org) => org?.status === 'active');

  return {
    loading,
    organisations,
    hasOrganisation,
    hasActiveOrganisation,
    refresh,
  };
}
