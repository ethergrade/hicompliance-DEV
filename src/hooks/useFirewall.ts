import { useApiWithFallback } from './useApiWithFallback';
import { firewallApi, type FirewallDashboardData } from '@/lib/api/firewall';

const mockFirewallData: FirewallDashboardData = {
  stats: {
    activeRules: 247,
    blockedConnections: 1842,
    threatsBlocked: 156,
    activeConnections: 892,
  },
  blockedThreats: [
    { id: 'THR-2025-001', source: '192.168.1.105', destination: '10.0.0.50', type: 'Port Scan', severity: 'High', timestamp: '2025-01-28 09:45:23', action: 'Blocked' },
    { id: 'THR-2025-002', source: '203.45.67.89', destination: '10.0.0.12', type: 'Brute Force', severity: 'Critical', timestamp: '2025-01-28 09:32:11', action: 'Blocked' },
    { id: 'THR-2025-003', source: '45.123.45.67', destination: '10.0.0.100', type: 'DDoS Attempt', severity: 'Critical', timestamp: '2025-01-28 09:15:44', action: 'Blocked' },
    { id: 'THR-2025-004', source: '192.168.2.50', destination: '10.0.0.25', type: 'Malware C2', severity: 'High', timestamp: '2025-01-28 08:58:02', action: 'Blocked' },
    { id: 'THR-2025-005', source: '78.90.12.34', destination: '10.0.0.80', type: 'SQL Injection', severity: 'Medium', timestamp: '2025-01-28 08:45:18', action: 'Blocked' },
    { id: 'THR-2025-006', source: '156.78.90.12', destination: '10.0.0.15', type: 'XSS Attack', severity: 'Medium', timestamp: '2025-01-28 08:30:55', action: 'Blocked' },
    { id: 'THR-2025-007', source: '34.56.78.90', destination: '10.0.0.200', type: 'Ransomware', severity: 'Critical', timestamp: '2025-01-28 08:12:33', action: 'Blocked' },
    { id: 'THR-2025-008', source: '192.168.3.100', destination: '10.0.0.45', type: 'Data Exfiltration', severity: 'High', timestamp: '2025-01-28 07:55:41', action: 'Blocked' },
  ],
  firewallRules: [
    { id: 'FW-001', name: 'Block External SSH', source: 'Any', destination: '10.0.0.0/24', port: '22', protocol: 'TCP', action: 'Deny', status: 'Active', hits: 4521 },
    { id: 'FW-002', name: 'Allow HTTPS Outbound', source: '10.0.0.0/24', destination: 'Any', port: '443', protocol: 'TCP', action: 'Allow', status: 'Active', hits: 128450 },
    { id: 'FW-003', name: 'Block Telnet', source: 'Any', destination: 'Any', port: '23', protocol: 'TCP', action: 'Deny', status: 'Active', hits: 892 },
    { id: 'FW-004', name: 'Allow DNS', source: '10.0.0.0/24', destination: '8.8.8.8', port: '53', protocol: 'UDP', action: 'Allow', status: 'Active', hits: 56780 },
    { id: 'FW-005', name: 'Block FTP', source: 'Any', destination: '10.0.0.0/24', port: '21', protocol: 'TCP', action: 'Deny', status: 'Active', hits: 1234 },
    { id: 'FW-006', name: 'Allow VPN', source: 'Any', destination: '10.0.0.1', port: '1194', protocol: 'UDP', action: 'Allow', status: 'Active', hits: 8920 },
  ],
  connectionLogs: [
    { timestamp: '2025-01-28 09:50:12', source: '192.168.1.50', destination: '93.184.216.34', port: '443', protocol: 'TCP', status: 'Allowed', bytes: '2.4 MB' },
    { timestamp: '2025-01-28 09:49:55', source: '192.168.1.75', destination: '172.217.16.142', port: '443', protocol: 'TCP', status: 'Allowed', bytes: '1.8 MB' },
    { timestamp: '2025-01-28 09:49:30', source: '203.45.67.89', destination: '10.0.0.12', port: '22', protocol: 'TCP', status: 'Blocked', bytes: '0 KB' },
    { timestamp: '2025-01-28 09:49:15', source: '192.168.1.100', destination: '151.101.1.140', port: '443', protocol: 'TCP', status: 'Allowed', bytes: '856 KB' },
    { timestamp: '2025-01-28 09:48:58', source: '45.123.45.67', destination: '10.0.0.100', port: '80', protocol: 'TCP', status: 'Blocked', bytes: '0 KB' },
    { timestamp: '2025-01-28 09:48:42', source: '192.168.1.25', destination: '52.85.83.228', port: '443', protocol: 'TCP', status: 'Allowed', bytes: '3.2 MB' },
  ],
};

export function useFirewallDashboard(tenantId?: string) {
  return useApiWithFallback(
    () => firewallApi.dashboard(tenantId),
    mockFirewallData,
    [tenantId],
  );
}
