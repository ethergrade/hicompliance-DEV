import React from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Database } from 'lucide-react';

const BUCKET_LABELS: Record<string, string> = {
  leaks_restricted:        'Leaks › Restricted',
  leaks_logs:              'Leaks › Logs',
  leaks_public:            'Leaks › Public',
  'leaks.logs':            'Leaks › Logs',
  'leaks.private.general': 'Leaks › Private',
  'leaks.public.general':  'Leaks › Public',
  'leaks.restricted':      'Leaks › Restricted',
  'web.public.com':        'Web: .com',
  'web.public.it':         'Web: .it',
  'web.public.org':        'Web: .org',
  'web.public.net':        'Web: .net',
  whois:                   'WHOIS',
  dns:                     'DNS',
  DNS:                     'DNS',
  paste:                   'Paste Sites',
  social:                  'Social Media',
  forum:                   'Forum',
  darkweb:                 'Dark Web',
  '.com':                  'Web: .com',
  '.it':                   'Web: .it',
};

const BUCKET_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6',
  '#f59e0b', '#6366f1',
];

interface Props {
  data: Record<string, number>;
  title?: string;
}

export function DarkRiskSourcePieChart({ data, title = 'Results per Data Source' }: Props) {
  const chartData = Object.entries(data)
    .sort((a, b) => b[1] - a[1])
    .map(([key, value], idx) => ({
      name: BUCKET_LABELS[key] ?? key,
      value,
      color: BUCKET_COLORS[idx % BUCKET_COLORS.length],
    }));

  const total = chartData.reduce((s, d) => s + d.value, 0);

  if (total === 0) {
    return (
      <Card className="bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Database className="h-4 w-4" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-32 text-muted-foreground text-sm">
          Nessun dato disponibile
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Database className="h-4 w-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              outerRadius={70}
              dataKey="value"
              label={({ percent }) => `${(percent * 100).toFixed(1)}%`}
              labelLine={false}
            >
              {chartData.map((entry, idx) => (
                <Cell key={`cell-${idx}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number, name: string) => [
                `${value} (${((value / total) * 100).toFixed(2)}%)`,
                name,
              ]}
              // Senza un colore esplicito recharts usa il nero di default, che
              // sullo sfondo scuro della card risulta illeggibile.
              contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px', fontSize: '12px', color: 'hsl(var(--card-foreground))' }}
              itemStyle={{ color: 'hsl(var(--card-foreground))' }}
              labelStyle={{ color: 'hsl(var(--card-foreground))' }}
            />
            <Legend
              iconSize={10}
              formatter={(value) => <span style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))' }}>{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
