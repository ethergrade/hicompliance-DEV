import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { SecurityControl, ControlScores, SCORE_LABELS, CATEGORY_LABELS, SecurityControlCategory } from '@/types/riskAnalysis';
import { cn } from '@/lib/utils';

interface RiskControlGroupProps {
  category: SecurityControlCategory;
  controls: SecurityControl[];
  scores: ControlScores;
  onScoreChange: (controlId: string, score: number | null) => void;
  disabled?: boolean;
}

export const RiskControlGroup: React.FC<RiskControlGroupProps> = ({
  category,
  controls,
  scores,
  onScoreChange,
  disabled = false,
}) => {
  const getScoreColor = (score: number | null, isSelected: boolean) => {
    if (!isSelected) return '';
    switch (score) {
      case 0: return 'bg-muted text-muted-foreground';
      case 1: return 'bg-destructive/20 text-destructive border-destructive/50';
      case 2: return 'bg-amber-500/30 text-amber-400 border-amber-500/60';
      case 3: return 'bg-primary/20 text-primary border-primary/50';
      default: return '';
    }
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium text-foreground">
          {CATEGORY_LABELS[category]}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <TooltipProvider>
          {controls.map((control) => {
            const currentScore = scores[control.id];
            
            return (
              <div key={control.id} className="flex items-center justify-between gap-4">
                <span className="text-sm text-foreground flex-1 min-w-0 truncate">
                  {control.name}
                </span>
                <ToggleGroup 
                  type="single" 
                  value={currentScore?.toString() ?? ''}
                  onValueChange={(value) => {
                    if (value === '') {
                      onScoreChange(control.id, null);
                    } else {
                      onScoreChange(control.id, parseInt(value));
                    }
                  }}
                  disabled={disabled}
                  className="flex gap-1"
                >
                  {[0, 1, 2, 3].map((scoreValue) => {
                    const isSelected = currentScore === scoreValue;
                    return (
                      <Tooltip key={scoreValue}>
                        <TooltipTrigger asChild>
                          <ToggleGroupItem
                            value={scoreValue.toString()}
                            className={cn(
                              'w-8 h-8 text-sm font-medium border',
                              'data-[state=on]:border-primary',
                              getScoreColor(scoreValue, isSelected),
                              !isSelected && 'hover:bg-muted/50'
                            )}
                          >
                            {scoreValue}
                          </ToggleGroupItem>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p className="text-xs">{SCORE_LABELS[scoreValue]}</p>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </ToggleGroup>
              </div>
            );
          })}
        </TooltipProvider>
      </CardContent>
    </Card>
  );
};
