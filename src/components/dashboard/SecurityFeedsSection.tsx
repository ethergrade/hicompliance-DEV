import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink, Shield, AlertTriangle, RefreshCw, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SecurityFeedCard } from './SecurityFeedCard';
import { useACNFeeds, FeedItem } from '@/hooks/useACNFeeds';

type SeverityFilter = 'all' | 'prioritari' | 'critica' | 'alta' | 'media' | 'bassa';

export const SecurityFeedsSection: React.FC = () => {
  const { nis2Feed, threatFeed, isLoading, error, refetch } = useACNFeeds();
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');

  const filteredThreatFeed = useMemo(() => {
    if (severityFilter === 'all') {
      return threatFeed;
    }
    if (severityFilter === 'prioritari') {
      return threatFeed.filter((item) => item.severity === 'critica' || item.severity === 'alta');
    }
    return threatFeed.filter((item) => item.severity === severityFilter);
  }, [threatFeed, severityFilter]);

  const prioritariCount = useMemo(() => {
    return threatFeed.filter(i => i.severity === 'critica' || i.severity === 'alta').length;
  }, [threatFeed]);

  const severityFilters: { value: SeverityFilter; label: string; color: string; count?: number }[] = [
    { value: 'all', label: 'Tutti', color: 'bg-muted text-muted-foreground' },
    { value: 'prioritari', label: '⚡ Prioritari', color: 'bg-destructive/10 text-destructive border-destructive/30', count: prioritariCount },
    { value: 'critica', label: 'Critica', color: 'bg-red-500/10 text-red-500 border-red-500/30' },
    { value: 'alta', label: 'Alta', color: 'bg-orange-500/10 text-orange-500 border-orange-500/30' },
    { value: 'media', label: 'Media', color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30' },
    { value: 'bassa', label: 'Bassa', color: 'bg-green-500/10 text-green-500 border-green-500/30' },
  ];

  const FeedSkeleton = () => (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="p-3 rounded-lg border border-border">
          <Skeleton className="h-4 w-3/4 mb-2" />
          <Skeleton className="h-3 w-full mb-1" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* NIS2 Feed */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-primary/10">
                <Shield className="w-4 h-4 text-primary" />
              </div>
              <CardTitle className="text-lg">Novità NIS2</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={refetch}
                disabled={isLoading}
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
              <a
                href="https://www.acn.gov.it/portale/nis/notizie-ed-eventi"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
              >
                Vedi tutti
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[280px] pr-3">
            {isLoading ? (
              <FeedSkeleton />
            ) : error && nis2Feed.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <p className="text-sm">Nessun aggiornamento disponibile</p>
                <Button variant="ghost" size="sm" onClick={refetch} className="mt-2">
                  Riprova
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {nis2Feed.slice(0, 6).map((item, index) => (
                  <SecurityFeedCard key={index} item={item} />
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Threat Feed */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-destructive/10">
                  <AlertTriangle className="w-4 h-4 text-destructive" />
                </div>
                <CardTitle className="text-lg">Alert Sicurezza</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={refetch}
                  disabled={isLoading}
                >
                  <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                </Button>
                <a
                  href="https://www.csirt.gov.it"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                >
                  Vedi tutti
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
            
            {/* Severity Filter */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <Filter className="w-3.5 h-3.5 text-muted-foreground mr-1" />
              {severityFilters.map((filter) => (
                <button
                  key={filter.value}
                  onClick={() => setSeverityFilter(filter.value)}
                  className={`
                    px-2 py-0.5 text-xs rounded-full border transition-all
                    ${severityFilter === filter.value 
                      ? `${filter.color} border-current font-medium` 
                      : 'bg-transparent text-muted-foreground border-border hover:border-muted-foreground/50'
                    }
                  `}
                >
                  {filter.label}
                  {filter.value === 'prioritari' && filter.count !== undefined && (
                    <span className="ml-1 opacity-70">({filter.count})</span>
                  )}
                  {filter.value !== 'all' && filter.value !== 'prioritari' && (
                    <span className="ml-1 opacity-70">
                      ({threatFeed.filter(i => i.severity === filter.value).length})
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[250px] pr-3">
            {isLoading ? (
              <FeedSkeleton />
            ) : error && threatFeed.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <p className="text-sm">Nessun aggiornamento disponibile</p>
                <Button variant="ghost" size="sm" onClick={refetch} className="mt-2">
                  Riprova
                </Button>
              </div>
            ) : filteredThreatFeed.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <p className="text-sm">Nessun alert con severity "{severityFilter}"</p>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setSeverityFilter('all')} 
                  className="mt-2"
                >
                  Mostra tutti
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredThreatFeed.slice(0, 6).map((item, index) => (
                  <SecurityFeedCard key={index} item={item} />
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};
