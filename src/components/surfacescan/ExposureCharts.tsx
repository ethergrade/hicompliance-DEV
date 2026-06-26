import React, { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ExposureOpenPortRow, ExposureSummary, ExposureTechnologyRow } from '@/lib/surfacescan/exposureApi';
import { Globe2, Network, ShieldCheck, Signal } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface ExposureChartsProps {
  summary: ExposureSummary | null;
  openPorts?: ExposureOpenPortRow[];
  technologies?: ExposureTechnologyRow[];
}

const COLORS = ['#6366F1', '#14B8A6', '#F97316', '#EF4444', '#A855F7', '#22C55E', '#FACC15'];
const RISKY_PORTS = new Set([21, 23, 445, 3389, 5900, 6379, 9200, 9300, 11211, 27017, 3306, 5432, 1433, 1521, 2375]);
const TLS_PORTS = new Set([443, 465, 636, 853, 989, 990, 993, 995, 8443, 9443]);
const WEB_PORTS = new Set([80, 443, 8000, 8080, 8081, 8443, 8888, 9443]);

const defaultPortLabel = (port: number): string => {
  if (port === 80) return 'HTTP';
  if (port === 443) return 'HTTPS';
  if (port === 22) return 'SSH';
  if (port === 25) return 'SMTP';
  if (port === 53) return 'DNS';
  if (port === 110) return 'POP3';
  if (port === 143) return 'IMAP';
  if (port === 445) return 'SMB';
  if (port === 587) return 'SMTP';
  if (port === 993) return 'IMAPS';
  if (port === 995) return 'POP3S';
  if (port === 3306) return 'MySQL';
  if (port === 3389) return 'RDP';
  if (port === 5432) return 'PostgreSQL';
  if (port === 8080) return 'HTTP Alt';
  if (port === 8443) return 'HTTPS Alt';
  return 'TCP';
};

const portTone = (port: number): string => {
  if (RISKY_PORTS.has(port)) return 'border-red-500/40 bg-red-500/10 text-red-300';
  if (TLS_PORTS.has(port)) return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300';
  if (WEB_PORTS.has(port)) return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
  return 'border-primary/40 bg-primary/10 text-primary';
};

export const ExposureCharts: React.FC<ExposureChartsProps> = ({
  summary,
  openPorts = [],
  technologies = [],
}) => {
  const topPortsData = useMemo(() => {
    if (summary?.top_open_ports?.length) return summary.top_open_ports;
    const map = new Map<number, number>();
    for (const row of openPorts) {
      map.set(row.port, (map.get(row.port) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([port, count]) => ({ port, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [summary, openPorts]);

  const topPortCards = useMemo(() => {
    const groupedRows = new Map<number, ExposureOpenPortRow[]>();
    for (const row of openPorts) {
      groupedRows.set(row.port, [...(groupedRows.get(row.port) || []), row]);
    }

    const maxCount = Math.max(1, ...topPortsData.map((entry) => Number(entry.count || 0)));

    return topPortsData.map((entry) => {
      const port = Number(entry.port || 0);
      const rows = groupedRows.get(port) || [];
      const serviceNames = rows
        .map((row) => row.service_name || row.service_product || '')
        .map((value) => String(value).trim())
        .filter(Boolean);
      const label = serviceNames[0]?.toUpperCase() || defaultPortLabel(port);
      const hosts = [...new Set(rows.map((row) => String(row.host || '').trim()).filter(Boolean))];
      const ips = [...new Set(rows.map((row) => String(row.ip || '').trim()).filter(Boolean))];
      const tls = rows.some((row) => row.is_tls) || TLS_PORTS.has(port);
      const web = rows.some((row) => row.is_web) || WEB_PORTS.has(port);

      return {
        port,
        count: Number(entry.count || 0),
        label,
        hosts,
        ips,
        tls,
        web,
        width: `${Math.max(8, Math.round((Number(entry.count || 0) / maxCount) * 100))}%`,
      };
    });
  }, [openPorts, topPortsData]);

  const totalPortOccurrences = topPortsData.reduce((sum, entry) => sum + Number(entry.count || 0), 0);

  const severityData = useMemo(() => {
    const fallback = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    const sev = summary?.findings_by_severity || fallback;
    return [
      { name: 'Critical', value: sev.critical },
      { name: 'High', value: sev.high },
      { name: 'Medium', value: sev.medium },
      { name: 'Low', value: sev.low },
      { name: 'Info', value: sev.info },
    ].filter((entry) => Number(entry.value || 0) > 0);
  }, [summary]);

  const topTechData = useMemo(() => {
    if (summary?.technologies?.length) return summary.technologies.slice(0, 10);
    const map = new Map<string, number>();
    for (const row of technologies) {
      const name = String(row.technology_name || '').trim();
      if (!name) continue;
      map.set(name, (map.get(name) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [summary, technologies]);

  const hasAnyChart = topPortsData.length > 0 || severityData.length > 0 || topTechData.length > 0;
  if (!hasAnyChart) return null;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      {topPortsData.length > 0 && (
        <Card className="border-border xl:col-span-2 overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Network className="h-4 w-4 text-primary" />
                  Top 10 Porte Aperte
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Distribuzione dei servizi esposti rilevati nell'ultimo snapshot in scope.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                  {totalPortOccurrences} occorrenze
                </Badge>
                <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                  {topPortCards.filter((entry) => entry.tls).length} TLS
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              {topPortCards.map((entry) => (
                <div
                  key={entry.port}
                  className="rounded-lg border border-border bg-muted/20 p-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={`${portTone(entry.port)} font-mono`}>
                          {entry.port} - {entry.label}
                        </Badge>
                        {entry.web && (
                          <Badge variant="secondary" className="gap-1">
                            <Globe2 className="h-3 w-3" />
                            Web
                          </Badge>
                        )}
                        {entry.tls && (
                          <Badge variant="secondary" className="gap-1 bg-emerald-500/10 text-emerald-300">
                            <ShieldCheck className="h-3 w-3" />
                            TLS
                          </Badge>
                        )}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>{entry.count} servizi</span>
                        <span>{entry.hosts.length || entry.count} host</span>
                        {entry.ips.length > 0 && <span>{entry.ips.length} IP</span>}
                      </div>
                    </div>
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-background/70">
                      <Signal className="h-4 w-4 text-primary" />
                    </div>
                  </div>

                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-background">
                    <div className="h-full rounded-full bg-primary" style={{ width: entry.width }} />
                  </div>

                  {(entry.hosts.length > 0 || entry.ips.length > 0) && (
                    <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                      {[...entry.hosts.slice(0, 2), ...entry.ips.slice(0, 2)].map((item) => (
                        <span key={item} className="rounded-md border border-border bg-background/60 px-2 py-1 font-mono">
                          {item}
                        </span>
                      ))}
                      {entry.hosts.length + entry.ips.length > 4 && (
                        <span className="rounded-md border border-border bg-background/60 px-2 py-1">
                          +{entry.hosts.length + entry.ips.length - 4}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {severityData.length > 0 && (
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base">Distribuzione Severity Exposure</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={severityData} dataKey="value" nameKey="name" outerRadius={90} innerRadius={45}>
                    {severityData.map((_, index) => (
                      <Cell key={`sev-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {topTechData.length > 0 && (
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base">Tecnologie Più Frequenti</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topTechData} layout="vertical" margin={{ left: 16, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                  <YAxis dataKey="name" type="category" stroke="hsl(var(--muted-foreground))" width={120} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#14B8A6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ExposureCharts;
