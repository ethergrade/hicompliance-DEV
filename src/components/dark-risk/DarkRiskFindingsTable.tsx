import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export type DarkRiskFindingRow = {
  id: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  risk_score: number;
  title: string;
  asset: string;
  finding_type: string;
  confidence: 'low' | 'medium' | 'high';
  status: string;
  first_seen_at: string;
  last_seen_at: string;
  source: string;
  compromise_type: string;
};

const severityClasses: Record<DarkRiskFindingRow['severity'], string> = {
  critical: 'bg-red-500/20 text-red-300 border-red-500/40',
  high: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
  medium: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
  low: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  info: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
};

const formatDateTime = (value: string | null | undefined): string => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('it-IT');
};

export const DarkRiskFindingsTable: React.FC<{
  rows: DarkRiskFindingRow[];
  subtitle?: string;
}> = ({ rows, subtitle }) => {
  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle>Findings</CardTitle>
        {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nessuna minaccia critica rilevata nell'ultima scansione.
            Sono stati comunque controllati domini, selector e postura esterna secondo il perimetro autorizzato.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-3">Severity</th>
                  <th className="py-2 pr-3">Risk</th>
                  <th className="py-2 pr-3">Titolo</th>
                  <th className="py-2 pr-3">Asset</th>
                  <th className="py-2 pr-3">Tipo</th>
                  <th className="py-2 pr-3">Confidence</th>
                  <th className="py-2 pr-3">Stato</th>
                  <th className="py-2 pr-3">First seen</th>
                  <th className="py-2 pr-3">Last seen</th>
                  <th className="py-2">Source</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/60 align-top">
                    <td className="py-2 pr-3"><Badge className={severityClasses[row.severity]}>{row.severity}</Badge></td>
                    <td className="py-2 pr-3 font-semibold">{row.risk_score}</td>
                    <td className="py-2 pr-3">
                      <p className="font-medium">{row.title}</p>
                      <p className="text-xs text-muted-foreground">{row.compromise_type}</p>
                    </td>
                    <td className="py-2 pr-3">{row.asset}</td>
                    <td className="py-2 pr-3">{row.finding_type}</td>
                    <td className="py-2 pr-3">{row.confidence}</td>
                    <td className="py-2 pr-3">{row.status}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{formatDateTime(row.first_seen_at)}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{formatDateTime(row.last_seen_at)}</td>
                    <td className="py-2">{row.source}</td>
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
