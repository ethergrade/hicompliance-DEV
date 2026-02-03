import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import { RiskAnalysisWizard } from './RiskAnalysisWizard';
import { useRiskAnalysis } from '@/hooks/useRiskAnalysis';
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
  Info
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

  const { saveToDocuments } = useDocumentSave();
  
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [newAssetName, setNewAssetName] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  const assetSummaries = getAssetSummaries();

  const handleAddAsset = async () => {
    if (!newAssetName.trim()) {
      toast.error('Inserisci un nome per l\'asset');
      return;
    }

    const result = await addAsset(newAssetName.trim(), 'non_umana');
    if (result) {
      setNewAssetName('');
      setDialogOpen(false);
      setSelectedAsset(newAssetName.trim());
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
      case 'low': return <CheckCircle className="h-4 w-4 text-green-400" />;
      case 'medium': return <AlertTriangle className="h-4 w-4 text-yellow-400" />;
      case 'high': return <Shield className="h-4 w-4 text-red-400" />;
    }
  };

  const getRiskBadgeVariant = (level: 'low' | 'medium' | 'high') => {
    switch (level) {
      case 'low': return 'bg-green-500/20 text-green-400 border-green-500/50';
      case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      case 'high': return 'bg-red-500/20 text-red-400 border-red-500/50';
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
              {assets.length > 0 && (
                <Button variant="outline" size="sm" onClick={handleExportExcel}>
                  <FileSpreadsheet className="h-4 w-4 mr-1" />
                  Esporta Excel
                </Button>
              )}
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Aggiungi Asset
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Nuovo Asset</DialogTitle>
                  </DialogHeader>
                  <div className="py-4">
                    <Input
                      placeholder="Nome asset (es. Server Applicazioni)"
                      value={newAssetName}
                      onChange={(e) => setNewAssetName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddAsset()}
                    />
                  </div>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline">Annulla</Button>
                    </DialogClose>
                    <Button onClick={handleAddAsset} disabled={saving}>
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

      {/* Legend */}
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

      {/* Asset List */}
      {assetSummaries.length === 0 ? (
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
      ) : (
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
