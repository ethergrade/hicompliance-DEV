import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, ExternalLink, ArrowRight, AlertTriangle } from 'lucide-react';
import { useACNFeeds, EPSSPrediction } from '@/hooks/useACNFeeds';

const EPSSWidgetItem: React.FC<{ prediction: EPSSPrediction }> = ({ prediction }) => {
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
      className="group flex items-center justify-between p-3 rounded-lg border border-border bg-card/30 hover:bg-card hover:border-primary/30 transition-all duration-200"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={`px-2 py-1 rounded font-bold text-sm ${getSeverityColor(prediction.severity)}`}>
          {prediction.cvssScore.toFixed(1)}
        </div>
        <div className="min-w-0">
          <p className="font-medium text-sm text-foreground group-hover:text-primary transition-colors truncate">
            {prediction.cveId}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {prediction.vendor}
          </p>
        </div>
      </div>
      
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center gap-1 text-emerald-500">
          <TrendingUp className="w-3 h-3" />
          <span className="text-xs font-medium">+{prediction.prediction.toFixed(1)}%</span>
        </div>
        <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </a>
  );
};

export const EPSSWidget: React.FC = () => {
  const { epssFeed, cveFeed, isLoading } = useACNFeeds();
  
  // Mostra top 4 EPSS predictions
  const topPredictions = epssFeed.slice(0, 4);
  
  // Conta CVE critiche/alte
  const criticalCount = cveFeed.filter(c => c.severity === 'critica').length;
  const highCount = cveFeed.filter(c => c.severity === 'alta').length;

  if (isLoading) {
    return (
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            EPSS Predictions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            EPSS Predictions
          </CardTitle>
          <div className="flex items-center gap-2">
            {criticalCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                <AlertTriangle className="w-3 h-3 mr-1" />
                {criticalCount} Critiche
              </Badge>
            )}
            {highCount > 0 && (
              <Badge className="bg-orange-500/10 text-orange-500 border-orange-500/30 text-xs">
                {highCount} Alte
              </Badge>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          CVE con probabilità di exploit in crescita
        </p>
      </CardHeader>
      
      <CardContent className="space-y-2">
        {topPredictions.length > 0 ? (
          <>
            {topPredictions.map((prediction, index) => (
              <EPSSWidgetItem key={index} prediction={prediction} />
            ))}
            
            <Link 
              to="/cyber-news"
              className="flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-border hover:border-primary/30 hover:bg-muted/30 transition-all duration-200 text-sm text-muted-foreground hover:text-primary"
            >
              Vedi tutti i feed
              <ArrowRight className="w-4 h-4" />
            </Link>
          </>
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nessuna previsione EPSS disponibile</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
