import { useApiWithFallback } from './useApiWithFallback';
import { endpointsApi } from '@/lib/api/endpoints';

// Extended types matching the actual dashboard mock data
export interface EndpointStats {
  totalEndpoints: number;
  protectedEndpoints: number;
  atRiskEndpoints: number;
  onlineEndpoints: number;
  offlineEndpoints: number;
  pendingUpdates: number;
}

export interface EndpointDevice {
  id: string;
  name: string;
  type: 'Workstation' | 'Laptop' | 'Server' | 'Mobile';
  os: string;
  lastSeen: string;
  status: 'Online' | 'Offline';
  protection: 'Protected' | 'At Risk' | 'Unknown' | 'Outdated';
  threats: number;
  compliance: number;
}

export interface DetectedThreat {
  id: string;
  endpoint: string;
  threatName: string;
  type: string;
  detectedAt: string;
  status: 'Quarantined' | 'Removed' | 'Blocked' | 'Patched' | 'Pending';
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
}

export interface PendingUpdate {
  endpoint: string;
  currentVersion: string;
  latestVersion: string;
  component: string;
  daysOutdated: number;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
}

export interface EndpointDashboardData {
  stats: EndpointStats;
  endpoints: EndpointDevice[];
  detectedThreats: DetectedThreat[];
  pendingUpdates: PendingUpdate[];
}

const mockEndpointData: EndpointDashboardData = {
  stats: {
    totalEndpoints: 156,
    protectedEndpoints: 142,
    atRiskEndpoints: 14,
    onlineEndpoints: 134,
    offlineEndpoints: 22,
    pendingUpdates: 28,
  },
  endpoints: [
    { id: 'EP-001', name: 'WS-ADMIN-01', type: 'Workstation', os: 'Windows 11 Pro', lastSeen: '2025-01-28 09:52:00', status: 'Online', protection: 'Protected', threats: 0, compliance: 98 },
    { id: 'EP-002', name: 'SRV-DC-01', type: 'Server', os: 'Windows Server 2022', lastSeen: '2025-01-28 09:51:45', status: 'Online', protection: 'Protected', threats: 0, compliance: 100 },
    { id: 'EP-003', name: 'NB-SALES-05', type: 'Laptop', os: 'Windows 11 Pro', lastSeen: '2025-01-28 09:45:00', status: 'Online', protection: 'At Risk', threats: 2, compliance: 72 },
    { id: 'EP-004', name: 'WS-DEV-03', type: 'Workstation', os: 'macOS Sonoma', lastSeen: '2025-01-28 09:50:30', status: 'Online', protection: 'Protected', threats: 0, compliance: 95 },
    { id: 'EP-005', name: 'MB-CEO', type: 'Mobile', os: 'iOS 17.2', lastSeen: '2025-01-28 08:30:00', status: 'Offline', protection: 'Unknown', threats: 0, compliance: 85 },
    { id: 'EP-006', name: 'SRV-FILE-01', type: 'Server', os: 'Windows Server 2019', lastSeen: '2025-01-28 09:52:10', status: 'Online', protection: 'At Risk', threats: 1, compliance: 68 },
    { id: 'EP-007', name: 'NB-HR-02', type: 'Laptop', os: 'Windows 10 Pro', lastSeen: '2025-01-27 18:00:00', status: 'Offline', protection: 'Outdated', threats: 0, compliance: 45 },
    { id: 'EP-008', name: 'WS-FINANCE-01', type: 'Workstation', os: 'Windows 11 Pro', lastSeen: '2025-01-28 09:48:00', status: 'Online', protection: 'Protected', threats: 0, compliance: 100 },
  ],
  detectedThreats: [
    { id: 'TH-001', endpoint: 'NB-SALES-05', threatName: 'Trojan.GenericKD.46584', type: 'Malware', detectedAt: '2025-01-28 09:15:00', status: 'Quarantined', severity: 'High' },
    { id: 'TH-002', endpoint: 'NB-SALES-05', threatName: 'Adware.BrowserModifier', type: 'PUP', detectedAt: '2025-01-28 08:45:00', status: 'Removed', severity: 'Low' },
    { id: 'TH-003', endpoint: 'SRV-FILE-01', threatName: 'Ransom.WannaCry.Gen', type: 'Ransomware', detectedAt: '2025-01-28 07:30:00', status: 'Blocked', severity: 'Critical' },
    { id: 'TH-004', endpoint: 'WS-DEV-03', threatName: 'Exploit.CVE-2024-1234', type: 'Exploit', detectedAt: '2025-01-27 16:20:00', status: 'Patched', severity: 'Medium' },
    { id: 'TH-005', endpoint: 'NB-HR-02', threatName: 'Spyware.Keylogger', type: 'Spyware', detectedAt: '2025-01-27 14:00:00', status: 'Pending', severity: 'High' },
  ],
  pendingUpdates: [
    { endpoint: 'NB-HR-02', currentVersion: '4.18.2311', latestVersion: '4.18.2501', component: 'Antivirus Definitions', daysOutdated: 45, priority: 'Critical' },
    { endpoint: 'SRV-FILE-01', currentVersion: '4.18.2412', latestVersion: '4.18.2501', component: 'Antivirus Definitions', daysOutdated: 15, priority: 'High' },
    { endpoint: 'WS-DEV-03', currentVersion: '2.1.5', latestVersion: '2.2.0', component: 'Agent Software', daysOutdated: 7, priority: 'Medium' },
    { endpoint: 'NB-SALES-05', currentVersion: '4.18.2489', latestVersion: '4.18.2501', component: 'Antivirus Definitions', daysOutdated: 3, priority: 'Low' },
  ],
};

export function useEndpointDashboard(tenantId?: string) {
  return useApiWithFallback<EndpointDashboardData>(
    () => endpointsApi.dashboard(tenantId) as Promise<EndpointDashboardData>,
    mockEndpointData,
    [tenantId],
  );
}
