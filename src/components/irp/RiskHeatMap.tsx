import React, { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RiskAnalysisAsset, ThreatSource, THREAT_SOURCE_LABELS, CATEGORY_LABELS, SecurityControlCategory } from '@/types/riskAnalysis';
import { SECURITY_CONTROLS, getAllCategories, getControlsByCategory } from '@/data/securityControls';
import { useDocumentSave } from '@/hooks/useDocumentSave';
import { cn } from '@/lib/utils';
import { FileDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface RiskHeatMapProps {
  assets: RiskAnalysisAsset[];
}

const ALL_SOURCES: ThreatSource[] = ['non_umana', 'umana_esterna', 'umana_interna'];
const ALL_CATEGORIES: SecurityControlCategory[] = ['sicurezza_fisica', 'controllo_accessi', 'gestione_documenti', 'sicurezza_it', 'continuita_operativa', 'organizzativo', 'compliance'];

export const RiskHeatMap: React.FC<RiskHeatMapProps> = ({ assets }) => {
  const [selectedSource, setSelectedSource] = useState<ThreatSource>('non_umana');
  const [selectedCategory, setSelectedCategory] = useState<SecurityControlCategory | 'all'>('all');
  const [exporting, setExporting] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportSources, setExportSources] = useState<ThreatSource[]>([...ALL_SOURCES]);
  const [exportCategories, setExportCategories] = useState<SecurityControlCategory[]>([...ALL_CATEGORIES]);
  const heatmapRef = useRef<HTMLDivElement>(null);
  const { saveToDocuments } = useDocumentSave();

  // Get unique asset names
  const assetNames = [...new Set(assets.map(a => a.asset_name))];

  // Filter assets by selected source
  const filteredAssets = assets.filter(a => a.threat_source === selectedSource);

  // Get controls to display
  const controlsToShow = selectedCategory === 'all' 
    ? SECURITY_CONTROLS 
    : getControlsByCategory(selectedCategory);

  const getScoreColor = (score: number | null | undefined): string => {
    if (score === null || score === undefined) return 'bg-muted/30 text-muted-foreground';
    switch (score) {
      case 0: return 'bg-muted text-white';
      case 1: return 'bg-slate-400/80 text-white';
      case 2: return 'bg-amber-500/80 text-white';
      case 3: return 'bg-emerald-500/80 text-white';
      default: return 'bg-muted/30 text-muted-foreground';
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

  const toggleExportSource = (source: ThreatSource) => {
    setExportSources(prev => 
      prev.includes(source) 
        ? prev.filter(s => s !== source)
        : [...prev, source]
    );
  };

  const toggleExportCategory = (category: SecurityControlCategory) => {
    setExportCategories(prev => 
      prev.includes(category) 
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  // Get controls filtered by export categories
  const getExportControls = () => {
    return SECURITY_CONTROLS.filter(c => exportCategories.includes(c.category));
  };

  const handleExportPDF = async () => {
    if (!heatmapRef.current || exportSources.length === 0 || exportCategories.length === 0) return;
    
    setExporting(true);
    setShowExportDialog(false);
    
    try {
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });

      const today = new Date().toLocaleDateString('it-IT');
      let currentY = 15;

      // Title
      pdf.setFontSize(16);
      pdf.text('Analisi Rischi - Heat Map', 14, currentY);
      currentY += 7;
      pdf.setFontSize(10);
      pdf.text(`Data: ${today}`, 14, currentY);
      currentY += 5;
      pdf.text(`Fonti incluse: ${exportSources.map(s => THREAT_SOURCE_LABELS[s]).join(', ')}`, 14, currentY);
      currentY += 5;
      pdf.text(`Categorie: ${exportCategories.map(c => CATEGORY_LABELS[c]).join(', ')}`, 14, currentY);
      currentY += 10;

      // Capture heatmap for each selected source
      for (let i = 0; i < exportSources.length; i++) {
        const source = exportSources[i];
        
        // Temporarily switch to this source and set category to 'all' for capture
        // We'll show only export categories in the captured view
        setSelectedSource(source);
        setSelectedCategory('all');
        
        // Wait for render
        await new Promise(resolve => setTimeout(resolve, 100));

        const canvas = await html2canvas(heatmapRef.current, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#1a1a2e',
          logging: false,
        });

        // Add page break if not first
        if (i > 0) {
          pdf.addPage();
          currentY = 15;
        }

        // Add source title
        pdf.setFontSize(12);
        pdf.text(`Fonte: ${THREAT_SOURCE_LABELS[source]}`, 14, currentY);
        currentY += 8;

        // Add canvas as image
        const imgData = canvas.toDataURL('image/png');
        const pdfWidth = pdf.internal.pageSize.getWidth() - 28;
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        
        pdf.addImage(imgData, 'PNG', 14, currentY, pdfWidth, Math.min(pdfHeight, pdf.internal.pageSize.getHeight() - currentY - 10));
      }

      // Generate blob
      const pdfBlob = pdf.output('blob');
      const fileName = `Analisi_Rischi_HeatMap_${new Date().toISOString().split('T')[0]}.pdf`;

      // Download file
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);

      // Save to documents
      const saved = await saveToDocuments({
        blob: pdfBlob,
        fileName,
        category: 'Tecnico',
      });

      if (saved) {
        toast.success('PDF esportato e salvato in Gestione Documenti');
      } else {
        toast.success('PDF esportato');
      }
    } catch (error) {
      console.error('Error exporting PDF:', error);
      toast.error('Errore nell\'esportazione PDF');
    } finally {
      setExporting(false);
    }
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
          <div className="flex flex-wrap items-center justify-between gap-4">
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

            {/* Export PDF Button */}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setShowExportDialog(true)}
              disabled={exporting}
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <FileDown className="h-4 w-4 mr-1" />
              )}
              Esporta PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Export Dialog */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Esporta PDF Heat Map</DialogTitle>
            <DialogDescription>
              Seleziona le fonti di rischio e le categorie di controlli da includere nel report
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Sources Selection */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Fonti di Rischio</Label>
              <div className="grid grid-cols-1 gap-2">
                {ALL_SOURCES.map((source) => (
                  <div key={source} className="flex items-center space-x-3">
                    <Checkbox
                      id={`export-source-${source}`}
                      checked={exportSources.includes(source)}
                      onCheckedChange={() => toggleExportSource(source)}
                    />
                    <Label htmlFor={`export-source-${source}`} className="cursor-pointer text-sm">
                      {THREAT_SOURCE_LABELS[source]}
                  </Label>
                </div>
              ))}
              </div>
            </div>

            {/* Categories Selection */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Categorie di Controlli</Label>
              <div className="grid grid-cols-2 gap-2">
                {ALL_CATEGORIES.map((category) => (
                  <div key={category} className="flex items-center space-x-3">
                    <Checkbox
                      id={`export-cat-${category}`}
                      checked={exportCategories.includes(category)}
                      onCheckedChange={() => toggleExportCategory(category)}
                    />
                    <Label htmlFor={`export-cat-${category}`} className="cursor-pointer text-sm">
                      {CATEGORY_LABELS[category]}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExportDialog(false)}>
              Annulla
            </Button>
            <Button 
              onClick={handleExportPDF} 
              disabled={exportSources.length === 0 || exportCategories.length === 0 || exporting}
            >
              {exporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Esportazione...
                </>
              ) : (
                <>
                  <FileDown className="h-4 w-4 mr-2" />
                  Esporta ({exportSources.length} fonti)
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Legend */}
      <Card className="bg-card border-border">
        <CardContent className="py-2">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <span className="text-muted-foreground">Legenda:</span>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded bg-muted/30" />
              <span>N/V</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded bg-muted" />
              <span>0 - Non presente</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded bg-slate-400/80" />
              <span>1 - Non incide</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded bg-amber-500/60" />
              <span>2 - Parziale</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded bg-emerald-500/60" />
              <span>3 - Totale</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Heatmap - wrapped in ref for PDF export */}
      <div ref={heatmapRef}>
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
                          asset.risk_score >= 71 ? 'text-emerald-600 dark:text-emerald-400' :
                          asset.risk_score >= 41 ? 'text-amber-600 dark:text-amber-400' :
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
                                  avg >= 2.5 ? 'bg-emerald-500/80 text-white' :
                                  avg >= 1.5 ? 'bg-amber-500/80 text-white' :
                                  'bg-slate-400/80 text-white'
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
                          asset.risk_score >= 71 ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' :
                          asset.risk_score >= 41 ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' :
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
    </div>
  );
};
