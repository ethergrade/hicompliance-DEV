import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { RiskControlGroup } from './RiskControlGroup';
import { 
  ThreatSource, 
  ControlScores, 
  THREAT_SOURCE_LABELS,
  RiskAnalysisAsset 
} from '@/types/riskAnalysis';
import { SECURITY_CONTROLS, getControlsByCategory, getAllCategories } from '@/data/securityControls';
import { ArrowLeft, Save, Shield, AlertTriangle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RiskAnalysisWizardProps {
  assetName: string;
  assets: RiskAnalysisAsset[];
  organizationId: string;
  onBack: () => void;
  onAddAssetSource: (assetName: string, source: ThreatSource) => Promise<RiskAnalysisAsset | null>;
  onUpdateControlScore: (id: string, controlId: string, score: number | null) => Promise<void>;
  onUpdateAsset: (id: string, updates: { notes?: string | null }) => Promise<void>;
  saving: boolean;
}

export const RiskAnalysisWizard: React.FC<RiskAnalysisWizardProps> = ({
  assetName,
  assets,
  organizationId,
  onBack,
  onAddAssetSource,
  onUpdateControlScore,
  onUpdateAsset,
  saving,
}) => {
  const [activeSource, setActiveSource] = useState<ThreatSource>('non_umana');
  const [localNotes, setLocalNotes] = useState('');
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const currentAsset = assets.find(
    a => a.asset_name === assetName && a.threat_source === activeSource
  );

  const existingSources = assets
    .filter(a => a.asset_name === assetName)
    .map(a => a.threat_source);

  // Initialize notes when asset changes
  useEffect(() => {
    if (currentAsset) {
      setLocalNotes(currentAsset.notes || '');
    }
  }, [currentAsset?.id]);

  // Auto-create asset for source if not exists
  const handleSourceChange = async (source: ThreatSource) => {
    setActiveSource(source);
    
    const exists = assets.find(
      a => a.asset_name === assetName && a.threat_source === source
    );
    
    if (!exists) {
      await onAddAssetSource(assetName, source);
    }
  };

  // Debounced notes update
  const handleNotesChange = useCallback((value: string) => {
    setLocalNotes(value);
    
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    debounceRef.current = setTimeout(() => {
      if (currentAsset) {
        onUpdateAsset(currentAsset.id, { notes: value || null });
      }
    }, 1500);
  }, [currentAsset, onUpdateAsset]);

  // Calculate completion for current source
  const getSourceCompletion = (source: ThreatSource): number => {
    const asset = assets.find(a => a.asset_name === assetName && a.threat_source === source);
    if (!asset) return 0;
    
    const scoredControls = Object.values(asset.control_scores).filter(v => v !== null && v !== undefined);
    return Math.round((scoredControls.length / SECURITY_CONTROLS.length) * 100);
  };

  const getRiskColor = (score: number) => {
    if (score >= 71) return 'text-emerald-500';
    if (score >= 41) return 'text-amber-500';
    return 'text-destructive';
  };

  const getRiskLabel = (score: number) => {
    if (score >= 71) return 'Basso';
    if (score >= 41) return 'Medio';
    return 'Alto';
  };

  const getRiskIcon = (score: number) => {
    if (score >= 71) return <CheckCircle className="h-4 w-4" />;
    if (score >= 41) return <AlertTriangle className="h-4 w-4" />;
    return <Shield className="h-4 w-4" />;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Torna
          </Button>
          <div>
            <h2 className="text-xl font-semibold text-foreground">{assetName}</h2>
            <p className="text-sm text-muted-foreground">Valutazione controlli di sicurezza</p>
          </div>
        </div>
        
        {currentAsset && (
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Risk Score</p>
              <div className={cn('flex items-center gap-1 font-semibold', getRiskColor(currentAsset.risk_score))}>
                {getRiskIcon(currentAsset.risk_score)}
                <span>{currentAsset.risk_score}%</span>
                <span className="text-xs">({getRiskLabel(currentAsset.risk_score)})</span>
              </div>
            </div>
            {saving && (
              <Badge variant="outline" className="text-primary">
                <Save className="h-3 w-3 mr-1 animate-pulse" />
                Salvataggio...
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Source Tabs */}
      <Tabs value={activeSource} onValueChange={(v) => handleSourceChange(v as ThreatSource)}>
        <TabsList className="grid w-full grid-cols-3 h-auto">
          {(['non_umana', 'umana_esterna', 'umana_interna'] as ThreatSource[]).map((source) => {
            const completion = getSourceCompletion(source);
            const hasData = existingSources.includes(source);
            
            return (
              <TabsTrigger key={source} value={source} className="flex flex-col gap-1 py-2 px-2 min-h-[48px]">
                <span className="text-xs whitespace-nowrap">{THREAT_SOURCE_LABELS[source]}</span>
                <div className="flex items-center justify-center">
                  {hasData ? (
                    <Badge variant={completion === 100 ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0 h-5 min-w-[40px] flex items-center justify-center">
                      {completion}%
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 min-w-[40px] flex items-center justify-center">
                      Nuovo
                    </Badge>
                  )}
                </div>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {(['non_umana', 'umana_esterna', 'umana_interna'] as ThreatSource[]).map((source) => (
          <TabsContent key={source} value={source} className="space-y-4 mt-4">
            {currentAsset ? (
              <>
                {/* Progress Bar */}
                <Card className="bg-card border-border">
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Completamento</span>
                      <span className="text-sm font-medium">{getSourceCompletion(source)}%</span>
                    </div>
                    <Progress value={getSourceCompletion(source)} className="h-2" />
                  </CardContent>
                </Card>

                {/* Control Groups */}
                <ScrollArea className="h-[calc(100vh-420px)]">
                  <div className="space-y-4 pr-4">
                    {getAllCategories().map((category) => (
                      <RiskControlGroup
                        key={category}
                        category={category}
                        controls={getControlsByCategory(category)}
                        scores={currentAsset.control_scores}
                        onScoreChange={(controlId, score) => {
                          onUpdateControlScore(currentAsset.id, controlId, score);
                        }}
                        disabled={saving}
                      />
                    ))}

                    {/* Notes */}
                    <Card className="bg-card border-border">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base font-medium">Note</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <Textarea
                          placeholder="Note aggiuntive per questo asset e fonte di rischio..."
                          value={localNotes}
                          onChange={(e) => handleNotesChange(e.target.value)}
                          className="min-h-[80px] bg-background"
                        />
                      </CardContent>
                    </Card>
                  </div>
                </ScrollArea>
              </>
            ) : (
              <Card className="bg-card border-border">
                <CardContent className="py-8 text-center">
                  <p className="text-muted-foreground">Caricamento...</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};
