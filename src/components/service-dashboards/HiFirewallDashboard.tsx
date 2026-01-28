import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Info, Shield, ShieldAlert, ShieldCheck, ShieldX, Activity, AlertTriangle } from 'lucide-react';
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

// Mock data for firewall
const firewallStats = {
  activeRules: 247,
  blockedConnections: 1842,
  threatsBlocked: 156,
  activeConnections: 892,
};

const blockedThreats = [
  { id: 'THR-2025-001', source: '192.168.1.105', destination: '10.0.0.50', type: 'Port Scan', severity: 'High' as const, timestamp: '2025-01-28 09:45:23', action: 'Blocked' },
  { id: 'THR-2025-002', source: '203.45.67.89', destination: '10.0.0.12', type: 'Brute Force', severity: 'Critical' as const, timestamp: '2025-01-28 09:32:11', action: 'Blocked' },
  { id: 'THR-2025-003', source: '45.123.45.67', destination: '10.0.0.100', type: 'DDoS Attempt', severity: 'Critical' as const, timestamp: '2025-01-28 09:15:44', action: 'Blocked' },
  { id: 'THR-2025-004', source: '192.168.2.50', destination: '10.0.0.25', type: 'Malware C2', severity: 'High' as const, timestamp: '2025-01-28 08:58:02', action: 'Blocked' },
  { id: 'THR-2025-005', source: '78.90.12.34', destination: '10.0.0.80', type: 'SQL Injection', severity: 'Medium' as const, timestamp: '2025-01-28 08:45:18', action: 'Blocked' },
  { id: 'THR-2025-006', source: '156.78.90.12', destination: '10.0.0.15', type: 'XSS Attack', severity: 'Medium' as const, timestamp: '2025-01-28 08:30:55', action: 'Blocked' },
  { id: 'THR-2025-007', source: '34.56.78.90', destination: '10.0.0.200', type: 'Ransomware', severity: 'Critical' as const, timestamp: '2025-01-28 08:12:33', action: 'Blocked' },
  { id: 'THR-2025-008', source: '192.168.3.100', destination: '10.0.0.45', type: 'Data Exfiltration', severity: 'High' as const, timestamp: '2025-01-28 07:55:41', action: 'Blocked' },
];

const firewallRules = [
  { id: 'FW-001', name: 'Block External SSH', source: 'Any', destination: '10.0.0.0/24', port: '22', protocol: 'TCP', action: 'Deny', status: 'Active' as const, hits: 4521 },
  { id: 'FW-002', name: 'Allow HTTPS Outbound', source: '10.0.0.0/24', destination: 'Any', port: '443', protocol: 'TCP', action: 'Allow', status: 'Active' as const, hits: 128450 },
  { id: 'FW-003', name: 'Block Telnet', source: 'Any', destination: 'Any', port: '23', protocol: 'TCP', action: 'Deny', status: 'Active' as const, hits: 892 },
  { id: 'FW-004', name: 'Allow DNS', source: '10.0.0.0/24', destination: '8.8.8.8', port: '53', protocol: 'UDP', action: 'Allow', status: 'Active' as const, hits: 56780 },
  { id: 'FW-005', name: 'Block FTP', source: 'Any', destination: '10.0.0.0/24', port: '21', protocol: 'TCP', action: 'Deny', status: 'Active' as const, hits: 1234 },
  { id: 'FW-006', name: 'Allow VPN', source: 'Any', destination: '10.0.0.1', port: '1194', protocol: 'UDP', action: 'Allow', status: 'Active' as const, hits: 8920 },
];

const connectionLogs = [
  { timestamp: '2025-01-28 09:50:12', source: '192.168.1.50', destination: '93.184.216.34', port: '443', protocol: 'TCP', status: 'Allowed' as const, bytes: '2.4 MB' },
  { timestamp: '2025-01-28 09:49:55', source: '192.168.1.75', destination: '172.217.16.142', port: '443', protocol: 'TCP', status: 'Allowed' as const, bytes: '1.8 MB' },
  { timestamp: '2025-01-28 09:49:30', source: '203.45.67.89', destination: '10.0.0.12', port: '22', protocol: 'TCP', status: 'Blocked' as const, bytes: '0 KB' },
  { timestamp: '2025-01-28 09:49:15', source: '192.168.1.100', destination: '151.101.1.140', port: '443', protocol: 'TCP', status: 'Allowed' as const, bytes: '856 KB' },
  { timestamp: '2025-01-28 09:48:58', source: '45.123.45.67', destination: '10.0.0.100', port: '80', protocol: 'TCP', status: 'Blocked' as const, bytes: '0 KB' },
  { timestamp: '2025-01-28 09:48:42', source: '192.168.1.25', destination: '52.85.83.228', port: '443', protocol: 'TCP', status: 'Allowed' as const, bytes: '3.2 MB' },
];

