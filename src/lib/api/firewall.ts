import { apiClient } from './index';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface FirewallStats {
  activeRules: number;
  blockedConnections: number;
  threatsBlocked: number;
  activeConnections: number;
}

export interface BlockedThreat {
  id: string;
  source: string;
  destination: string;
  type: string;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  timestamp: string;
  action: 'Blocked' | 'Allowed' | 'Quarantined';
}

export interface FirewallRule {
  id: string;
  name: string;
  source: string;
  destination: string;
  port: string;
  protocol: 'TCP' | 'UDP' | 'ICMP' | 'Any';
  action: 'Allow' | 'Deny' | 'Drop';
  status: 'Active' | 'Inactive';
  hits: number;
}

export interface ConnectionLog {
  timestamp: string;
  source: string;
  destination: string;
  port: string;
  protocol: string;
  status: 'Allowed' | 'Blocked';
  bytes: string;
}

export interface FirewallDashboardData {
  stats: FirewallStats;
  blockedThreats: BlockedThreat[];
  firewallRules: FirewallRule[];
  connectionLogs: ConnectionLog[];
}

// ─── API Client ─────────────────────────────────────────────────────────────

export const firewallApi = {
  /** GET /firewall/dashboard — aggregated firewall data */
  dashboard: (tenantId?: string) =>
    apiClient.get<FirewallDashboardData>(`/firewall/dashboard${tenantId ? `?tenant_id=${tenantId}` : ''}`),

  /** GET /firewall/rules — firewall rules list */
  rules: (tenantId?: string) =>
    apiClient.get<FirewallRule[]>(`/firewall/rules${tenantId ? `?tenant_id=${tenantId}` : ''}`),

  /** GET /firewall/threats — blocked threats */
  threats: (tenantId?: string) =>
    apiClient.get<BlockedThreat[]>(`/firewall/threats${tenantId ? `?tenant_id=${tenantId}` : ''}`),

  /** GET /firewall/connections — connection logs */
  connections: (tenantId?: string) =>
    apiClient.get<ConnectionLog[]>(`/firewall/connections${tenantId ? `?tenant_id=${tenantId}` : ''}`),

  /** POST /firewall/rules — create a new rule */
  createRule: (rule: Omit<FirewallRule, 'id' | 'hits'>) =>
    apiClient.post('/firewall/rules', rule),

  /** PUT /firewall/rules/{id} — update a rule */
  updateRule: (ruleId: string, rule: Partial<FirewallRule>) =>
    apiClient.put(`/firewall/rules/${ruleId}`, rule),

  /** DELETE /firewall/rules/{id} — delete a rule */
  deleteRule: (ruleId: string) =>
    apiClient.delete(`/firewall/rules/${ruleId}`),
};
