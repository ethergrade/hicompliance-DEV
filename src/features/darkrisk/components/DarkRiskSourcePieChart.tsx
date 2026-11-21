import React from 'react';
import { insidePercentLabel, PieLegend } from '@/components/charts/pieLabels';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Database } from 'lucide-react';
import { SOURCE_GLOSSARY, aggregateBySourceCategory } from '../domain/sourceCategory';

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
  // Categorie del glossario, mai i bucket del fornitore.
  const chartData = Object.entries(aggregateBySourceCategory(data))
    .sort((a, b) => b[1] - a[1])
    .map(([key, value], idx) => ({
      name: key,
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
              // Senza un colore esplicito recharts usa il nero di default, che
              // sullo sfondo scuro della card risulta illeggibile.
              contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px', fontSize: '12px', color: 'hsl(var(--card-foreground))' }}
              itemStyle={{ color: 'hsl(var(--card-foreground))' }}
              labelStyle={{ color: 'hsl(var(--card-foreground))' }}
            />
          </PieChart>
        </ResponsiveContainer>
        <PieLegend items={chartData} />
        <SourceGlossary />
      </CardContent>
    </Card>
  );
}

/** Glossario delle categorie, sotto il grafico: le stesse voci in fondo al report PDF. */
function SourceGlossary() {
  return (
    <details className="mt-3 rounded-md border border-border/60 p-2 text-xs">
      <summary className="cursor-pointer text-muted-foreground">Glossario delle sorgenti</summary>
      <dl className="mt-2 grid gap-x-3 gap-y-1.5 sm:grid-cols-[max-content_1fr]">
        {SOURCE_GLOSSARY.map(([category, meaning]) => (
          <React.Fragment key={category}>
            <dt className="font-medium">{category}</dt>
            <dd className="text-muted-foreground">{meaning}</dd>
          </React.Fragment>
        ))}
      </dl>
    </details>
  );
}
