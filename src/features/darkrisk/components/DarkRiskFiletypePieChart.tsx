import React from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText } from 'lucide-react';

const FILETYPE_LABELS: Record<string, string> = {
  html:        'Website HTMLs',
  text:        'Text Files',
  csv:         'CSV Files',
  pdf:         'PDF',
  word:        'Word Docs',
  paste:       'Paste',
  database:    'Database',
  archive:     'Archive',
  email_body:  'Email',
  forum:       'Forum',
  code:        'Code',
  certificate: 'Certificate',
  social:      'Social',
  image:       'Image',
  unknown:     'Other',
};

const FILETYPE_COLORS = [
  '#3b82f6', '#6b7280', '#22c55e', '#ef4444',
  '#6366f1', '#f97316', '#14b8a6', '#eab308',
  '#ec4899', '#8b5cf6',
];

interface Props {
  data: Record<string, number>;
  title?: string;
}

export function DarkRiskFiletypePieChart({ data, title = 'Results per File Type' }: Props) {
  const chartData = Object.entries(data)
    .sort((a, b) => b[1] - a[1])
    .map(([key, value], idx) => ({
      name: FILETYPE_LABELS[key] ?? key,
      value,
      color: FILETYPE_COLORS[idx % FILETYPE_COLORS.length],
    }));

  const total = chartData.reduce((s, d) => s + d.value, 0);

  if (total === 0) {
    return (
      <Card className="bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FileText className="h-4 w-4" />
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
          <FileText className="h-4 w-4" />
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
