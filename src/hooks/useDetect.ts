import { useApiWithFallback } from './useApiWithFallback';
import { detectApi } from '@/lib/api/detect';

export interface DetectOverviewData {
  totalEndpoints: number;
  monitoredEndpoints: number;
  threatsDetected: number;
  alertsToday: number;
  avgResponseTime: string;
  coverageHours: string;
}

export interface RealtimeAlert {
  id: string;
  type: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  source: string;
  destination: string;
  description: string;
  timestamp: string;
  status: 'New' | 'Investigating' | 'Resolved' | 'Escalated';
}

export interface EndpointStatus {
  id: string;
  name: string;
  ip: string;
  os: string;
  status: 'Online' | 'Offline' | 'Warning';
  lastActivity: string;
  riskScore: number;
  alerts: number;
}

export interface SocActivity {
  id: string;
  analyst: string;
  action: string;
  target: string;
  timestamp: string;
  result: string;
}

export interface DetectDashboardData {
  overview: DetectOverviewData;
  threatSeverityData: { name: string; value: number; color: string }[];
  weeklyThreatTrend: { day: string; critical: number; high: number; medium: number; low: number }[];
  detectionCategories: { category: string; count: number; change: number }[];
  realtimeAlerts: RealtimeAlert[];
  endpointStatus: EndpointStatus[];
  socActivity: SocActivity[];
  detectionRules: { rule: string; category: string; triggers: number; status: 'Active' | 'Disabled' }[];
  hourlyActivity: { hour: string; alerts: number; resolved: number }[];
}

