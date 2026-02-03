import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RiskAnalysisAsset, ThreatSource, THREAT_SOURCE_LABELS, CATEGORY_LABELS, SecurityControlCategory } from '@/types/riskAnalysis';
import { SECURITY_CONTROLS, getAllCategories, getControlsByCategory } from '@/data/securityControls';
import { cn } from '@/lib/utils';

interface RiskHeatMapProps {
  assets: RiskAnalysisAsset[];
}

export const RiskHeatMap: React.FC<RiskHeatMapProps> = ({ assets }) => {
  const [selectedSource, setSelectedSource] = useState<ThreatSource>('non_umana');
  const [selectedCategory, setSelectedCategory] = useState<SecurityControlCategory | 'all'>('all');

  // Get unique asset names
  const assetNames = [...new Set(assets.map(a => a.asset_name))];

  // Filter assets by selected source
  const filteredAssets = assets.filter(a => a.threat_source === selectedSource);

  // Get controls to display
  const controlsToShow = selectedCategory === 'all' 
    ? SECURITY_CONTROLS 
    : getControlsByCategory(selectedCategory);

  const getScoreColor = (score: number | null | undefined): string => {
    if (score === null || score === undefined) return 'bg-muted/30';
    switch (score) {
      case 0: return 'bg-muted text-muted-foreground';
      case 1: return 'bg-destructive/60 text-destructive-foreground';
      case 2: return 'bg-warning/60 text-warning-foreground';
      case 3: return 'bg-primary/60 text-primary-foreground';
      default: return 'bg-muted/30';
    }
  };

  const getScoreLabel = (score: number | null | undefined): string => {
    if (score === null || score === undefined) return 'Non valutato';
    switch (score) {
      case 0: return 'Non presente';
      case 1: return 'Non incide';
      case 2: return 'Parziale';
      case 3: return 'Totale';
      default: return 'N/A';
    }
  };

  // Calculate category averages for each asset
  const getCategoryAverage = (asset: RiskAnalysisAsset, category: SecurityControlCategory): number | null => {
    const controls = getControlsByCategory(category);
    const scores = controls
      .map(c => asset.control_scores[c.id])
      .filter((s): s is number => typeof s === 'number');
    
    if (scores.length === 0) return null;
    return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
  };

  if (assetNames.length === 0) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">Nessun dato per la heatmap</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="bg-card border-border">
        <CardContent className="py-3">
          <div className="flex flex-wrap items-center gap-4">
            {/* Source Filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Fonte:</span>
              <Tabs value={selectedSource} onValueChange={(v) => setSelectedSource(v as ThreatSource)}>
                <TabsList className="h-8">
                  {(['non_umana', 'umana_esterna', 'umana_interna'] as ThreatSource[]).map((source) => (
                    <TabsTrigger key={source} value={source} className="text-xs px-2 h-6">
                      {source === 'non_umana' ? 'Non Umane' : source === 'umana_esterna' ? 'Esterne' : 'Interne'}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>

            {/* Category Filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Categoria:</span>
              <Tabs value={selectedCategory} onValueChange={(v) => setSelectedCategory(v as SecurityControlCategory | 'all')}>
                <TabsList className="h-8">
                  <TabsTrigger value="all" className="text-xs px-2 h-6">Tutte</TabsTrigger>
                  {getAllCategories().map((cat) => (
                    <TabsTrigger key={cat} value={cat} className="text-xs px-2 h-6">
                      {CATEGORY_LABELS[cat].split(' ')[0]}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <Card className="bg-card border-border">
        <CardContent className="py-2">
          <div className="flex items-center gap-4 text-xs">
            <span className="text-muted-foreground">Legenda:</span>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded bg-muted/30" />
              <span>N/V</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded bg-muted" />
              <span>0</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded bg-destructive/60" />
              <span>1</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded bg-warning/60" />
              <span>2</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded bg-primary/60" />
              <span>3</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Heatmap */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Matrice Controlli - {THREAT_SOURCE_LABELS[selectedSource]}</span>
            <Badge variant="secondary" className="font-normal">
              {assetNames.length} asset × {controlsToShow.length} controlli
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TooltipProvider delayDuration={100}>
            <ScrollArea className="w-full">
              <div className="min-w-max">
                {/* Header row with controls */}
                <div className="flex">
                  <div className="w-40 shrink-0 p-2 text-xs font-medium text-muted-foreground sticky left-0 bg-card z-10">
                    Asset
                  </div>
                  {controlsToShow.map((control) => (
                    <Tooltip key={control.id}>
                      <TooltipTrigger asChild>
                        <div className="w-8 h-16 shrink-0 flex items-end justify-center pb-1">
                          <span 
                            className="text-[10px] text-muted-foreground whitespace-nowrap origin-bottom-left rotate-[-60deg] translate-x-2"
                            style={{ maxWidth: '60px' }}
                          >
                            {control.name.length > 12 ? control.name.slice(0, 12) + '...' : control.name}
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <p className="text-xs font-medium">{control.name}</p>
                        <p className="text-xs text-muted-foreground">{CATEGORY_LABELS[control.category]}</p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                  {/* Risk Score column */}
                  <div className="w-12 shrink-0 p-2 text-xs font-medium text-muted-foreground text-center">
                    Score
                  </div>
                </div>

                {/* Data rows */}
                {assetNames.map((assetName) => {
                  const asset = filteredAssets.find(a => a.asset_name === assetName);
                  
                  return (
                    <div key={assetName} className="flex border-t border-border/50">
                      <div className="w-40 shrink-0 p-2 text-xs font-medium text-foreground truncate sticky left-0 bg-card z-10">
                        {assetName}
                      </div>
                      {controlsToShow.map((control) => {
                        const score = asset?.control_scores[control.id];
                        
                        return (
                          <Tooltip key={control.id}>
                            <TooltipTrigger asChild>
                              <div 
                                className={cn(
                                  'w-8 h-8 shrink-0 flex items-center justify-center text-[10px] font-medium border-l border-border/30 transition-colors',
                                  getScoreColor(score),
                                  !asset && 'opacity-50'
                                )}
                              >
                                {score !== null && score !== undefined ? score : '-'}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p className="text-xs font-medium">{control.name}</p>
                              <p className="text-xs">{getScoreLabel(score)}</p>
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                      {/* Risk Score */}
                      <div className={cn(
                        'w-12 shrink-0 flex items-center justify-center text-xs font-semibold border-l border-border',
                        asset ? (
                          asset.risk_score >= 71 ? 'text-primary' :
                          asset.risk_score >= 41 ? 'text-warning' :
                          'text-destructive'
                        ) : 'text-muted-foreground'
                      )}>
                        {asset ? `${asset.risk_score}%` : '-'}
                      </div>
                    </div>
                  );
                })}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </TooltipProvider>
        </CardContent>
      </Card>

      {/* Category Summary */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Riepilogo per Categoria</CardTitle>
        </CardHeader>
        <CardContent>
          <TooltipProvider delayDuration={100}>
            <ScrollArea className="w-full">
              <div className="min-w-max">
                {/* Header */}
                <div className="flex">
                  <div className="w-40 shrink-0 p-2 text-xs font-medium text-muted-foreground sticky left-0 bg-card z-10">
                    Asset
                  </div>
                  {getAllCategories().map((category) => (
                    <div key={category} className="w-20 shrink-0 p-2 text-xs font-medium text-muted-foreground text-center">
                      {CATEGORY_LABELS[category].split(' ')[0]}
                    </div>
                  ))}
                  <div className="w-16 shrink-0 p-2 text-xs font-medium text-muted-foreground text-center">
                    Media
                  </div>
                </div>

                {/* Data rows */}
                {assetNames.map((assetName) => {
                  const asset = filteredAssets.find(a => a.asset_name === assetName);
                  
                  return (
                    <div key={assetName} className="flex border-t border-border/50">
                      <div className="w-40 shrink-0 p-2 text-xs font-medium text-foreground truncate sticky left-0 bg-card z-10">
                        {assetName}
                      </div>
                      {getAllCategories().map((category) => {
                        const avg = asset ? getCategoryAverage(asset, category) : null;
                        
                        return (
                          <Tooltip key={category}>
                            <TooltipTrigger asChild>
                              <div 
                                className={cn(
                                  'w-20 h-10 shrink-0 flex items-center justify-center text-xs font-medium border-l border-border/30',
                                  avg === null ? 'bg-muted/30 text-muted-foreground' :
                                  avg >= 2.5 ? 'bg-primary/40 text-primary-foreground' :
                                  avg >= 1.5 ? 'bg-warning/40 text-warning-foreground' :
                                  'bg-destructive/40 text-destructive-foreground'
                                )}
                              >
                                {avg !== null ? avg.toFixed(1) : '-'}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p className="text-xs font-medium">{CATEGORY_LABELS[category]}</p>
                              <p className="text-xs">Media: {avg !== null ? avg.toFixed(2) : 'N/V'}</p>
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                      {/* Overall average */}
                      <div className={cn(
                        'w-16 shrink-0 flex items-center justify-center text-xs font-semibold border-l border-border',
                        asset ? (
                          asset.risk_score >= 71 ? 'bg-primary/20 text-primary' :
                          asset.risk_score >= 41 ? 'bg-warning/20 text-warning' :
                          'bg-destructive/20 text-destructive'
                        ) : 'text-muted-foreground'
                      )}>
                        {asset ? `${asset.risk_score}%` : '-'}
                      </div>
                    </div>
                  );
                })}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </TooltipProvider>
        </CardContent>
      </Card>
    </div>
  );
};
