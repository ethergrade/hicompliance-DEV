import { useState, useCallback, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Loader2, Plus, Trash2, Server, Database, CalendarIcon, FileSpreadsheet, Save } from 'lucide-react';
import { useCriticalInfrastructure } from '@/hooks/useCriticalInfrastructure';
import { CriticalInfrastructureAsset, CriticalInfrastructureUpdate } from '@/types/infrastructure';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';

const DEBOUNCE_MS = 1500;

export const CriticalInfrastructureManager = () => {
  const { assets, loading, saving, addAsset, updateAsset, deleteAsset } = useCriticalInfrastructure();
  const [pendingUpdates, setPendingUpdates] = useState<Record<string, CriticalInfrastructureUpdate>>({});
  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({});

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      Object.values(debounceTimers.current).forEach(clearTimeout);
    };
  }, []);

  const handleFieldChange = useCallback((assetId: string, field: keyof CriticalInfrastructureUpdate, value: any) => {
    // Update pending state immediately for UI
    setPendingUpdates(prev => ({
      ...prev,
      [assetId]: { ...prev[assetId], [field]: value }
    }));

    // Clear existing timer for this asset
    if (debounceTimers.current[assetId]) {
      clearTimeout(debounceTimers.current[assetId]);
    }

    // Set new debounced save
    debounceTimers.current[assetId] = setTimeout(async () => {
      const updates = { ...pendingUpdates[assetId], [field]: value };
      await updateAsset(assetId, updates);
      setPendingUpdates(prev => {
        const newPending = { ...prev };
        delete newPending[assetId];
        return newPending;
      });
    }, DEBOUNCE_MS);
  }, [updateAsset, pendingUpdates]);

  const getAssetValue = (asset: CriticalInfrastructureAsset, field: keyof CriticalInfrastructureAsset) => {
    return pendingUpdates[asset.id]?.[field as keyof CriticalInfrastructureUpdate] ?? asset[field];
  };

  const handleExportExcel = useCallback(() => {
    const assetData = assets.map(asset => ({
      'ID': asset.asset_id,
      'Componente': asset.component_name,
      'Criticità': asset.criticality || '',
      'Owner': asset.owner_team,
      'Gestione': asset.management_type === 'internal' ? 'Interna' : asset.management_type === 'external' ? 'Esterna' : '',
      'Ubicazione': asset.location,
      'Dati Sensibili': asset.sensitive_data || '',
      'Dipendenze': asset.dependencies,
      'Controlli': asset.main_controls,
      'Backup': asset.has_backup || '',
      'Freq. Backup': asset.backup_frequency,
      'Ultimo Test': asset.last_test_date ? format(parseISO(asset.last_test_date), 'dd/MM/yyyy') : '',
      'RPO (h)': asset.rpo_hours ?? '',
      'RTO (h)': asset.rto_hours ?? '',
      'Runbook': asset.runbook_link,
      'Note IR': asset.ir_notes,
    }));

    const ws = XLSX.utils.json_to_sheet(assetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Infrastruttura Critica');
    XLSX.writeFile(wb, `Infrastruttura_Critica_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  }, [assets]);

  const criticalityBadge = (value: string | null) => {
    if (!value) return null;
    const variants: Record<string, string> = {
      'H': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      'M': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      'L': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    };
    return <Badge className={cn('font-medium', variants[value])}>{value}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const completedAssets = assets.filter(a => a.component_name && a.criticality).length;
  const progress = assets.length > 0 ? Math.round((completedAssets / assets.length) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header con progresso */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Server className="h-5 w-5 text-primary" />
                <span className="font-medium">Asset Censiti:</span>
                <Badge variant="secondary">{assets.length}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" />
                <span className="font-medium">Completati:</span>
                <Badge variant={progress === 100 ? 'default' : 'outline'}>{progress}%</Badge>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {saving && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvataggio...
                </div>
              )}
              <Button variant="outline" onClick={handleExportExcel} disabled={assets.length === 0}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Esporta Excel
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabella Asset Critici */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Asset Critici</CardTitle>
            <Button onClick={addAsset} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Aggiungi Asset
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="w-full">
            <div className="min-w-[1200px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[70px]">ID</TableHead>
                    <TableHead className="w-[180px]">Componente</TableHead>
                    <TableHead className="w-[80px]">Crit.</TableHead>
                    <TableHead className="w-[140px]">Owner</TableHead>
                    <TableHead className="w-[100px]">Gestione</TableHead>
                    <TableHead className="w-[150px]">Ubicazione</TableHead>
                    <TableHead className="w-[80px]">Dati Sens.</TableHead>
                    <TableHead className="w-[150px]">Dipendenze</TableHead>
                    <TableHead className="w-[150px]">Controlli</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assets.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                        Nessun asset censito. Clicca "Aggiungi Asset" per iniziare.
                      </TableCell>
                    </TableRow>
                  ) : (
                    assets.map(asset => (
                      <TableRow key={asset.id}>
                        <TableCell className="font-mono font-medium">{asset.asset_id}</TableCell>
                        <TableCell>
                          <Input
                            value={getAssetValue(asset, 'component_name') as string}
                            onChange={(e) => handleFieldChange(asset.id, 'component_name', e.target.value)}
                            placeholder="Nome componente"
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={getAssetValue(asset, 'criticality') as string || ''}
                            onValueChange={(v) => handleFieldChange(asset.id, 'criticality', v)}
                          >
                            <SelectTrigger className="h-8 w-[70px]">
                              <SelectValue placeholder="-" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="H">H</SelectItem>
                              <SelectItem value="M">M</SelectItem>
                              <SelectItem value="L">L</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            value={getAssetValue(asset, 'owner_team') as string}
                            onChange={(e) => handleFieldChange(asset.id, 'owner_team', e.target.value)}
                            placeholder="Team"
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={getAssetValue(asset, 'management_type') as string || ''}
                            onValueChange={(v) => handleFieldChange(asset.id, 'management_type', v)}
                          >
                            <SelectTrigger className="h-8 w-[90px]">
                              <SelectValue placeholder="-" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="internal">Interna</SelectItem>
                              <SelectItem value="external">Esterna</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            value={getAssetValue(asset, 'location') as string}
                            onChange={(e) => handleFieldChange(asset.id, 'location', e.target.value)}
                            placeholder="Ubicazione"
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={getAssetValue(asset, 'sensitive_data') as string || ''}
                            onValueChange={(v) => handleFieldChange(asset.id, 'sensitive_data', v)}
                          >
                            <SelectTrigger className="h-8 w-[70px]">
                              <SelectValue placeholder="-" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="S">S</SelectItem>
                              <SelectItem value="N">N</SelectItem>
                              <SelectItem value="N/A">N/A</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            value={getAssetValue(asset, 'dependencies') as string}
                            onChange={(e) => handleFieldChange(asset.id, 'dependencies', e.target.value)}
                            placeholder="Dipendenze"
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={getAssetValue(asset, 'main_controls') as string}
                            onChange={(e) => handleFieldChange(asset.id, 'main_controls', e.target.value)}
                            placeholder="Controlli"
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => deleteAsset(asset.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Tabella Backup & Recovery */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Backup & Recovery</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="w-full">
            <div className="min-w-[1000px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[70px]">ID</TableHead>
                    <TableHead className="w-[150px]">Componente</TableHead>
                    <TableHead className="w-[80px]">Backup</TableHead>
                    <TableHead className="w-[120px]">Frequenza</TableHead>
                    <TableHead className="w-[140px]">Ultimo Test</TableHead>
                    <TableHead className="w-[80px]">RPO (h)</TableHead>
                    <TableHead className="w-[80px]">RTO (h)</TableHead>
                    <TableHead className="w-[150px]">Runbook/Link</TableHead>
                    <TableHead className="w-[200px]">Note IR</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assets.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                        Aggiungi asset nella sezione sopra per compilare i dati di backup.
                      </TableCell>
                    </TableRow>
                  ) : (
                    assets.map(asset => (
                      <TableRow key={asset.id}>
                        <TableCell className="font-mono font-medium">{asset.asset_id}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {asset.component_name || '-'}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={getAssetValue(asset, 'has_backup') as string || ''}
                            onValueChange={(v) => handleFieldChange(asset.id, 'has_backup', v)}
                          >
                            <SelectTrigger className="h-8 w-[70px]">
                              <SelectValue placeholder="-" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="S">S</SelectItem>
                              <SelectItem value="N">N</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            value={getAssetValue(asset, 'backup_frequency') as string}
                            onChange={(e) => handleFieldChange(asset.id, 'backup_frequency', e.target.value)}
                            placeholder="es. Giornaliero"
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                className={cn(
                                  "h-8 w-[130px] justify-start text-left font-normal",
                                  !getAssetValue(asset, 'last_test_date') && "text-muted-foreground"
                                )}
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {getAssetValue(asset, 'last_test_date')
                                  ? format(parseISO(getAssetValue(asset, 'last_test_date') as string), 'dd/MM/yyyy')
                                  : 'Seleziona'}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={getAssetValue(asset, 'last_test_date') 
                                  ? parseISO(getAssetValue(asset, 'last_test_date') as string) 
                                  : undefined}
                                onSelect={(date) => handleFieldChange(
                                  asset.id, 
                                  'last_test_date', 
                                  date ? format(date, 'yyyy-MM-dd') : null
                                )}
                                locale={it}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={getAssetValue(asset, 'rpo_hours') ?? ''}
                            onChange={(e) => handleFieldChange(
                              asset.id, 
                              'rpo_hours', 
                              e.target.value ? parseInt(e.target.value) : null
                            )}
                            placeholder="h"
                            className="h-8 w-[60px]"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={getAssetValue(asset, 'rto_hours') ?? ''}
                            onChange={(e) => handleFieldChange(
                              asset.id, 
                              'rto_hours', 
                              e.target.value ? parseInt(e.target.value) : null
                            )}
                            placeholder="h"
                            className="h-8 w-[60px]"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={getAssetValue(asset, 'runbook_link') as string}
                            onChange={(e) => handleFieldChange(asset.id, 'runbook_link', e.target.value)}
                            placeholder="URL o path"
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={getAssetValue(asset, 'ir_notes') as string}
                            onChange={(e) => handleFieldChange(asset.id, 'ir_notes', e.target.value)}
                            placeholder="Note..."
                            className="h-8"
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};
