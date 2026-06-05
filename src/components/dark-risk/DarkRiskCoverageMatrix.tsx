import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type CoverageItem = {
  key: string;
  control: string;
  status: 'completed' | 'partial' | 'error' | 'not_run' | 'planned';
  last_execution: string | null;
  source: string;
};

const coverageClasses: Record<CoverageItem['status'], string> = {
  completed: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  partial: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  error: 'bg-red-500/20 text-red-300 border-red-500/40',
  not_run: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
  planned: 'bg-primary/20 text-primary border-primary/40',
};

const formatDateTime = (value: string | null | undefined): string => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('it-IT');
};

export const DarkRiskCoverageMatrix: React.FC<{ controls: CoverageItem[] }> = ({ controls }) => {
  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle>Copertura Controlli</CardTitle>
      </CardHeader>
      <CardContent>
        {controls.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nessun controllo disponibile per l'asset selezionato.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-4">Controllo</th>
                  <th className="py-2 pr-4">Stato</th>
                  <th className="py-2 pr-4">Ultima esecuzione</th>
                  <th className="py-2">Sorgente</th>
                </tr>
              </thead>
              <tbody>
                {controls.map((control) => (
                  <tr key={control.key} className="border-b border-border/60">
                    <td className="py-2 pr-4 font-medium">{control.control}</td>
                    <td className="py-2 pr-4">
                      <Badge className={coverageClasses[control.status]}>{control.status}</Badge>
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">{formatDateTime(control.last_execution)}</td>
                    <td className="py-2">{control.source}</td>
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
