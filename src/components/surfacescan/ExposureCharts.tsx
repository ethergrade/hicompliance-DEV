import React, { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ExposureOpenPortRow, ExposureSummary, ExposureTechnologyRow } from '@/lib/surfacescan/exposureApi';
import { Circle, Crosshair, Globe2, Network, Radar, ShieldCheck, Signal } from 'lucide-react';
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
  type PieLabelRenderProps,
} from 'recharts';

interface ExposureChartsProps {
  summary: ExposureSummary | null;
  openPorts?: ExposureOpenPortRow[];
  technologies?: ExposureTechnologyRow[];
}

const SEVERITY_META = {
  Critical: {
    color: '#ff4057',
    code: 'CRIT',
    description: 'Compromissione o impatto immediato',
  },
  High: {
    color: '#ff8a3d',
    code: 'HIGH',
    description: 'Remediation prioritaria',
  },
  Medium: {
    color: '#f2c94c',
    code: 'MED',
    description: 'Riduzione del rischio pianificata',
  },
  Low: {
    color: '#35d0a4',
    code: 'LOW',
    description: 'Hardening e verifica periodica',
  },
  Info: {
    color: '#5f8cff',
    code: 'INFO',
    description: 'Evidenza contestuale',
  },
} as const;

type SeverityName = keyof typeof SEVERITY_META;

type SeverityChartRow = {
  name: SeverityName;
  value: number;
  color: string;
  code: string;
  description: string;
};

const renderSeverityLabel = ({ name, value, percent }: PieLabelRenderProps & { value?: number }): string =>
  `${name} ${Number(value || 0)} · ${Math.round(Number(percent || 0) * 100)}%`;
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
  const [activeSeverityIndex, setActiveSeverityIndex] = useState<number | null>(null);
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
    const rows: Array<{ name: SeverityName; value: number }> = [
      { name: 'Critical', value: sev.critical },
      { name: 'High', value: sev.high },
      { name: 'Medium', value: sev.medium },
      { name: 'Low', value: sev.low },
      { name: 'Info', value: sev.info },
    ];
    return rows
      .filter((entry) => Number(entry.value || 0) > 0)
      .map((entry): SeverityChartRow => ({ ...entry, ...SEVERITY_META[entry.name] }));
  }, [summary]);

  const totalSeverityFindings = useMemo(
    () => severityData.reduce((total, entry) => total + Number(entry.value || 0), 0),
    [severityData],
  );

  const activeSeverity = activeSeverityIndex == null ? null : severityData[activeSeverityIndex] || null;

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
        <Card className="overflow-hidden border-slate-700/70 bg-[#0b111a] shadow-[0_18px_45px_-30px_rgba(55,189,248,0.45)] xl:col-span-2">
          <CardHeader className="border-b border-slate-800/90 pb-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base tracking-tight">
                  <Radar className="h-4 w-4 text-cyan-300" />
                  Distribuzione Severity Exposure
                </CardTitle>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
                  Risk signal matrix // snapshot corrente
                </p>
              </div>
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">
                <Signal className="h-3.5 w-3.5" />
                {totalSeverityFindings} segnali classificati
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-5">
            <div className="grid gap-5 md:grid-cols-[minmax(0,1.35fr)_minmax(220px,0.65fr)]">
              <div className="relative min-h-[300px] overflow-hidden rounded-md border border-slate-800 bg-[#080d14]">
                <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-600">
                  <Crosshair className="h-3.5 w-3.5" />
                  Severity topology
                </div>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart margin={{ top: 34, right: 62, bottom: 22, left: 62 }}>
                      <Pie
                        data={severityData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="53%"
                        outerRadius={88}
                        innerRadius={56}
                        paddingAngle={2}
                        cornerRadius={2}
                        stroke="#0b111a"
                        strokeWidth={2}
                        label={renderSeverityLabel}
                        labelLine={{ stroke: '#43536a', strokeWidth: 1 }}
                        activeIndex={activeSeverityIndex == null ? undefined : activeSeverityIndex}
                        activeShape={{ outerRadius: 96, stroke: '#c8f5ff', strokeWidth: 1 }}
                        inactiveShape={activeSeverityIndex == null ? undefined : { opacity: 0.38 }}
                        onMouseEnter={(_, index) => setActiveSeverityIndex(index)}
                        onMouseLeave={() => setActiveSeverityIndex(null)}
                      >
                        {severityData.map((entry) => (
                          <Cell key={`sev-${entry.name}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        cursor={false}
                        contentStyle={{
                          background: '#0b111a',
                          border: '1px solid #334155',
                          borderRadius: '6px',
                          boxShadow: '0 18px 36px rgba(0,0,0,0.35)',
                          color: '#e2e8f0',
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                          fontSize: '11px',
                        }}
                        itemStyle={{ color: '#e2e8f0' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="pointer-events-none absolute left-1/2 top-[53%] flex h-[94px] w-[94px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-slate-800 bg-[#0b111a]/95 text-center shadow-[inset_0_0_22px_rgba(56,189,248,0.05)]">
                  <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">
                    {activeSeverity ? activeSeverity.code : 'TOTAL'}
                  </span>
                  <span className="mt-0.5 text-2xl font-semibold tabular-nums text-slate-100">
                    {activeSeverity ? activeSeverity.value : totalSeverityFindings}
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-cyan-300/80">
                    {activeSeverity
                      ? `${Math.round((activeSeverity.value / totalSeverityFindings) * 100)}% quota`
                      : 'findings'}
                  </span>
                </div>
              </div>

              <div className="rounded-md border border-slate-800 bg-[#0d141e] p-3">
                <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400">Legenda operativa</span>
                  <span className="font-mono text-[10px] text-slate-600">COUNT / SHARE</span>
                </div>
                <div className="space-y-1.5">
                  {severityData.map((entry, index) => {
                    const percentage = Math.round((entry.value / totalSeverityFindings) * 100);
                    const isActive = activeSeverityIndex === index;
                    return (
                      <button
                        key={entry.name}
                        type="button"
                        className={`group w-full rounded border px-3 py-2.5 text-left transition-colors ${
                          isActive
                            ? 'border-cyan-400/50 bg-cyan-400/10'
                            : 'border-transparent bg-slate-950/30 hover:border-slate-700 hover:bg-slate-900/70'
                        }`}
                        aria-pressed={isActive}
                        onMouseEnter={() => setActiveSeverityIndex(index)}
                        onMouseLeave={() => setActiveSeverityIndex(null)}
                        onFocus={() => setActiveSeverityIndex(index)}
                        onBlur={() => setActiveSeverityIndex(null)}
                        onClick={() => setActiveSeverityIndex((current) => current === index ? null : index)}
                      >
                        <span className="flex items-start gap-2.5">
                          <Circle
                            className="mt-1 h-2.5 w-2.5 shrink-0"
                            fill="currentColor"
                            strokeWidth={0}
                            style={{ color: entry.color }}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-3">
                              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-200">
                                {entry.name}
                              </span>
                              <span className="font-mono text-[11px] tabular-nums text-slate-300">
                                {entry.value} / {percentage}%
                              </span>
                            </span>
                            <span className="mt-0.5 block text-[10px] leading-4 text-slate-500 group-hover:text-slate-400">
                              {entry.description}
                            </span>
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 border-t border-slate-800 pt-3 text-[10px] leading-4 text-slate-500">
                  Passa sui segmenti o sulla legenda per isolare il segnale e leggerne il peso relativo.
                </div>
              </div>
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
