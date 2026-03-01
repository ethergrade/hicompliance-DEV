import React, { useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Download, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useConsistenze } from '@/hooks/useConsistenze';
import { useConsistenzeRisk } from '@/hooks/useConsistenzeRisk';
import { ConsistenzeAreaTab } from '@/components/consistenze/ConsistenzeAreaTab';
import { ConsistenzeOverview } from '@/components/consistenze/ConsistenzeOverview';
import { AREA_LABELS, type ConsistenzeArea } from '@/types/consistenze';
import * as XLSX from 'xlsx';

const AREAS: ConsistenzeArea[] = ['UCC', 'SECURITY', 'CONN_FONIA', 'NETWORKING', 'IT'];

const Consistenze: React.FC = () => {
  const {
    cliente, items, loading, saveStatus,
    updateCliente, addItem, updateItem, deleteItem, getItemsByArea,
  } = useConsistenze();

  const { loadIRPAssets, calcAreaScore, calcTotalIRP } = useConsistenzeRisk();

  useEffect(() => {
    loadIRPAssets();
  }, [loadIRPAssets]);

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Overview sheet
    const overviewData = AREAS.map(area => ({
      Area: AREA_LABELS[area],
      'Nr. Asset': items.filter(i => i.area === area).length,
      'Rischio Medio': calcAreaScore(area),
    }));
    overviewData.push({ Area: 'TOTALE', 'Nr. Asset': items.length, 'Rischio Medio': calcTotalIRP() });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(overviewData), 'Overview');

    // One sheet per area
    for (const area of AREAS) {
      const areaItems = items.filter(i => i.area === area);
      if (areaItems.length === 0) continue;
      const rows = areaItems.map(i => ({
        Categoria: i.categoria,
        Tecnologia: i.tecnologia,
        Fornitore: i.fornitore,
        Quantità: i.quantita,
        Scadenza: i.scadenza || '',
        ...(i.metriche_json as Record<string, any>),
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), AREA_LABELS[area].slice(0, 31));
    }

    XLSX.writeFile(wb, `Consistenze_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Consistenze</h1>
            <p className="text-sm text-muted-foreground">
              Inventario asset per area con analisi rischio integrata
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Save status badge */}
            {saveStatus === 'saving' && (
              <Badge variant="secondary" className="gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Salvando...
              </Badge>
            )}
            {saveStatus === 'saved' && (
              <Badge variant="secondary" className="gap-1 text-green-600">
                <CheckCircle className="w-3 h-3" /> Salvato
              </Badge>
            )}
            {saveStatus === 'error' && (
              <Badge variant="destructive" className="gap-1">
                <AlertCircle className="w-3 h-3" /> Errore
              </Badge>
            )}
            <Button variant="outline" onClick={handleExportExcel}>
              <Download className="w-4 h-4 mr-2" /> Esporta Excel
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview">
          <TabsList className="w-full justify-start flex-wrap h-auto gap-1">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            {AREAS.map(area => (
              <TabsTrigger key={area} value={area}>
                {AREA_LABELS[area]}
                {getItemsByArea(area).length > 0 && (
                  <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">
                    {getItemsByArea(area).length}
                  </Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <ConsistenzeOverview
              items={items}
              calcAreaScore={calcAreaScore}
              calcTotalIRP={calcTotalIRP}
              nrSedi={cliente?.nr_sedi || 0}
            />
          </TabsContent>

          {AREAS.map(area => (
            <TabsContent key={area} value={area} className="mt-4">
              <ConsistenzeAreaTab
                area={area}
                cliente={cliente}
                items={getItemsByArea(area)}
                onUpdateCliente={updateCliente}
                onAddItem={() => addItem(area)}
                onUpdateItem={updateItem}
                onDeleteItem={deleteItem}
              />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Consistenze;
