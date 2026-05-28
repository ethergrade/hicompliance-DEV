import { useState, useEffect } from 'react';
import { hipatchApi, type HipatchDashboardData } from '@/lib/api/hipatch';
import { useClientOrganization } from './useClientOrganization';

const emptyData: HipatchDashboardData = {
  assets: [],
  pending: [],
  performed: [],
  remediations: [],
};

interface UseHipatchResult {
  data: HipatchDashboardData;
  loading: boolean;
  error: Error | null;
  isActive: boolean; // true if hipatch service is configured
}

export function useHipatchDashboard(): UseHipatchResult {
  const { organizationId, groupId } = useClientOrganization();
  const [data, setData] = useState<HipatchDashboardData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    if (!organizationId) {
      setLoading(false);
      setIsActive(false);
      return;
    }

    setLoading(true);
    hipatchApi
      .dashboard(organizationId, groupId)
      .then((result) => {
        setData(result);
        // Service is active if we got any data or if arrays are empty but not null
        setIsActive(true);
        setError(null);
      })
      .catch((err) => {
        setError(err);
        setIsActive(false);
      })
      .finally(() => setLoading(false));
  }, [organizationId, groupId]);

  return { data, loading, error, isActive };
}

export { type HipatchDashboardData } from '@/lib/api/hipatch';
