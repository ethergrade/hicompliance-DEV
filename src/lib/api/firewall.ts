import { complianceApiClient } from '@/lib/api-client';
import type { ApiResponse } from '@/types/api';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface FirewallStats {
  /** Null quando la fonte non li espone (regole e connessioni richiedono l'accesso diretto al firewall). */
  activeRules: number | null;
  blockedConnections: number | null;
  threatsBlocked: number;
  activeConnections: number | null;
  firewalls?: number;
  connected?: number;
  disconnected?: number;
  suspended?: number;
  upgradesAvailable?: number | null;
  majorUpgrades?: number | null;
  openAlerts?: number;
  vpnTunnelsDown?: number;
}

export interface FirewallDevice {
  id: string;
  name: string;
  hostname: string | null;
  serialNumber: string | null;
  model: string | null;
  firmware: string | null;
  connected: boolean;
  suspended: boolean;
  state: 'Connesso' | 'Sospeso' | 'Non connesso';
  cluster: { mode: string; role: string | null } | null;
  externalIps: string[];
  stateChangedAt: string | null;
  /** Null se il controllo degli aggiornamenti non è riuscito. */
  upgradeTo: string[] | null;
  majorUpgrade: boolean;
  openAlerts: number;
}

export interface FirewallAlert {
  id: string;
  device: string | null;
  type: string;
  description: string | null;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  timestamp: string | null;
  lastSeenAt: string | null;
  eventCount: number;
  category?: string | null;
}

export interface BlockedThreat {
  id: string;
  source: string | null;
  destination: string | null;
  device?: string | null;
  description?: string | null;
  eventCount?: number;
  lastSeenAt?: string | null;
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
  devices?: FirewallDevice[];
  blockedThreats: BlockedThreat[];
  alerts?: FirewallAlert[];
  firewallRules: FirewallRule[];
  connectionLogs: ConnectionLog[];
  /** Sezioni che la fonte non fornisce: la UI le nasconde. */
  unavailable?: string[];
  fetchedAt?: string | null;
  stale?: boolean;
  lastError?: { code: string; message: string; at: string | null } | null;
}

// ─── API Client ─────────────────────────────────────────────────────────────

export const firewallApi = {
  /** Ultimo dato letto per il cliente; nessuna chiamata diretta alla sorgente. */
  dashboard: async (organizationId: string, groupId?: string | null): Promise<FirewallDashboardData> => {
    const res = await complianceApiClient.get<ApiResponse<FirewallDashboardData>>(
      `/companies/${organizationId}/sophos/firewall/dashboard`,
      undefined,
      groupId ? { headers: { 'X-Group-Id': groupId } } : undefined,
    );
    return res.data;
  },
};
