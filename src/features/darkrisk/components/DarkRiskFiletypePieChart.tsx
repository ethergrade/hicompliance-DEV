import React from 'react';
import { insidePercentLabel, PieLegend } from '@/components/charts/pieLabels';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText } from 'lucide-react';

/**
 * Il backend manda già etichette italiane ("File di testo", "File CSV"…);
 * qui restano le chiavi dei vecchi snapshot. Prima la chiave del backend era
 * "Unknown" con la maiuscola e non corrispondeva a nessuna voce.
 */
const UNCLASSIFIED = new Set(['unknown', 'other', 'non classificato', '']);

const FILETYPE_LABELS: Record<string, string> = {
  html:        'Pagina web',
  text:        'File di testo',
  csv:         'File CSV',
  pdf:         'PDF',
  word:        'Word',
  paste:       'Paste',
  database:    'Database',
  archive:     'Archivio',
  email_body:  'Email',
  forum:       'Forum',
  code:        'Codice',
  certificate: 'Certificato',
  social:      'Social',
  image:       'Immagine',
  unknown:     'Non classificato',
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

export function DarkRiskFiletypePieChart({ data, title = 'Risultati per tipo di file' }: Props) {
  const chartData = Object.entries(data)
    .sort((a, b) => b[1] - a[1])
    .map(([key, value], idx) => ({
      name: FILETYPE_LABELS[key.toLowerCase()] ?? key,
      value,
      color: FILETYPE_COLORS[idx % FILETYPE_COLORS.length],
    }));

  const total = chartData.reduce((s, d) => s + d.value, 0);
  // Una torta al 100% di una sola voce «non classificato» non dice niente:
  // meglio una riga di testo.
  const allUnclassified = total > 0 && Object.keys(data).every((key) => UNCLASSIFIED.has(key.trim().toLowerCase()));

  if (allUnclassified) {
    return (
      <Card className="bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Tipo di file non classificato dalla fonte per tutti i {total} record.
        </CardContent>
      </Card>
    );
  }

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
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              outerRadius="90%"
              dataKey="value"
              label={insidePercentLabel()}
              labelLine={false}
              isAnimationActive={false}
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
          </PieChart>
        </ResponsiveContainer>
        <PieLegend items={chartData} />
      </CardContent>
    </Card>
  );
}
