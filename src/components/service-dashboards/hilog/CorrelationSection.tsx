import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link2, SlidersHorizontal } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  windowsLogsTableData, entraIdTableData, securityEventsTableData, firewallLogsTableData,
  severityColors,
} from './mockData';
import { AdvancedFilterBuilder } from './AdvancedFilterBuilder';
import {
  AdvancedFilter, createEmptyFilter, evalAdvancedFilter,
} from './filterEngine';

interface CorrelatedEvent {
  datetime: string;
  source: string;
  event: string;
  hostname: string;
  username: string;
  sourceIp: string;
  severity?: string;
}

// Build unified event pool once
const buildEventPool = (): CorrelatedEvent[] => {
  const results: CorrelatedEvent[] = [];

  windowsLogsTableData.forEach(log => {
    results.push({ datetime: log.datetime, source: 'Windows', event: log.action, hostname: log.hostname, username: log.username, sourceIp: log.sourceIp });
  });

  entraIdTableData.forEach(log => {
    results.push({ datetime: log.datetime, source: 'Entra ID', event: `${log.application} - ${log.status}`, hostname: '-', username: log.username, sourceIp: log.sourceIp });
  });

  securityEventsTableData.forEach(log => {
    results.push({ datetime: log.datetime, source: 'Security', event: log.event, hostname: log.hostname, username: log.username, sourceIp: log.sourceIp, severity: log.severity });
  });

  firewallLogsTableData.forEach(log => {
    results.push({ datetime: log.datetime, source: 'Firewall', event: `${log.actionType} - ${log.action}`, hostname: log.hostname, username: log.username, sourceIp: log.sourceIp, severity: log.severity });
  });

  results.sort((a, b) => b.datetime.localeCompare(a.datetime));
  return results;
};

const allEvents = buildEventPool();

export const CorrelationSection: React.FC = () => {
  const [filter, setFilter] = useState<AdvancedFilter>(createEmptyFilter());
  const [showBuilder, setShowBuilder] = useState(true);

  const correlatedEvents = useMemo(() => {
    return evalAdvancedFilter(allEvents, filter);
  }, [filter]);

  const hasConditions = filter.groups.some(g => g.conditions.some(c => c.value.trim()));

  const sourceColors: Record<string, string> = {
    'Windows': 'bg-blue-500/20 text-blue-500',
    'Entra ID': 'bg-purple-500/20 text-purple-500',
    'Security': 'bg-orange-500/20 text-orange-500',
    'Firewall': 'bg-cyan-500/20 text-cyan-500',
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Correlazioni Cross-Source</h2>
        <Button
          variant={showBuilder ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowBuilder(!showBuilder)}
          className="gap-1.5"
        >
          <SlidersHorizontal className="w-4 h-4" />
          Query Builder
        </Button>
      </div>

      {showBuilder && (
        <AdvancedFilterBuilder
          filter={filter}
          onChange={setFilter}
          onClose={() => setShowBuilder(false)}
        />
      )}

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Link2 className="w-5 h-5 text-primary" />
            Correlazione eventi booleana cross-source
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hasConditions ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
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
                <p className="text-sm text-muted-foreground text-center py-8">Nessun evento corrisponde ai criteri impostati.</p>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-sm text-muted-foreground">
              Usa il Query Builder per costruire query booleane complesse (AND/OR) e correlare eventi tra Windows, Entra ID, Firewall e Security Events.
              <br />
              <span className="text-xs mt-1 block">Es: <code className="bg-muted px-1.5 py-0.5 rounded text-foreground/80">IP Sorgente contiene "203.0.113" AND Severity uguale a "Critical"</code></span>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
};
