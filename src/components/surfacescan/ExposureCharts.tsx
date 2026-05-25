import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ExposureOpenPortRow, ExposureSummary, ExposureTechnologyRow } from '@/lib/surfacescan/exposureApi';
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

  const severityData = useMemo(() => {
    const fallback = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    const sev = summary?.findings_by_severity || fallback;
    return [
      { name: 'Critical', value: sev.critical },
      { name: 'High', value: sev.high },
      { name: 'Medium', value: sev.medium },
      { name: 'Low', value: sev.low },
      { name: 'Info', value: sev.info },
    ];
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

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base">Top 10 Porte Aperte</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topPortsData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="port" stroke="hsl(var(--muted-foreground))" />
                <YAxis stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#6366F1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

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
    </div>
  );
};

export default ExposureCharts;
