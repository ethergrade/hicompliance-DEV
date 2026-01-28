import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Info, 
  Mail, 
  MailWarning, 
  MailX, 
  MailCheck,
  ShieldAlert,
  AlertTriangle,
  FileWarning,
  Inbox,
  Send,
  Ban
} from 'lucide-react';
import { RiskScoreCard } from './RiskScoreCard';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

// Mock data for email security
const emailStats = {
  totalProcessed: 45892,
  delivered: 42156,
  spamBlocked: 2847,
  phishingBlocked: 156,
  malwareBlocked: 48,
  quarantined: 685,
};

const recentThreats = [
  { id: 'EM-001', from: 'support@paypa1-security.com', to: 'finance@company.it', subject: 'Urgent: Verify your account', type: 'Phishing' as const, detectedAt: '2025-01-28 09:45:00', status: 'Blocked' as const, severity: 'Critical' as const },
  { id: 'EM-002', from: 'invoice@supplier-fake.com', to: 'accounting@company.it', subject: 'Invoice #INV-2025-001.exe', type: 'Malware' as const, detectedAt: '2025-01-28 09:30:00', status: 'Quarantined' as const, severity: 'Critical' as const },
  { id: 'EM-003', from: 'noreply@amazn-deals.net', to: 'sales@company.it', subject: 'You won a $1000 gift card!', type: 'Spam' as const, detectedAt: '2025-01-28 09:15:00', status: 'Blocked' as const, severity: 'Low' as const },
  { id: 'EM-004', from: 'ceo@company-spoofed.com', to: 'hr@company.it', subject: 'Wire transfer needed urgently', type: 'BEC' as const, detectedAt: '2025-01-28 08:55:00', status: 'Blocked' as const, severity: 'Critical' as const },
  { id: 'EM-005', from: 'marketing@bulk-sender.com', to: 'info@company.it', subject: 'Special offer just for you!', type: 'Spam' as const, detectedAt: '2025-01-28 08:40:00', status: 'Blocked' as const, severity: 'Low' as const },
  { id: 'EM-006', from: 'admin@m1crosoft-support.com', to: 'it@company.it', subject: 'Password expiring - action required', type: 'Phishing' as const, detectedAt: '2025-01-28 08:25:00', status: 'Blocked' as const, severity: 'High' as const },
  { id: 'EM-007', from: 'unknown@suspicious.ru', to: 'ceo@company.it', subject: 'Document.pdf.exe', type: 'Malware' as const, detectedAt: '2025-01-28 08:10:00', status: 'Quarantined' as const, severity: 'Critical' as const },
  { id: 'EM-008', from: 'newsletter@legit-but-spam.com', to: 'all@company.it', subject: 'Weekly digest you never subscribed to', type: 'Spam' as const, detectedAt: '2025-01-28 07:55:00', status: 'Blocked' as const, severity: 'Low' as const },
];

const quarantinedEmails = [
  { id: 'QE-001', from: 'invoice@supplier-fake.com', to: 'accounting@company.it', subject: 'Invoice #INV-2025-001.exe', reason: 'Malware attachment', quarantinedAt: '2025-01-28 09:30:00', expiresIn: '13 giorni', actions: ['Release', 'Delete'] },
  { id: 'QE-002', from: 'unknown@suspicious.ru', to: 'ceo@company.it', subject: 'Document.pdf.exe', reason: 'Suspicious executable', quarantinedAt: '2025-01-28 08:10:00', expiresIn: '13 giorni', actions: ['Release', 'Delete'] },
  { id: 'QE-003', from: 'external@partner.com', to: 'sales@company.it', subject: 'Contract draft v2', reason: 'Password-protected archive', quarantinedAt: '2025-01-28 07:30:00', expiresIn: '13 giorni', actions: ['Release', 'Delete'] },
  { id: 'QE-004', from: 'recruiting@agency.com', to: 'hr@company.it', subject: 'CV - Mario Rossi.docm', reason: 'Macro-enabled document', quarantinedAt: '2025-01-27 16:45:00', expiresIn: '12 giorni', actions: ['Release', 'Delete'] },
];

