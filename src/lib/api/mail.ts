import { apiClient } from './index';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface MailStats {
  totalEmails: number;
  blockedEmails: number;
  spamDetected: number;
  phishingDetected: number;
  malwareAttachments: number;
}

export interface MailThreat {
  id: string;
  sender: string;
  recipient: string;
  subject: string;
  threatType: 'Phishing' | 'Spam' | 'Malware' | 'Spoofing' | 'BEC';
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  timestamp: string;
  action: 'Blocked' | 'Quarantined' | 'Delivered';
}

export interface MailDashboardData {
  stats: MailStats;
  recentThreats: MailThreat[];
  topSenders: { sender: string; count: number }[];
}

// ─── API Client ─────────────────────────────────────────────────────────────

export const mailApi = {
  /** GET /mail/dashboard — aggregated mail security data */
  dashboard: (tenantId?: string) =>
    apiClient.get<MailDashboardData>(`/mail/dashboard${tenantId ? `?tenant_id=${tenantId}` : ''}`),

  /** GET /mail/threats — mail threats list */
  threats: (tenantId?: string) =>
    apiClient.get<MailThreat[]>(`/mail/threats${tenantId ? `?tenant_id=${tenantId}` : ''}`),
};
