import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Info, Shield, ShieldAlert, ShieldCheck, ShieldX, Activity, AlertTriangle } from 'lucide-react';
import { RiskScoreCard } from './RiskScoreCard';
import { DemoDataBadge } from './DemoDataBadge';
import { useFirewallDashboard } from '@/hooks/useFirewall';
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
  const { data, loading, isMock } = useFirewallDashboard();
  const { stats: firewallStats, blockedThreats, firewallRules, connectionLogs } = data;

  return (
    <div className="space-y-8">
      {/* Overview Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold">Firewall Overview</h2>
          <DemoDataBadge show={isMock} />
        </div>
        
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