const topSenders = [
  { domain: 'gmail.com', emails: 8542, blocked: 12, blockRate: 0.14 },
  { domain: 'outlook.com', emails: 6234, blocked: 8, blockRate: 0.13 },
  { domain: 'company-partner.it', emails: 4521, blocked: 0, blockRate: 0 },
  { domain: 'supplier.com', emails: 3892, blocked: 2, blockRate: 0.05 },
  { domain: 'newsletter.marketing.com', emails: 2156, blocked: 1845, blockRate: 85.6 },
];

const policyViolations = [
  { policy: 'DLP - Credit Card Numbers', violations: 12, lastViolation: '2025-01-28 09:12:00', action: 'Blocked' as const },
  { policy: 'DLP - SSN/Codice Fiscale', violations: 5, lastViolation: '2025-01-27 14:30:00', action: 'Warned' as const },
  { policy: 'Attachment Size > 25MB', violations: 28, lastViolation: '2025-01-28 08:45:00', action: 'Blocked' as const },
  { policy: 'External Recipients > 50', violations: 3, lastViolation: '2025-01-26 11:20:00', action: 'Warned' as const },
  { policy: 'Executable Attachments', violations: 156, lastViolation: '2025-01-28 09:30:00', action: 'Blocked' as const },
];

const typeColors = {
  Phishing: 'bg-red-500/20 text-red-500',
  Malware: 'bg-red-700/20 text-red-700',
  Spam: 'bg-yellow-500/20 text-yellow-500',
  BEC: 'bg-orange-500/20 text-orange-500',
};

const statusColors = {
  Blocked: 'bg-red-500/20 text-red-500',
  Quarantined: 'bg-yellow-500/20 text-yellow-500',
  Delivered: 'bg-green-500/20 text-green-500',
  Warned: 'bg-orange-500/20 text-orange-500',
};

const severityColors = {
  Low: 'bg-green-500/20 text-green-500',
  Medium: 'bg-yellow-500/20 text-yellow-500',
  High: 'bg-orange-500/20 text-orange-500',
  Critical: 'bg-red-500/20 text-red-500',
};

