import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Link2 } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  windowsLogsTableData, entraIdTableData, securityEventsTableData, firewallLogsTableData,
  severityColors,
} from './mockData';

interface CorrelatedEvent {
  datetime: string;
  source: string;
  event: string;
  hostname: string;
  username: string;
  sourceIp: string;
  severity?: string;
}

export const CorrelationSection: React.FC = () => {
  const [correlationQuery, setCorrelationQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');

  const correlatedEvents = useMemo(() => {
    if (!activeQuery) return [];
    const q = activeQuery.toLowerCase();
    const results: CorrelatedEvent[] = [];

    windowsLogsTableData.forEach(log => {
      if (log.username.toLowerCase().includes(q) || log.sourceIp.toLowerCase().includes(q) || log.hostname.toLowerCase().includes(q)) {
        results.push({ datetime: log.datetime, source: 'Windows', event: log.action, hostname: log.hostname, username: log.username, sourceIp: log.sourceIp });
      }
    });

    entraIdTableData.forEach(log => {
      if (log.username.toLowerCase().includes(q) || log.sourceIp.toLowerCase().includes(q)) {
        results.push({ datetime: log.datetime, source: 'Entra ID', event: `${log.application} - ${log.status}`, hostname: '-', username: log.username, sourceIp: log.sourceIp });
      }
    });

    securityEventsTableData.forEach(log => {
      if (log.username.toLowerCase().includes(q) || log.sourceIp.toLowerCase().includes(q) || log.hostname.toLowerCase().includes(q)) {
        results.push({ datetime: log.datetime, source: 'Security', event: log.event, hostname: log.hostname, username: log.username, sourceIp: log.sourceIp, severity: log.severity });
      }
    });

    firewallLogsTableData.forEach(log => {
      if (log.username.toLowerCase().includes(q) || log.sourceIp.toLowerCase().includes(q) || log.hostname.toLowerCase().includes(q)) {
        results.push({ datetime: log.datetime, source: 'Firewall', event: `${log.actionType} - ${log.action}`, hostname: log.hostname, username: log.username, sourceIp: log.sourceIp, severity: log.severity });
      }
    });

    results.sort((a, b) => b.datetime.localeCompare(a.datetime));
    return results;
  }, [activeQuery]);

  const handleSearch = () => {
    setActiveQuery(correlationQuery.trim());
  };

  const sourceColors: Record<string, string> = {
    'Windows': 'bg-blue-500/20 text-blue-500',
    'Entra ID': 'bg-purple-500/20 text-purple-500',
    'Security': 'bg-orange-500/20 text-orange-500',
    'Firewall': 'bg-cyan-500/20 text-cyan-500',
  };

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-bold">Correlazioni Cross-Source</h2>
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Link2 className="w-5 h-5 text-primary" />
            Correlazione eventi per IP / Username / Hostname
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-4">
            <Input
              placeholder="Inserisci IP, username o hostname (es. 203.0.113.45, user003, SRV-DC01)"
              value={correlationQuery}
              onChange={(e) => setCorrelationQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1"
            />
            <Button onClick={handleSearch}>
              <Search className="w-4 h-4 mr-1" />
              Correla
            </Button>
          </div>

          {activeQuery && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Risultati per: <strong className="text-foreground">{activeQuery}</strong></span>
                <Badge variant="outline">{correlatedEvents.length} eventi trovati</Badge>
                <div className="flex gap-1 ml-auto">
                  {Object.entries(sourceColors).map(([src, cls]) => {
                    const count = correlatedEvents.filter(e => e.source === src).length;
                    return count > 0 ? (
                      <Badge key={src} className={cn("text-xs", cls)}>{src}: {count}</Badge>
                    ) : null;
                  })}
                </div>
              </div>

              {correlatedEvents.length > 0 ? (
                <>
                  {/* Timeline */}
                  <div className="relative border-l-2 border-border pl-4 space-y-3 max-h-64 overflow-y-auto">
                    {correlatedEvents.slice(0, 20).map((event, i) => (
                      <div key={i} className="relative">
                        <div className="absolute -left-[21px] w-3 h-3 rounded-full bg-primary border-2 border-background" />
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground font-mono text-xs w-36 shrink-0">{event.datetime}</span>
                          <Badge className={cn("text-xs shrink-0", sourceColors[event.source])}>{event.source}</Badge>
                          {event.severity && (
                            <Badge className={cn("text-xs shrink-0", severityColors[event.severity])}>{event.severity}</Badge>
                          )}
                          <span className="truncate">{event.event}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Table */}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>DATETIME</TableHead>
                        <TableHead>SOURCE</TableHead>
                        <TableHead>SEVERITY</TableHead>
                        <TableHead>EVENT</TableHead>
                        <TableHead>HOSTNAME</TableHead>
                        <TableHead>USERNAME</TableHead>
                        <TableHead>IP</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {correlatedEvents.map((event, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-sm text-muted-foreground font-mono">{event.datetime}</TableCell>
                          <TableCell>
                            <Badge className={cn("text-xs", sourceColors[event.source])}>{event.source}</Badge>
                          </TableCell>
                          <TableCell>
                            {event.severity ? (
                              <Badge className={cn("text-xs", severityColors[event.severity])}>{event.severity}</Badge>
                            ) : '-'}
                          </TableCell>
                          <TableCell className="text-sm max-w-xs truncate">{event.event}</TableCell>
                          <TableCell className="text-sm">{event.hostname}</TableCell>
                          <TableCell className="text-sm">{event.username}</TableCell>
                          <TableCell className="text-sm font-mono">{event.sourceIp}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">Nessun evento trovato per "{activeQuery}"</p>
              )}
            </div>
          )}

          {!activeQuery && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              Inserisci un IP, username o hostname per visualizzare tutti gli eventi correlati tra Windows, Entra ID, Firewall e Security Events.
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
};
