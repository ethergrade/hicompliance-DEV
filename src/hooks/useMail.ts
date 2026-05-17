import { useApiWithFallback } from './useApiWithFallback';
import { mailApi } from '@/lib/api/mail';

export interface EmailStats {
  totalProcessed: number;
  delivered: number;
  spamBlocked: number;
  phishingBlocked: number;
  malwareBlocked: number;
  quarantined: number;
}

export interface EmailThreat {
  id: string;
  from: string;
  to: string;
  subject: string;
  type: 'Phishing' | 'Malware' | 'Spam' | 'BEC';
  detectedAt: string;
  status: 'Blocked' | 'Quarantined' | 'Delivered';
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
}

export interface QuarantinedEmail {
  id: string;
  from: string;
  to: string;
  subject: string;
  reason: string;
  quarantinedAt: string;
  expiresIn: string;
  actions: string[];
}

export interface TopSender {
  domain: string;
  emails: number;
  blocked: number;
  blockRate: number;
}

export interface PolicyViolation {
  policy: string;
  violations: number;
  lastViolation: string;
  action: 'Blocked' | 'Warned';
}

export interface MailDashboardData {
  stats: EmailStats;
  recentThreats: EmailThreat[];
  quarantinedEmails: QuarantinedEmail[];
  topSenders: TopSender[];
  policyViolations: PolicyViolation[];
}

const mockMailData: MailDashboardData = {
  stats: {
    totalProcessed: 45892,
    delivered: 42156,
    spamBlocked: 2847,
    phishingBlocked: 156,
    malwareBlocked: 48,
    quarantined: 685,
  },
  recentThreats: [
    { id: 'EM-001', from: 'support@paypa1-security.com', to: 'finance@company.it', subject: 'Urgent: Verify your account', type: 'Phishing', detectedAt: '2025-01-28 09:45:00', status: 'Blocked', severity: 'Critical' },
    { id: 'EM-002', from: 'invoice@supplier-fake.com', to: 'accounting@company.it', subject: 'Invoice #INV-2025-001.exe', type: 'Malware', detectedAt: '2025-01-28 09:30:00', status: 'Quarantined', severity: 'Critical' },
    { id: 'EM-003', from: 'noreply@amazn-deals.net', to: 'sales@company.it', subject: 'You won a $1000 gift card!', type: 'Spam', detectedAt: '2025-01-28 09:15:00', status: 'Blocked', severity: 'Low' },
    { id: 'EM-004', from: 'ceo@company-spoofed.com', to: 'hr@company.it', subject: 'Wire transfer needed urgently', type: 'BEC', detectedAt: '2025-01-28 08:55:00', status: 'Blocked', severity: 'Critical' },
    { id: 'EM-005', from: 'marketing@bulk-sender.com', to: 'info@company.it', subject: 'Special offer just for you!', type: 'Spam', detectedAt: '2025-01-28 08:40:00', status: 'Blocked', severity: 'Low' },
    { id: 'EM-006', from: 'admin@m1crosoft-support.com', to: 'it@company.it', subject: 'Password expiring - action required', type: 'Phishing', detectedAt: '2025-01-28 08:25:00', status: 'Blocked', severity: 'High' },
    { id: 'EM-007', from: 'unknown@suspicious.ru', to: 'ceo@company.it', subject: 'Document.pdf.exe', type: 'Malware', detectedAt: '2025-01-28 08:10:00', status: 'Quarantined', severity: 'Critical' },
    { id: 'EM-008', from: 'newsletter@legit-but-spam.com', to: 'all@company.it', subject: 'Weekly digest you never subscribed to', type: 'Spam', detectedAt: '2025-01-28 07:55:00', status: 'Blocked', severity: 'Low' },
  ],
  quarantinedEmails: [
    { id: 'QE-001', from: 'invoice@supplier-fake.com', to: 'accounting@company.it', subject: 'Invoice #INV-2025-001.exe', reason: 'Malware attachment', quarantinedAt: '2025-01-28 09:30:00', expiresIn: '13 giorni', actions: ['Release', 'Delete'] },
    { id: 'QE-002', from: 'unknown@suspicious.ru', to: 'ceo@company.it', subject: 'Document.pdf.exe', reason: 'Suspicious executable', quarantinedAt: '2025-01-28 08:10:00', expiresIn: '13 giorni', actions: ['Release', 'Delete'] },
    { id: 'QE-003', from: 'external@partner.com', to: 'sales@company.it', subject: 'Contract draft v2', reason: 'Password-protected archive', quarantinedAt: '2025-01-28 07:30:00', expiresIn: '13 giorni', actions: ['Release', 'Delete'] },
    { id: 'QE-004', from: 'recruiting@agency.com', to: 'hr@company.it', subject: 'CV - Mario Rossi.docm', reason: 'Macro-enabled document', quarantinedAt: '2025-01-27 16:45:00', expiresIn: '12 giorni', actions: ['Release', 'Delete'] },
  ],
  topSenders: [
    { domain: 'gmail.com', emails: 8542, blocked: 12, blockRate: 0.14 },
    { domain: 'outlook.com', emails: 6234, blocked: 8, blockRate: 0.13 },
    { domain: 'company-partner.it', emails: 4521, blocked: 0, blockRate: 0 },
    { domain: 'supplier.com', emails: 3892, blocked: 2, blockRate: 0.05 },
    { domain: 'newsletter.marketing.com', emails: 2156, blocked: 1845, blockRate: 85.6 },
  ],
  policyViolations: [
    { policy: 'DLP - Credit Card Numbers', violations: 12, lastViolation: '2025-01-28 09:12:00', action: 'Blocked' },
    { policy: 'DLP - SSN/Codice Fiscale', violations: 5, lastViolation: '2025-01-27 14:30:00', action: 'Warned' },
    { policy: 'Attachment Size > 25MB', violations: 28, lastViolation: '2025-01-28 08:45:00', action: 'Blocked' },
    { policy: 'External Recipients > 50', violations: 3, lastViolation: '2025-01-26 11:20:00', action: 'Warned' },
    { policy: 'Executable Attachments', violations: 156, lastViolation: '2025-01-28 09:30:00', action: 'Blocked' },
  ],
};

export function useMailDashboard(tenantId?: string) {
  return useApiWithFallback<MailDashboardData>(
    () => mailApi.dashboard(tenantId) as Promise<MailDashboardData>,
    mockMailData,
    [tenantId],
  );
}
