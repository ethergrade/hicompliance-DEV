import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { LucideIcon } from 'lucide-react';

export type DarkRiskKpiCardProps = {
  title: string;
  value: string | number;
  delta?: string | null;
  extra?: string | null;
  toneClass?: string;
  icon: LucideIcon;
  description: string;
  onClick?: () => void;
};

export const DarkRiskKpiCard: React.FC<DarkRiskKpiCardProps> = ({
  title,
  value,
  delta,
  extra,
  toneClass = 'text-foreground',
  icon: Icon,
  description,
  onClick,
}) => {
  const clickable = typeof onClick === 'function';

  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Card
            className={`border-border ${clickable ? 'cursor-pointer transition-colors hover:border-primary/40 hover:bg-muted/30' : ''}`}
            onClick={onClick}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            onKeyDown={(event) => {
              if (!clickable) return;
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onClick?.();
              }
            }}
          >
            <CardContent className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">{title}</p>
                  <p className={`text-2xl font-bold ${toneClass}`}>{value}</p>
                  {extra ? <p className="text-xs text-muted-foreground mt-1">{extra}</p> : null}
                </div>
                <Icon className={`w-6 h-6 ${toneClass}`} />
              </div>
              {delta ? <p className="text-xs text-muted-foreground">{delta}</p> : null}
            </CardContent>
          </Card>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          {description}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
