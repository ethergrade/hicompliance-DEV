import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { presentDarkRiskSource } from '@/lib/darkrisk/presentation';

export type DarkRiskAssetRow = {
  id: string;
  asset_type: string;
  value: string;
  scope_status: string;
  source: string;
  first_seen_at: string | null;
  last_seen_at: string | null;
  findings_count: number;
};

const scopeBadgeClass = (scopeStatus: string): string => {
  const normalized = scopeStatus.toLowerCase();
  if (normalized === 'approved') return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
  if (normalized === 'candidate') return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
  if (normalized === 'excluded') return 'bg-red-500/20 text-red-300 border-red-500/40';
  return 'bg-slate-500/20 text-slate-300 border-slate-500/40';
};

const formatDateTime = (value: string | null | undefined): string => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('it-IT');
};

export const DarkRiskAssetsTable: React.FC<{ rows: DarkRiskAssetRow[]; subtitle?: string }> = ({ rows, subtitle }) => {
  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle>Assets</CardTitle>
        {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun asset disponibile nel perimetro autorizzato.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-3">Tipo</th>
                  <th className="py-2 pr-3">Valore</th>
                  <th className="py-2 pr-3">Scope</th>
                  <th className="py-2 pr-3">Sorgente</th>
                  <th className="py-2 pr-3">Prima rilevazione</th>
                  <th className="py-2 pr-3">Ultima rilevazione</th>
                  <th className="py-2">Finding collegati</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/60 align-top">
                    <td className="py-2 pr-3">{row.asset_type}</td>
                    <td className="py-2 pr-3 font-medium">{row.value}</td>
                    <td className="py-2 pr-3"><Badge className={scopeBadgeClass(row.scope_status)}>{row.scope_status}</Badge></td>
                    <td className="py-2 pr-3">{presentDarkRiskSource(row.source)}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{formatDateTime(row.first_seen_at)}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{formatDateTime(row.last_seen_at)}</td>
                    <td className="py-2">{row.findings_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
