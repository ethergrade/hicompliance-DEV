import React from 'react';
import { ExternalLink, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { FeedItem } from '@/hooks/useACNFeeds';

interface SecurityFeedCardProps {
  item: FeedItem;
}

export const SecurityFeedCard: React.FC<SecurityFeedCardProps> = ({ item }) => {
  const getSeverityColor = (severity?: string) => {
    switch (severity) {
      case 'critica':
        return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'alta':
        return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
      case 'media':
        return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      case 'bassa':
        return 'bg-green-500/10 text-green-500 border-green-500/20';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  const getSeverityLabel = (severity?: string) => {
    switch (severity) {
      case 'critica':
        return 'CRITICA';
      case 'alta':
        return 'ALTA';
      case 'media':
        return 'MEDIA';
      case 'bassa':
        return 'BASSA';
      default:
        return null;
    }
  };

  const getEpssColor = (score: number) => {
    if (score >= 50) return 'text-red-500';
    if (score >= 20) return 'text-orange-500';
    if (score >= 5) return 'text-yellow-500';
    return 'text-emerald-500';
  };

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors group"
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <h4 className="text-sm font-medium text-foreground line-clamp-2 group-hover:text-primary transition-colors">
          {item.title}
        </h4>
        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      
      <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
        {item.description}
      </p>
      
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {item.date}
          </span>
          
          {/* Show EPSS score for CVE items */}
          {item.type === 'cve' && item.epssScore !== undefined && (
            <div className={`flex items-center gap-1 text-xs font-medium ${getEpssColor(item.epssScore)}`}>
              <TrendingUp className="w-3 h-3" />
              <span>EPSS {item.epssScore.toFixed(2)}%</span>
            </div>
          )}
        </div>
        
        {(item.type === 'threat' || item.type === 'cve') && item.severity && (
          <Badge 
            variant="outline" 
            className={`text-[10px] px-1.5 py-0 h-5 font-semibold ${getSeverityColor(item.severity)}`}
          >
            {getSeverityLabel(item.severity)}
          </Badge>
        )}
      </div>
    </a>
  );
};