const mockDetectData: DetectDashboardData = {
  overview: {
    totalEndpoints: 245,
    monitoredEndpoints: 238,
    threatsDetected: 127,
    alertsToday: 23,
    avgResponseTime: '< 15 min',
    coverageHours: '24/7',
  },
  threatSeverityData: [
    { name: 'Critico', value: 8, color: '#ef4444' },
    { name: 'Alto', value: 24, color: '#f97316' },
    { name: 'Medio', value: 45, color: '#eab308' },
    { name: 'Basso', value: 50, color: '#22c55e' },
  ],
  weeklyThreatTrend: [
    { day: 'Lun', critical: 2, high: 5, medium: 12, low: 8 },
    { day: 'Mar', critical: 1, high: 8, medium: 15, low: 10 },
    { day: 'Mer', critical: 3, high: 6, medium: 9, low: 7 },
    { day: 'Gio', critical: 0, high: 4, medium: 11, low: 9 },
    { day: 'Ven', critical: 2, high: 7, medium: 14, low: 6 },
    { day: 'Sab', critical: 0, high: 1, medium: 3, low: 2 },
    { day: 'Dom', critical: 0, high: 0, medium: 1, low: 1 },
  ],
  detectionCategories: [
    { category: 'Malware', count: 42, change: 12 },
    { category: 'Phishing', count: 28, change: -5 },
    { category: 'Brute Force', count: 19, change: 8 },
    { category: 'Data Exfil', count: 15, change: 3 },
    { category: 'Insider Threat', count: 8, change: -2 },
    { category: 'Zero-day', count: 3, change: 1 },
  ],
  realtimeAlerts: [
    { id: 'ALR-001', type: 'Malware Detection', severity: 'Critical', source: '10.0.0.45', destination: '192.168.1.100', description: 'Ransomware payload detected on endpoint', timestamp: '2025-01-28 09:52:00', status: 'Investigating' },
    { id: 'ALR-002', type: 'Brute Force', severity: 'High', source: '203.45.67.89', destination: '10.0.0.12', description: 'Multiple failed SSH login attempts', timestamp: '2025-01-28 09:48:00', status: 'New' },
    { id: 'ALR-003', type: 'Data Exfiltration', severity: 'High', source: '10.0.0.200', destination: '45.123.45.67', description: 'Unusual outbound data transfer detected', timestamp: '2025-01-28 09:45:00', status: 'Escalated' },
    { id: 'ALR-004', type: 'Phishing', severity: 'Medium', source: 'mail-server', destination: 'finance@company.it', description: 'Suspicious email with malicious attachment', timestamp: '2025-01-28 09:40:00', status: 'Resolved' },
    { id: 'ALR-005', type: 'Unauthorized Access', severity: 'Critical', source: '10.0.0.88', destination: '10.0.0.1', description: 'Privilege escalation attempt on domain controller', timestamp: '2025-01-28 09:35:00', status: 'Investigating' },
  ],
  endpointStatus: [
    { id: 'EP-001', name: 'WS-ADMIN-01', ip: '192.168.1.10', os: 'Windows 11', status: 'Online', lastActivity: '2 min ago', riskScore: 12, alerts: 0 },
    { id: 'EP-002', name: 'SRV-DC-01', ip: '10.0.0.1', os: 'Windows Server 2022', status: 'Online', lastActivity: '1 min ago', riskScore: 45, alerts: 2 },
    { id: 'EP-003', name: 'NB-SALES-05', ip: '192.168.1.55', os: 'Windows 11', status: 'Warning', lastActivity: '5 min ago', riskScore: 78, alerts: 5 },
    { id: 'EP-004', name: 'SRV-FILE-01', ip: '10.0.0.20', os: 'Windows Server 2019', status: 'Warning', lastActivity: '3 min ago', riskScore: 65, alerts: 3 },
    { id: 'EP-005', name: 'NB-HR-02', ip: '192.168.1.80', os: 'Windows 10', status: 'Offline', lastActivity: '12h ago', riskScore: 90, alerts: 1 },
  ],
  socActivity: [
    { id: 'SOC-001', analyst: 'Marco R.', action: 'Investigated', target: 'ALR-001', timestamp: '2025-01-28 09:50:00', result: 'Escalated to Tier 2' },
    { id: 'SOC-002', analyst: 'Laura S.', action: 'Resolved', target: 'ALR-004', timestamp: '2025-01-28 09:42:00', result: 'Email quarantined' },
    { id: 'SOC-003', analyst: 'Marco R.', action: 'Blocked', target: '10.0.0.88', timestamp: '2025-01-28 09:38:00', result: 'Endpoint isolated' },
    { id: 'SOC-004', analyst: 'Andrea B.', action: 'Scanned', target: 'NB-SALES-05', timestamp: '2025-01-28 09:30:00', result: '2 threats found' },
  ],
  detectionRules: [
    { rule: 'Ransomware Detection', category: 'Malware', triggers: 342, status: 'Active' },
    { rule: 'Brute Force Alert', category: 'Auth', triggers: 1289, status: 'Active' },
    { rule: 'Data Exfil Monitor', category: 'DLP', triggers: 456, status: 'Active' },
    { rule: 'Phishing URL Block', category: 'Email', triggers: 892, status: 'Active' },
    { rule: 'Legacy Rule (deprecated)', category: 'Network', triggers: 0, status: 'Disabled' },
  ],
  hourlyActivity: [
    { hour: '00:00', alerts: 2, resolved: 2 },
    { hour: '04:00', alerts: 1, resolved: 1 },
    { hour: '08:00', alerts: 8, resolved: 5 },
    { hour: '09:00', alerts: 12, resolved: 7 },
    { hour: '10:00', alerts: 5, resolved: 4 },
    { hour: '12:00', alerts: 3, resolved: 3 },
    { hour: '14:00', alerts: 7, resolved: 5 },
    { hour: '16:00', alerts: 4, resolved: 4 },
    { hour: '18:00', alerts: 2, resolved: 2 },
    { hour: '20:00', alerts: 1, resolved: 1 },
    { hour: '23:00', alerts: 0, resolved: 0 },
  ],
};

export function useDetectDashboard(tenantId?: string) {
  return useApiWithFallback<DetectDashboardData>(
    () => detectApi.dashboard(tenantId) as Promise<DetectDashboardData>,
    mockDetectData,
    [tenantId],
  );
}
