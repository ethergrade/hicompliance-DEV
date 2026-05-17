import { apiClient } from './index';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface LogStats {
  totalLogs: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  lastHour: number;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  source: string;
  level: 'Info' | 'Warning' | 'Error' | 'Critical';
  message: string;
  category: string;
  details?: string;
}

export interface LogDashboardData {
  stats: LogStats;
  recentLogs: LogEntry[];
  topSources: { source: string; count: number }[];
  errorTrend: { date: string; count: number }[];
}

// ─── API Client ─────────────────────────────────────────────────────────────

export const logsApi = {
  /** GET /logs/dashboard — aggregated log data */
  dashboard: (tenantId?: string) =>
    apiClient.get<LogDashboardData>(`/logs/dashboard${tenantId ? `?tenant_id=${tenantId}` : ''}`),

  /** GET /logs — list log entries */
  list: (params?: { tenantId?: string; level?: string; source?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.tenantId) qs.set('tenant_id', params.tenantId);
    if (params?.level) qs.set('level', params.level);
    if (params?.source) qs.set('source', params.source);
    if (params?.limit) qs.set('limit', String(params.limit));
    const query = qs.toString();
    return apiClient.get<LogEntry[]>(`/logs${query ? `?${query}` : ''}`);
  },
};
