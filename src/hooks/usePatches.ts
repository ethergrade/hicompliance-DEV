import { useState, useEffect } from 'react';
import { hipatchApi, type HipatchPending, type HipatchPerformed } from '@/lib/api/hipatch';
import { useClientOrganization } from './useClientOrganization';
import type { PatchDashboardData } from '@/lib/api/patches';

const mockPatchData: PatchDashboardData = {
  stats: {
    osPending: 3,
    osInstalled: 4,
    softwareAvailable: 6,
    softwareInstalled: 5,
    failedPatches: 3,
  },
  osPatchesPending: [
    { systemName: 'SRV2025-HYPERV', patch: 'Definition updates', description: 'Update for Windows Security platform - KB5007651 (Version 10.0.27840.1000)', kbNumber: 'KB5007651', severity: 'Important' },
    { systemName: 'SRV2025-HYPERV', patch: 'Security updates', description: '2025-07 Cumulative Update for Microsoft server operating system version 24H2 for x64-based Systems (KB5062553)', kbNumber: 'KB5062553', severity: 'Important' },
    { systemName: 'SRV2022DOMOTZ', patch: 'Security updates', description: '2025-07 Cumulative Update for Microsoft server operating system version 21H2 for x64-based Systems (KB5062572)', kbNumber: 'KB5062572', severity: 'Important' },
  ],
  osPatchesInstalled: [
    { systemName: 'SRV2025-HYPERV', patch: 'Security updates', description: '2025-07 Cumulative Update for Microsoft server operating system version 24H2 for x64-based Systems (KB5062553)', kbNumber: 'KB5062553', status: 'Failed', severity: 'Important' },
    { systemName: 'SRV2025-HYPERV', patch: 'Definition updates', description: 'Update for Windows Security platform - KB5007651 (Version 10.0.27840.1000)', kbNumber: 'KB5007651', status: 'Failed', severity: 'Important' },
    { systemName: 'NB-PUCCINELLI', patch: "Aggiornamento dell'intelligence sulla sicurezza per Microsoft Defender Antivirus", description: '-2267602 KB (versione 1.441.307.0) - Canale corrente (Generico)', kbNumber: 'KB', status: 'Installed', severity: 'Low' },
    { systemName: 'NB-PUCCINELLI', patch: 'Aggiornamento per Microsoft Defender Antivirus piattaforma antimalware', description: '- 4052623 KB (versione 4.18.25100.9008) - Canale corrente (Generico)', kbNumber: 'KB', status: 'Installed', severity: 'Low' },
  ],
  softwarePatchesAvailable: [
    { systemName: 'SRV2022-VIRT-HV', patch: 'Installer', description: 'Open Office', impact: 'Critical', status: 'Rejected' },
    { systemName: 'SRV2022-VIRT-HV', patch: 'Installer', description: 'Google Chrome', impact: 'Critical', status: 'Rejected' },
    { systemName: 'SRV2022-VIRT-HV', patch: 'Installer', description: 'Thunderbird x64', impact: 'Critical', status: 'Rejected' },
    { systemName: 'SRV2022-VIRT-HV', patch: 'Installer', description: 'Mozilla Firefox x64', impact: 'Critical', status: 'Rejected' },
    { systemName: 'SRV2022DOMOTZ', patch: 'Installer', description: 'Open Office', impact: 'Critical', status: 'Rejected' },
    { systemName: 'NB-PUCCINELLI', patch: 'Installer', description: 'WinRAR x64', impact: 'Critical', status: 'Rejected' },
  ],
  softwarePatchesInstalled: [
    { systemName: 'NB-PUCCINELLI', product: 'OBS Studio', type: 'PATCH', status: 'Failed' },
    { systemName: 'NB-PUCCINELLI', product: 'Microsoft Visual C++ 2015-2022 Redistributable (x86)', type: 'PATCH', status: 'Installed' },
    { systemName: 'NB-PUCCINELLI', product: 'Dev Home (Preview)', type: 'PATCH', status: 'Installed' },
    { systemName: 'SRV2022DOMOTZ', product: 'Microsoft Edge', type: 'PATCH', status: 'Installed' },
    { systemName: 'SRV2022DOMOTZ', product: 'Beats winlogbeat', type: 'PATCH', status: 'Installed' },
  ],
};

// Map backend CSV columns to frontend expected format
function mapPendingToOsPending(pending: HipatchPending[]) {
  return pending.map((p) => ({
    systemName: p.system_name || p.systemName || 'Unknown',
    patch: p.patch || 'Unknown',
    description: p.description || '',
    kbNumber: p.kb_number || p.kbNumber || '',
    severity: (p.severity as 'Low' | 'Medium' | 'Important' | 'Critical') || 'Medium',
  }));
}

function mapPerformedToOsInstalled(performed: HipatchPerformed[]) {
  return performed.map((p) => ({
    systemName: p.system_name || p.systemName || 'Unknown',
    patch: p.patch || 'Unknown',
    description: p.description || '',
    kbNumber: p.kb_number || p.kbNumber || '',
    status: p.status || 'Pending',
    severity: (p.severity as 'Low' | 'Medium' | 'Important' | 'Critical') || 'Medium',
  }));
}

interface UsePatchDashboardResult {
  data: PatchDashboardData;
  loading: boolean;
  error: Error | null;
  isMock: boolean;
}

export function usePatchDashboard(): UsePatchDashboardResult {
  const { organizationId, groupId } = useClientOrganization();
  const [data, setData] = useState<PatchDashboardData>({
    stats: {
      osPending: 0,
      osInstalled: 0,
      softwareAvailable: 0,
      softwareInstalled: 0,
      failedPatches: 0,
    },
    osPatchesPending: [],
    osPatchesInstalled: [],
    softwarePatchesAvailable: [],
    softwarePatchesInstalled: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isMock, setIsMock] = useState(false);

  useEffect(() => {
    if (!organizationId) {
      setLoading(false);
      setIsMock(true);
      return;
    }

    setLoading(true);
    setIsMock(false);

    hipatchApi
      .dashboard(organizationId, groupId)
      .then((result) => {
        // Map backend data to PatchDashboardData format
        const osPending = mapPendingToOsPending(result.pending || []);
        const osInstalled = mapPerformedToOsInstalled(result.performed || []);
        
        // Software patches not available in hipatch backend - keep empty
        const softwareAvailable: PatchDashboardData['softwarePatchesAvailable'] = [];
        const softwareInstalled: PatchDashboardData['softwarePatchesInstalled'] = [];

        setData({
          stats: {
            osPending: osPending.length,
            osInstalled: osInstalled.length,
            softwareAvailable: 0,
            softwareInstalled: 0,
            failedPatches: osInstalled.filter((p) => p.status === 'Failed').length,
          },
          osPatchesPending: osPending,
          osPatchesInstalled: osInstalled,
          softwarePatchesAvailable: softwareAvailable,
          softwarePatchesInstalled: softwareInstalled,
        });
        
        setError(null);
      })
      .catch((err) => {
        setError(err);
        // No mock fallback - show empty state
      })
      .finally(() => setLoading(false));
  }, [organizationId, groupId]);

  return { data, loading, error, isMock };
}

export { type PatchDashboardData } from '@/lib/api/patches';
