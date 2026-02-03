import React from 'react';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Circle } from 'lucide-react';

interface PlaybookProgressBarProps {
  completed: number;
  total: number;
  percentage: number;
}

export const PlaybookProgressBar: React.FC<PlaybookProgressBarProps> = ({
  completed,
  total,
  percentage,
}) => {
  const getProgressColor = () => {
    if (percentage >= 100) return 'bg-green-500';
    if (percentage >= 75) return 'bg-emerald-500';
    if (percentage >= 50) return 'bg-yellow-500';
    if (percentage >= 25) return 'bg-orange-500';
    return 'bg-red-500';
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          {percentage >= 100 ? (
            <CheckCircle2 className="w-4 h-4 text-green-500" />
          ) : (
            <Circle className="w-4 h-4" />
          )}
          <span>Completamento</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{completed}/{total}</span>
          <span className="text-muted-foreground">({percentage}%)</span>
        </div>
      </div>
      <Progress 
        value={percentage} 
        className="h-2"
        indicatorClassName={getProgressColor()}
      />
    </div>
  );
};
