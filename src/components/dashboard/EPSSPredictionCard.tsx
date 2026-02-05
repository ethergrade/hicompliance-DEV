import React from 'react';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, TrendingUp } from 'lucide-react';
import { EPSSPrediction } from '@/hooks/useACNFeeds';

interface EPSSPredictionCardProps {
  prediction: EPSSPrediction;
}

export const EPSSPredictionCard: React.FC<EPSSPredictionCardProps> = ({ prediction }) => {
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return 'bg-red-500/10 text-red-500 border-red-500/30';
      case 'HIGH':
        return 'bg-orange-500/10 text-orange-500 border-orange-500/30';
      case 'MEDIUM':
        return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30';
      case 'LOW':
        return 'bg-green-500/10 text-green-500 border-green-500/30';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <a
      href={prediction.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block p-4 rounded-lg border border-border bg-card/50 hover:bg-card hover:border-primary/30 transition-all duration-200"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground uppercase tracking-wide truncate mb-1">
            {prediction.vendor}
          </p>
          <h4 className="font-semibold text-foreground group-hover:text-primary transition-colors">
            {prediction.cveId}
          </h4>
          <div className="flex items-center gap-1.5 mt-2 text-emerald-500">
            <TrendingUp className="w-3.5 h-3.5" />
            <span className="text-sm font-medium">
              Prediction +{prediction.prediction.toFixed(2)}%
            </span>
          </div>
        </div>
        
        <div className="flex flex-col items-center gap-1">
          <div className={`px-2.5 py-1.5 rounded font-bold text-lg ${getSeverityColor(prediction.severity)}`}>
            {prediction.cvssScore.toFixed(1)}
          </div>
          <Badge 
            variant="outline" 
            className={`text-[9px] px-1.5 py-0 h-4 ${getSeverityColor(prediction.severity)}`}
          >
            {prediction.severity}
          </Badge>
        </div>
      </div>
      
      <div className="flex items-center justify-end mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          Dettagli <ExternalLink className="w-3 h-3" />
        </span>
      </div>
    </a>
  );
};
