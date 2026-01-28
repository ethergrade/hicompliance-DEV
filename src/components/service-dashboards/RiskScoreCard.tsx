import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface RiskScoreCardProps {
  title: string;
  level: string;
  levelColor: 'green' | 'yellow' | 'orange' | 'red';
  score: number;
  ringColor: string;
  className?: string;
}

const levelColorMap = {
  green: 'bg-green-500/20 text-green-500',
  yellow: 'bg-yellow-500/20 text-yellow-500',
  orange: 'bg-orange-500/20 text-orange-500',
  red: 'bg-red-500/20 text-red-500',
};

export const RiskScoreCard: React.FC<RiskScoreCardProps> = ({
  title,
  level,
  levelColor,
  score,
  ringColor,
  className,
}) => {
  // Calculate the stroke-dasharray for the circular progress
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <Card className={cn("border-border", className)}>
      <CardContent className="pt-6">
        <div className="flex flex-col items-center space-y-4">
          <h3 className="text-sm text-muted-foreground">{title}</h3>
          
          <Badge className={cn("font-medium", levelColorMap[levelColor])}>
            {level}
          </Badge>

          {/* Circular Progress */}
          <div className="relative w-28 h-28">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              {/* Background circle */}
              <circle
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke="hsl(var(--muted))"
                strokeWidth="8"
              />
              {/* Progress circle */}
              <circle
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke={ringColor}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-500"
              />
            </svg>
            {/* Center text */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl font-bold">{score}%</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
