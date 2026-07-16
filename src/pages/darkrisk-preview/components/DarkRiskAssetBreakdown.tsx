import React, { useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, Globe } from 'lucide-react';

const BUCKET_LABELS: Record<string, string> = {
  'leaks.logs':            'Leaks Logs',
  'leaks.private.general': 'Leaks Private',
  'leaks.public.general':  'Leaks Public',
  'leaks.restricted':      'Leaks Restricted',
  'web.public.com':        'Web .com',
  'web.public.it':         'Web .it',
  whois:                   'WHOIS',
  dns: 'DNS', DNS: 'DNS',
};

const COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899','#14b8a6'];

interface AssetData {
  total: number;
  by_source: Record<string, number>;
  by_filetype: Record<string, number>;
}

interface Props {
  data: Record<string, AssetData>;
}

function MiniPie({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (!total) return null;
  const chartData = entries.map(([k, v]) => ({ name: BUCKET_LABELS[k] ?? k, value: v }));
  return (
    <ResponsiveContainer width="100%" height={120}>
      <PieChart>
        <Pie data={chartData} cx="50%" cy="50%" outerRadius={48} dataKey="value" labelLine={false}>
          {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip
          formatter={(v: number, n: string) => [`${v} (${((v / total) * 100).toFixed(1)}%)`, n]}
          contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px', fontSize: '11px' }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

function AssetCard({ asset, data }: { asset: string; data: AssetData }) {
  const [open, setOpen] = useState(false);
  const topSources = Object.entries(data.by_source).sort((a, b) => b[1] - a[1]).slice(0, 3);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="font-mono text-sm font-medium truncate">{asset}</span>
          <div className="flex gap-1.5 flex-wrap">
            {topSources.map(([k, v]) => (
              <Badge key={k} variant="secondary" className="text-[10px] px-1.5 py-0">
                {BUCKET_LABELS[k] ?? k}: {v}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-3">
          <span className="text-sm font-semibold text-foreground">{data.total}</span>
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-border bg-muted/20 px-4 py-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Sorgenti</p>
              <MiniPie data={data.by_source} />
              <div className="mt-1 space-y-0.5">
                {Object.entries(data.by_source).sort((a, b) => b[1] - a[1]).map(([k, v], i) => (
                  <div key={k} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="h-2 w-2 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-muted-foreground truncate max-w-[130px]">{BUCKET_LABELS[k] ?? k}</span>
                    </div>
                    <span className="font-medium">{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Tipo file</p>
              <MiniPie data={data.by_filetype} />
              <div className="mt-1 space-y-0.5">
                {Object.entries(data.by_filetype).sort((a, b) => b[1] - a[1]).map(([k, v], i) => (
                  <div key={k} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="h-2 w-2 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-muted-foreground capitalize">{k}</span>
                    </div>
                    <span className="font-medium">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function DarkRiskAssetBreakdown({ data }: Props) {
  const sorted = Object.entries(data).sort((a, b) => b[1].total - a[1].total);
  if (!sorted.length) return null;

  return (
    <Card className="bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Breakdown per Asset
          </span>
          <span className="text-xs font-normal text-muted-foreground">{sorted.length} asset monitorati</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {sorted.map(([asset, assetData]) => (
          <AssetCard key={asset} asset={asset} data={assetData} />
        ))}
      </CardContent>
    </Card>
  );
}
