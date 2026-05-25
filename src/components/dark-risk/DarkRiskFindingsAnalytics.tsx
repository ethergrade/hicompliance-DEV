import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type Row = {
  id: string;
  site: string;
  scope_status: string;
  category: string;
  sensitive_tags: string[];
};

type ScopePieRow = {
  scope: string;
  count: number;
};

const categoryPalette = ['#8b5cf6', '#06b6d4', '#22c55e', '#f59e0b', '#ef4444', '#64748b', '#3b82f6', '#a855f7'];
const scopePalette: Record<string, string> = {
  approved: '#22c55e',
  candidate: '#f59e0b',
  excluded: '#ef4444',
  unknown: '#64748b',
};

const sensitiveLabel: Record<string, string> = {
  domains: 'Domini',
  passwords: 'Password',
  addresses: 'Indirizzi',
  credit_cards: 'Carte di credito',
  phone_numbers: 'Numeri di telefono',
};

function shortSiteLabel(value: string): string {
  if (value.length <= 38) return value;
  return `${value.slice(0, 35)}...`;
}

export const DarkRiskFindingsAnalytics: React.FC<{ rows: Row[] }> = ({ rows }) => {
  const data = useMemo(() => {
    const siteCategory = new Map<string, Record<string, number>>();
    const categoryTotals = new Map<string, number>();
    const scopeTotals = new Map<string, number>();
    const sensitiveTotals = new Map<string, number>();

    for (const row of rows) {
      const site = row.site || 'n/a';
      const category = row.category || 'Minacce rilevate';
      const scope = (row.scope_status || 'unknown').toLowerCase();

      if (!siteCategory.has(site)) siteCategory.set(site, { total: 0 });
      const siteBucket = siteCategory.get(site)!;
      siteBucket[category] = (siteBucket[category] || 0) + 1;
      siteBucket.total = (siteBucket.total || 0) + 1;

      categoryTotals.set(category, (categoryTotals.get(category) || 0) + 1);
      scopeTotals.set(scope, (scopeTotals.get(scope) || 0) + 1);

      for (const tag of row.sensitive_tags || []) {
        sensitiveTotals.set(tag, (sensitiveTotals.get(tag) || 0) + 1);
      }
    }

    const topCategories = Array.from(categoryTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name]) => name);

    const siteRows = Array.from(siteCategory.entries())
      .map(([site, bucket]) => {
        const rowData: Record<string, number | string> = {
          site,
          siteLabel: shortSiteLabel(site),
          total: Number(bucket.total || 0),
        };
        for (const category of topCategories) {
          rowData[category] = Number(bucket[category] || 0);
        }
        return rowData;
      })
      .sort((a, b) => Number(b.total || 0) - Number(a.total || 0))
      .slice(0, 12);

    const scopeRows = Array.from(scopeTotals.entries())
      .map(([scope, count]) => ({ scope, count }))
      .sort((a, b) => b.count - a.count);

    const sensitiveRows = Object.keys(sensitiveLabel).map((tag) => ({
      tag,
      label: sensitiveLabel[tag],
      count: sensitiveTotals.get(tag) || 0,
    }));

    return {
      topCategories,
      siteRows,
      scopeRows,
      sensitiveRows,
    };
  }, [rows]);

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle>Analytics Findings</CardTitle>
        <p className="text-xs text-muted-foreground">
          Distribuzione per sito, scope e categoria + classificazione evidenze sensibili.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 rounded-lg border border-border/70 bg-muted/20 p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">Finding per sito (stack categoria)</p>
              <Badge variant="outline">Top {data.siteRows.length} siti</Badge>
            </div>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.siteRows} margin={{ top: 8, right: 12, left: 0, bottom: 28 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                  <XAxis dataKey="siteLabel" interval={0} angle={-18} textAnchor="end" height={56} stroke="#94a3b8" />
                  <YAxis allowDecimals={false} stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{ background: '#0b1220', border: '1px solid rgba(148,163,184,0.3)' }}
                    formatter={(value: number, key: string) => [value, key]}
                    labelFormatter={(label) => String(label)}
                  />
                  <Legend />
                  {data.topCategories.map((category, index) => (
                    <Bar key={category} dataKey={category} stackId="siteCategories" fill={categoryPalette[index % categoryPalette.length]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
            <p className="text-sm font-medium mb-2">Distribuzione scope</p>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.scopeRows}
                    dataKey="count"
                    nameKey="scope"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={(entry: ScopePieRow & { percent?: number }) =>
                      `${entry.scope} ${(Number(entry.percent || 0) * 100).toFixed(0)}%`
                    }
                  >
                    {data.scopeRows.map((entry) => (
                      <Cell key={entry.scope} fill={scopePalette[entry.scope] || scopePalette.unknown} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#0b1220', border: '1px solid rgba(148,163,184,0.3)' }}
                    formatter={(value: number, key: string) => [value, key]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
          <p className="text-sm font-medium mb-3">Evidenze sensibili rilevate nella collection</p>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {data.sensitiveRows.map((row) => (
              <div key={row.tag} className="rounded-md border border-border/60 bg-background/40 p-3">
                <p className="text-xs text-muted-foreground">{row.label}</p>
                <p className="text-xl font-semibold mt-1">{row.count}</p>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