const severityColors = {
  Low: 'bg-green-500/20 text-green-500',
  Medium: 'bg-yellow-500/20 text-yellow-500',
  High: 'bg-orange-500/20 text-orange-500',
  Critical: 'bg-red-500/20 text-red-500',
};

const statusColors = {
  Active: 'bg-green-500/20 text-green-500',
  Inactive: 'bg-muted text-muted-foreground',
  Allowed: 'bg-green-500/20 text-green-500',
  Blocked: 'bg-red-500/20 text-red-500',
};

export const HiFirewallDashboard: React.FC = () => {
  return (
    <div className="space-y-8">
      {/* Overview Section */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Firewall Overview</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-border">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Regole Attive</p>
                  <p className="text-3xl font-bold text-primary">{firewallStats.activeRules}</p>
                </div>
                <div className="p-3 rounded-full bg-primary/10">
                  <ShieldCheck className="w-6 h-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Connessioni Bloccate</p>
                  <p className="text-3xl font-bold text-red-500">{firewallStats.blockedConnections.toLocaleString()}</p>
                </div>
                <div className="p-3 rounded-full bg-red-500/10">
                  <ShieldX className="w-6 h-6 text-red-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Minacce Bloccate</p>
                  <p className="text-3xl font-bold text-orange-500">{firewallStats.threatsBlocked}</p>
                </div>
                <div className="p-3 rounded-full bg-orange-500/10">
                  <ShieldAlert className="w-6 h-6 text-orange-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Connessioni Attive</p>
                  <p className="text-3xl font-bold text-green-500">{firewallStats.activeConnections}</p>
                </div>
                <div className="p-3 rounded-full bg-green-500/10">
                  <Activity className="w-6 h-6 text-green-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <RiskScoreCard 
            title="Firewall Security Score"
            level="Buono"
            levelColor="green"
            score={85}
            ringColor="#10b981"
          />
          <RiskScoreCard 
            title="Threat Detection Rate"
            level="Alto"
            levelColor="orange"
            score={92}
            ringColor="#f59e0b"
          />
        </div>
      </section>

      {/* Blocked Threats Section */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Minacce Bloccate</h2>
        
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              Ultime minacce rilevate
            </CardTitle>
            <p className="text-sm text-muted-foreground">Ordinate per data e severità</p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Source IP</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Severity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {blockedThreats.map((threat, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-mono text-sm">
                      <div className="flex items-center gap-2">
                        {threat.id}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Azione: {threat.action}</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{threat.source}</TableCell>
                    <TableCell className="font-mono text-sm">{threat.destination}</TableCell>
                    <TableCell>{threat.type}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{threat.timestamp}</TableCell>
                    <TableCell>
                      <Badge className={cn("font-medium", severityColors[threat.severity])}>
                        {threat.severity}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      {/* Firewall Rules Section */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Regole Firewall</h2>
        
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              Regole attive
            </CardTitle>
            <p className="text-sm text-muted-foreground">Configurazione delle regole del firewall</p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Nome Regola</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Port</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Hits</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {firewallRules.map((rule, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-mono text-sm">{rule.id}</TableCell>
                    <TableCell className="font-medium">{rule.name}</TableCell>
                    <TableCell className="font-mono text-sm">{rule.source}</TableCell>
                    <TableCell className="font-mono text-sm">{rule.destination}</TableCell>
                    <TableCell className="font-mono text-sm">{rule.port}/{rule.protocol}</TableCell>
                    <TableCell>
                      <Badge className={cn("font-medium", rule.action === 'Allow' ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500')}>
                        {rule.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{rule.hits.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge className={cn("font-medium", statusColors[rule.status])}>
                        {rule.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      {/* Connection Logs Section */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Log Connessioni</h2>
        
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-500" />
              Ultime connessioni
            </CardTitle>
            <p className="text-sm text-muted-foreground">Log delle connessioni in tempo reale</p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Source IP</TableHead>
                  <TableHead>Destination IP</TableHead>
                  <TableHead>Port</TableHead>
                  <TableHead>Protocol</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {connectionLogs.map((log, index) => (
                  <TableRow key={index}>
                    <TableCell className="text-muted-foreground text-sm">{log.timestamp}</TableCell>
                    <TableCell className="font-mono text-sm">{log.source}</TableCell>
                    <TableCell className="font-mono text-sm">{log.destination}</TableCell>
                    <TableCell className="font-mono text-sm">{log.port}</TableCell>
                    <TableCell>{log.protocol}</TableCell>
                    <TableCell className="text-muted-foreground">{log.bytes}</TableCell>
                    <TableCell>
                      <Badge className={cn("font-medium", statusColors[log.status])}>
                        {log.status}
                      </Badge>
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