export const HiMailDashboard: React.FC = () => {
  return (
    <div className="space-y-8">
      {/* Overview Section */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Email Security Overview</h2>
        
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card className="border-border">
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-col items-center text-center">
                <Mail className="w-6 h-6 text-primary mb-2" />
                <p className="text-2xl font-bold">{emailStats.totalProcessed.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Email Processate</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-col items-center text-center">
                <MailCheck className="w-6 h-6 text-green-500 mb-2" />
                <p className="text-2xl font-bold text-green-500">{emailStats.delivered.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Consegnate</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-col items-center text-center">
                <MailWarning className="w-6 h-6 text-yellow-500 mb-2" />
                <p className="text-2xl font-bold text-yellow-500">{emailStats.spamBlocked.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Spam Bloccato</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-col items-center text-center">
                <ShieldAlert className="w-6 h-6 text-red-500 mb-2" />
                <p className="text-2xl font-bold text-red-500">{emailStats.phishingBlocked}</p>
                <p className="text-xs text-muted-foreground">Phishing Bloccato</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-col items-center text-center">
                <FileWarning className="w-6 h-6 text-red-700 mb-2" />
                <p className="text-2xl font-bold text-red-700">{emailStats.malwareBlocked}</p>
                <p className="text-xs text-muted-foreground">Malware Bloccato</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-col items-center text-center">
                <Ban className="w-6 h-6 text-orange-500 mb-2" />
                <p className="text-2xl font-bold text-orange-500">{emailStats.quarantined}</p>
                <p className="text-xs text-muted-foreground">In Quarantena</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <RiskScoreCard 
            title="Email Security Score"
            level="Eccellente"
            levelColor="green"
            score={94}
            ringColor="#10b981"
          />
          <RiskScoreCard 
            title="Threat Detection Rate"
            level="Alto"
            levelColor="green"
            score={99}
            ringColor="#10b981"
          />
        </div>
      </section>

      {/* Recent Threats Section */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Minacce Email Recenti</h2>
        
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              Ultime minacce rilevate
            </CardTitle>
            <p className="text-sm text-muted-foreground">Email malevole bloccate o in quarantena</p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Da</TableHead>
                  <TableHead>A</TableHead>
                  <TableHead>Oggetto</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentThreats.map((threat, index) => (
                  <TableRow key={index}>
                    <TableCell className="text-sm max-w-[150px] truncate">
                      <Tooltip>
                        <TooltipTrigger className="truncate block">
                          {threat.from}
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{threat.from}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className="text-sm">{threat.to}</TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      <Tooltip>
                        <TooltipTrigger className="truncate block">
                          {threat.subject}
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{threat.subject}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("font-medium", typeColors[threat.type])}>
                        {threat.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{threat.detectedAt}</TableCell>
                    <TableCell>
                      <Badge className={cn("font-medium", severityColors[threat.severity])}>
                        {threat.severity}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("font-medium", statusColors[threat.status])}>
                        {threat.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      {/* Quarantine Section */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Email in Quarantena</h2>
        
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Ban className="w-5 h-5 text-orange-500" />
              Email sospese in attesa di revisione
            </CardTitle>
            <p className="text-sm text-muted-foreground">Email bloccate che richiedono azione manuale</p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Da</TableHead>
                  <TableHead>A</TableHead>
                  <TableHead>Oggetto</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Data Quarantena</TableHead>
                  <TableHead>Scadenza</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quarantinedEmails.map((email, index) => (
                  <TableRow key={index}>
                    <TableCell className="text-sm max-w-[150px] truncate">{email.from}</TableCell>
                    <TableCell className="text-sm">{email.to}</TableCell>
                    <TableCell className="max-w-[180px] truncate">{email.subject}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {email.reason}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{email.quarantinedAt}</TableCell>
                    <TableCell className="text-sm text-yellow-500">{email.expiresIn}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      {/* Policy Violations Section */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Violazioni Policy</h2>
        
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MailX className="w-5 h-5 text-red-500" />
              Policy DLP e sicurezza
            </CardTitle>
            <p className="text-sm text-muted-foreground">Violazioni delle policy email aziendali</p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Policy</TableHead>
                  <TableHead>Violazioni</TableHead>
                  <TableHead>Ultima Violazione</TableHead>
                  <TableHead>Azione</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {policyViolations.map((violation, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{violation.policy}</TableCell>
                    <TableCell>
                      <span className={cn(
                        "font-semibold",
                        violation.violations > 50 ? 'text-red-500' :
                        violation.violations > 10 ? 'text-yellow-500' : 'text-muted-foreground'
                      )}>
                        {violation.violations}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{violation.lastViolation}</TableCell>
                    <TableCell>
                      <Badge className={cn("font-medium", statusColors[violation.action])}>
                        {violation.action}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      {/* Top Senders Section */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Top Domini Mittenti</h2>
        
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Inbox className="w-5 h-5 text-primary" />
              Domini con più email ricevute
            </CardTitle>
            <p className="text-sm text-muted-foreground">Statistiche per dominio mittente</p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dominio</TableHead>
                  <TableHead>Email Ricevute</TableHead>
                  <TableHead>Bloccate</TableHead>
                  <TableHead>Tasso Blocco</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topSenders.map((sender, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-mono">{sender.domain}</TableCell>
                    <TableCell>{sender.emails.toLocaleString()}</TableCell>
                    <TableCell>
                      <span className={sender.blocked > 100 ? 'text-red-500 font-semibold' : ''}>
                        {sender.blocked}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={cn(
                        sender.blockRate > 50 ? 'text-red-500 font-semibold' :
                        sender.blockRate > 5 ? 'text-yellow-500' : 'text-green-500'
                      )}>
                        {sender.blockRate}%
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>
    </div>
  );
};
