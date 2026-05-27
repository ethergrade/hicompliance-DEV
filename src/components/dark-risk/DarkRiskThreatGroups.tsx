import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowUpRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type ThreatGroup = {
  category: string;
  count: number;
  severity_max: 'info' | 'low' | 'medium' | 'high' | 'critical';
  description: string;
  trend_delta?: number | null;
};

const severityClasses: Record<ThreatGroup['severity_max'], string> = {
  critical: 'bg-red-500/20 text-red-300 border-red-500/40',
  high: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
  medium: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
  low: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  info: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
};

const trendLabel = (value: number | null | undefined): string => {
  if (value == null) return 'Trend non disponibile';
  if (value === 0) return 'Nessun cambiamento';
  if (value > 0) return `Nuovo rispetto all'ultima scansione: +${value}`;
  return `Riduzione rispetto all'ultima scansione: ${value}`;
};

export const DarkRiskThreatGroups: React.FC<{
  groups: ThreatGroup[];
  resolveIcon: (category: string) => LucideIcon;
  onOpenCategory: (category: string) => void;
}> = ({ groups, resolveIcon, onOpenCategory }) => {
  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle>Minacce Rilevate</CardTitle>
      </CardHeader>
      <CardContent>
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nessuna minaccia critica rilevata nell'ultima scansione.
            Sono stati comunque controllati domini, selector e postura esterna secondo il perimetro autorizzato.
          </p>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => {
              const Icon = resolveIcon(group.category);
              return (
                <div
                  key={group.category}
                  className="flex items-center justify-between gap-4 p-3 rounded-lg border border-border bg-card"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{group.category}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">{group.description}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">{trendLabel(group.trend_delta)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-xl font-bold text-foreground">{group.count}</div>
                    <Badge className={severityClasses[group.severity_max]}>{group.severity_max}</Badge>
                    <Button variant="outline" size="sm" onClick={() => onOpenCategory(group.category)}>
                      <ArrowUpRight className="w-3.5 h-3.5 mr-1" />
                      Dettaglio
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
