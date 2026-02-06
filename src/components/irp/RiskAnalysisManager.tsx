import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RiskAnalysisWizard } from './RiskAnalysisWizard';
import { RiskHeatMap } from './RiskHeatMap';
import { useRiskAnalysis } from '@/hooks/useRiskAnalysis';
import { useCriticalInfrastructure } from '@/hooks/useCriticalInfrastructure';
import { useDocumentSave } from '@/hooks/useDocumentSave';
import { THREAT_SOURCE_LABELS, ThreatSource, AssetSummary } from '@/types/riskAnalysis';
import { SECURITY_CONTROLS, getAllCategories, getControlsByCategory } from '@/data/securityControls';
import { CATEGORY_LABELS } from '@/types/riskAnalysis';
import { 
  Plus, 
  FileSpreadsheet, 
  ChevronRight, 
  Trash2, 
  Shield,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Info,
  LayoutGrid,
  List,
  Database
} from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { cn } from '@/lib/utils';

export const RiskAnalysisManager: React.FC = () => {
  const {
    assets,
    loading,
    saving,
    organizationId,
    addAsset,
    updateAsset,
    updateControlScore,
    deleteAssetAllSources,
    getAssetSummaries,
    getAssetByNameAndSource,
  } = useRiskAnalysis();

  const { assets: infrastructureAssets, loading: loadingInfrastructure } = useCriticalInfrastructure();
  const { saveToDocuments } = useDocumentSave();
  
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [newAssetName, setNewAssetName] = useState('');
  const [selectedInfraAsset, setSelectedInfraAsset] = useState<string>('');
  const [addMode, setAddMode] = useState<'select' | 'manual'>('select');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'heatmap'>('list');
  const [syncToInfrastructure, setSyncToInfrastructure] = useState(true);

  const assetSummaries = getAssetSummaries();

  // Get infrastructure assets not yet in risk analysis
  // Use asset_id as unique identifier to handle duplicate component_name
  const availableInfraAssets = infrastructureAssets.filter(infra => {
    const displayName = infra.component_name 
      ? `${infra.component_name} (${infra.asset_id})` 
      : infra.asset_id;
    
    // Check if this specific asset (by display name or asset_id) is already imported
    return !assetSummaries.some(s => 
      s.assetName === displayName || 
      s.assetName === infra.asset_id
    );
  });

  const handleAddAsset = async () => {
    let assetName = '';
    
    if (addMode === 'select') {
      if (!selectedInfraAsset) {
        toast.error('Seleziona un asset dall\'infrastruttura critica');
        return;
      }
      assetName = selectedInfraAsset;
    } else {
      if (!newAssetName.trim()) {
        toast.error('Inserisci un nome per l\'asset');
        return;
      }
      assetName = newAssetName.trim();
    }

    // For manual mode, optionally sync to infrastructure
    const shouldSync = addMode === 'manual' && syncToInfrastructure;
    const result = await addAsset(assetName, 'non_umana', shouldSync);
    if (result) {
      setNewAssetName('');
      setSelectedInfraAsset('');
      setDialogOpen(false);
      setSyncToInfrastructure(true);
      setSelectedAsset(assetName);
    }
  };

  const handleExportExcel = async () => {
    if (assets.length === 0) {
      toast.error('Nessun dato da esportare');
      return;
    }

    try {
      // Create workbook
      const wb = XLSX.utils.book_new();

      // Get unique asset names
      const assetNames = [...new Set(assets.map(a => a.asset_name))];

      // Create header row with controls
      const headers = ['Asset', 'Fonte di Rischio', 'Risk Score (%)'];
      getAllCategories().forEach(category => {
        getControlsByCategory(category).forEach(control => {
          headers.push(control.name);
        });
      });
      headers.push('Note');

      // Create data rows
      const rows = assets.map(asset => {
        const row: (string | number | null)[] = [
          asset.asset_name,
          THREAT_SOURCE_LABELS[asset.threat_source],
          asset.risk_score,
        ];

        getAllCategories().forEach(category => {
          getControlsByCategory(category).forEach(control => {
            row.push(asset.control_scores[control.id] ?? '');
          });
        });

        row.push(asset.notes || '');
        return row;
      });

      // Create worksheet
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

      // Set column widths
      ws['!cols'] = [
        { wch: 25 }, // Asset
        { wch: 20 }, // Fonte
        { wch: 12 }, // Risk Score
        ...SECURITY_CONTROLS.map(() => ({ wch: 8 })),
        { wch: 40 }, // Note
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Analisi Rischi');

      // Add legend sheet
      const legendData = [
        ['LEGENDA SCORE'],
        ['0', 'Non presente / Non applicabile'],
        ['1', 'Presente ma non incide sulla mitigazione'],
        ['2', 'Presente e parzialmente implementata'],
        ['3', 'Presente e totalmente implementata'],
        [],
        ['FONTI DI RISCHIO'],
        ['Fonti Non Umane', 'Incendi, allagamenti, guasti hw, eventi naturali'],
        ['Fonti Umane Esterne', 'Attacchi hacker, malware, social engineering'],
        ['Fonti Umane Interne', 'Errori dipendenti, accessi non autorizzati, insider threat'],
      ];
      const legendWs = XLSX.utils.aoa_to_sheet(legendData);
      legendWs['!cols'] = [{ wch: 25 }, { wch: 50 }];
      XLSX.utils.book_append_sheet(wb, legendWs, 'Legenda');

      // Generate blob
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      
      // Download file
      const fileName = `Analisi_Rischi_${new Date().toISOString().split('T')[0]}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);

      // Save to documents
      const saved = await saveToDocuments({
        blob,
        fileName,
        category: 'Tecnico',
      });

      if (saved) {
        toast.success('Excel esportato e salvato in Gestione Documenti');
      } else {
        toast.success('Excel esportato');
      }
    } catch (error) {
      console.error('Error exporting Excel:', error);
      toast.error('Errore nell\'esportazione');
    }
  };

  const getRiskIcon = (level: 'low' | 'medium' | 'high') => {
    switch (level) {
      case 'low': return <CheckCircle className="h-4 w-4 text-primary" />;
      case 'medium': return <AlertTriangle className="h-4 w-4 text-warning" />;
      case 'high': return <Shield className="h-4 w-4 text-destructive" />;
    }
  };

  const getRiskBadgeVariant = (level: 'low' | 'medium' | 'high') => {
    switch (level) {
      case 'low': return 'bg-primary/20 text-primary border-primary/50';
      case 'medium': return 'bg-warning/20 text-warning border-warning/50';
      case 'high': return 'bg-destructive/20 text-destructive border-destructive/50';
    }
  };

  if (loading) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="py-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="mt-2 text-muted-foreground">Caricamento...</p>
        </CardContent>
      </Card>
    );
  }

  // Show wizard if asset is selected
  if (selectedAsset && organizationId) {
    return (
      <RiskAnalysisWizard
        assetName={selectedAsset}
        assets={assets.filter(a => a.asset_name === selectedAsset)}
        organizationId={organizationId}
        onBack={() => setSelectedAsset(null)}
        onAddAssetSource={addAsset}
        onUpdateControlScore={updateControlScore}
        onUpdateAsset={updateAsset}
        saving={saving}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Analisi Rischi</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Valuta le misure di sicurezza per ogni asset
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* View Toggle */}
              {assets.length > 0 && (
                <div className="flex items-center border rounded-md">
                  <Button
                    variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="rounded-r-none"
                    onClick={() => setViewMode('list')}
                  >
                    <List className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'heatmap' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="rounded-l-none"
                    onClick={() => setViewMode('heatmap')}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                </div>
              )}
              {assets.length > 0 && (
                <Button variant="outline" size="sm" onClick={handleExportExcel}>
                  <FileSpreadsheet className="h-4 w-4 mr-1" />
                  Esporta Excel
                </Button>
              )}
              <Dialog open={dialogOpen} onOpenChange={(open) => {
                setDialogOpen(open);
                if (!open) {
                  setNewAssetName('');
                  setSelectedInfraAsset('');
                  setAddMode('select');
                  setSyncToInfrastructure(true);
                }
              }}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Aggiungi Asset
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Nuovo Asset per Analisi Rischi</DialogTitle>
                  </DialogHeader>
                  <div className="py-4 space-y-4">
                    <Tabs value={addMode} onValueChange={(v) => setAddMode(v as 'select' | 'manual')}>
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="select" className="text-xs">
                          <Database className="h-3.5 w-3.5 mr-1.5" />
                          Da Infrastruttura
                        </TabsTrigger>
                        <TabsTrigger value="manual" className="text-xs">
                          <Plus className="h-3.5 w-3.5 mr-1.5" />
                          Nuovo Manuale
                        </TabsTrigger>
                      </TabsList>
                      
                      <TabsContent value="select" className="mt-4 space-y-3">
                        {loadingInfrastructure ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                          </div>
                        ) : availableInfraAssets.length === 0 ? (
                          <div className="text-center py-4 text-muted-foreground text-sm">
                            <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p>Nessun asset disponibile.</p>
                            <p className="text-xs mt-1">
                              {infrastructureAssets.length > 0 
                                ? `${infrastructureAssets.length} asset presenti, ma già tutti importati in Analisi Rischi.`
                                : "Aggiungi asset in Infrastruttura Critica prima."}
                            </p>
                          </div>
                        ) : (
                          <>
                            <Label className="text-sm text-muted-foreground">
                              Seleziona un asset dall'Infrastruttura Critica
                            </Label>
                            <Select value={selectedInfraAsset} onValueChange={setSelectedInfraAsset}>
                              <SelectTrigger>
                                <SelectValue placeholder="Seleziona asset..." />
                              </SelectTrigger>
                              <SelectContent>
                                {availableInfraAssets.map((infra) => {
                                  // Use display name with asset_id to disambiguate duplicates
                                  const displayName = infra.component_name 
                                    ? `${infra.component_name} (${infra.asset_id})` 
                                    : infra.asset_id;
                                  return (
                                    <SelectItem key={infra.id} value={displayName}>
                                      <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="text-[10px]">
                                          {infra.asset_id}
                                        </Badge>
                                        <span>{infra.component_name || '(senza nome)'}</span>
                                      </div>
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              {availableInfraAssets.length} asset disponibili su {infrastructureAssets.length} totali
                            </p>
                          </>
                        )}
                      </TabsContent>
                      
                      <TabsContent value="manual" className="mt-4 space-y-4">
                        <div className="space-y-2">
                          <Label className="text-sm text-muted-foreground">
                            Inserisci il nome dell'asset
                          </Label>
                          <Input
                            placeholder="es. Server Applicazioni"
                            value={newAssetName}
                            onChange={(e) => setNewAssetName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddAsset()}
                          />
                        </div>
                        
                        <div className="flex items-center space-x-2 pt-2 border-t">
                          <Checkbox
                            id="sync-infrastructure"
                            checked={syncToInfrastructure}
                            onCheckedChange={(checked) => setSyncToInfrastructure(checked === true)}
                          />
                          <label
                            htmlFor="sync-infrastructure"
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                          >
                            Sincronizza con Infrastruttura Critica
                          </label>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Se attivo, l'asset verrà automaticamente aggiunto anche in Infrastruttura Critica con un nuovo ID (C-XX).
                        </p>
                      </TabsContent>
                    </Tabs>
                  </div>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline">Annulla</Button>
                    </DialogClose>
                    <Button 
                      onClick={handleAddAsset} 
                      disabled={saving || (addMode === 'select' && !selectedInfraAsset) || (addMode === 'manual' && !newAssetName.trim())}
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                      Aggiungi
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>

        {/* Stats */}
        {assetSummaries.length > 0 && (
          <CardContent className="pt-0">
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Asset:</span>
                <Badge variant="secondary">{assetSummaries.length}</Badge>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Valutazioni:</span>
                <Badge variant="secondary">{assets.length}</Badge>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Legend - only show in list mode */}
      {viewMode === 'list' && (
        <Card className="bg-card border-border">
          <CardContent className="py-3">
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Info className="h-3 w-3" />
                <span>Score:</span>
              </div>
              <span>0 = Non presente</span>
              <span>1 = Non incide</span>
              <span>2 = Parziale</span>
              <span>3 = Totale</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Heatmap View */}
      {viewMode === 'heatmap' && assetSummaries.length > 0 && (
        <RiskHeatMap assets={assets} />
      )}

      {/* Asset List View */}
      {viewMode === 'list' && assetSummaries.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center">
            <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">Nessun asset censito</h3>
            <p className="text-muted-foreground mb-4">
              Inizia aggiungendo un asset per valutarne i controlli di sicurezza
            </p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Aggiungi Asset
            </Button>
          </CardContent>
        </Card>
      ) : viewMode === 'list' && (
        <Card className="bg-card border-border">
          <ScrollArea className="max-h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset</TableHead>
                  <TableHead>Fonti Valutate</TableHead>
                  <TableHead>Completezza</TableHead>
                  <TableHead>Rischio</TableHead>
                  <TableHead className="w-[100px]">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assetSummaries.map((summary) => (
                  <TableRow 
                    key={summary.assetName}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedAsset(summary.assetName)}
                  >
                    <TableCell className="font-medium">{summary.assetName}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {(['non_umana', 'umana_esterna', 'umana_interna'] as ThreatSource[]).map((source) => (
                          <Badge
                            key={source}
                            variant={summary.sources.includes(source) ? 'default' : 'outline'}
                            className={cn(
                              'text-[10px] px-1.5',
                              !summary.sources.includes(source) && 'opacity-40'
                            )}
                          >
                            {source === 'non_umana' ? 'NU' : source === 'umana_esterna' ? 'UE' : 'UI'}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 min-w-[120px]">
                        <Progress value={summary.completeness} className="h-2 flex-1" />
                        <span className="text-xs text-muted-foreground w-10">{summary.completeness}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant="outline" 
                        className={cn('flex items-center gap-1 w-fit', getRiskBadgeVariant(summary.riskLevel))}
                      >
                        {getRiskIcon(summary.riskLevel)}
                        {summary.avgScore}%
                      </Badge>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedAsset(summary.assetName)}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Elimina Asset</AlertDialogTitle>
                              <AlertDialogDescription>
                                Sei sicuro di voler eliminare "{summary.assetName}" e tutte le sue valutazioni?
                                Questa azione non può essere annullata.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Annulla</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteAssetAllSources(summary.assetName)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Elimina
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </Card>
      )}
    </div>
  );
};
