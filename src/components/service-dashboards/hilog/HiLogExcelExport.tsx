import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { CalendarIcon } from 'lucide-react';

interface DataSets {
  windowsLogs: Record<string, any>[];
  entraId: Record<string, any>[];
  securityEvents: Record<string, any>[];
  firewall: Record<string, any>[];
  hosts: Record<string, any>[];
  startup: Record<string, any>[];
}

interface HiLogExcelExportProps {
  dataSets: DataSets;
}

const SECTIONS = [
  { key: 'windowsLogs', label: 'Windows Logs' },
  { key: 'entraId', label: 'Microsoft Entra ID' },
  { key: 'securityEvents', label: 'Security Events' },
  { key: 'firewall', label: 'Firewall' },
  { key: 'hosts', label: 'Hosts' },
  { key: 'startup', label: 'Startup / Shutdown' },
] as const;

const parseDatetime = (dt: string): Date | null => {
  // Format: "28/01/2026 10:24:16" or "28/01/2026"
  const parts = dt.match(/(\d{2})\/(\d{2})\/(\d{4})\s*(\d{2})?:?(\d{2})?:?(\d{2})?/);
  if (!parts) return null;
  return new Date(
    parseInt(parts[3]),
    parseInt(parts[2]) - 1,
    parseInt(parts[1]),
    parseInt(parts[4] || '0'),
    parseInt(parts[5] || '0'),
    parseInt(parts[6] || '0')
  );
};

const filterByDateRange = (data: Record<string, any>[], from: Date | undefined, to: Date | undefined): Record<string, any>[] => {
  if (!from && !to) return data;
  return data.filter(row => {
    const dt = parseDatetime(row.datetime || '');
    if (!dt) return true; // keep rows without datetime
    if (from && dt < from) return false;
    if (to) {
      const endOfDay = new Date(to);
      endOfDay.setHours(23, 59, 59, 999);
      if (dt > endOfDay) return false;
    }
    return true;
  });
};

export const HiLogExcelExport: React.FC<HiLogExcelExportProps> = ({ dataSets }) => {
  const [open, setOpen] = useState(false);
  const [selectedSections, setSelectedSections] = useState<Set<string>>(new Set(SECTIONS.map(s => s.key)));
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  const toggleSection = (key: string) => {
    const next = new Set(selectedSections);
    if (next.has(key)) next.delete(key); else next.add(key);
    setSelectedSections(next);
  };

  const toggleAll = () => {
    if (selectedSections.size === SECTIONS.length) {
      setSelectedSections(new Set());
    } else {
      setSelectedSections(new Set(SECTIONS.map(s => s.key)));
    }
  };

  const handleExport = () => {
    const wb = XLSX.utils.book_new();
    let totalRows = 0;

    SECTIONS.forEach(({ key, label }) => {
      if (!selectedSections.has(key)) return;
      const raw = dataSets[key as keyof DataSets] || [];
      const filtered = filterByDateRange(raw, dateFrom, dateTo);
      if (filtered.length === 0) return;
      const ws = XLSX.utils.json_to_sheet(filtered);
      XLSX.utils.book_append_sheet(wb, ws, label.slice(0, 31));
      totalRows += filtered.length;
    });

    if (totalRows === 0) {
      toast.error('Nessun dato da esportare con i filtri selezionati');
      return;
    }

    // Summary sheet
    const summaryData = [
      { Campo: 'Data Generazione', Valore: new Date().toLocaleString('it-IT') },
      { Campo: 'Periodo Da', Valore: dateFrom ? format(dateFrom, 'dd/MM/yyyy') : 'Tutti' },
      { Campo: 'Periodo A', Valore: dateTo ? format(dateTo, 'dd/MM/yyyy') : 'Tutti' },
      { Campo: 'Righe Totali', Valore: totalRows },
      { Campo: 'Sezioni Esportate', Valore: SECTIONS.filter(s => selectedSections.has(s.key)).map(s => s.label).join(', ') },
    ];
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Riepilogo');

    const fileName = `hilog-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
    toast.success(`Export completato: ${totalRows} righe esportate`);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <FileSpreadsheet className="w-4 h-4" />
          Esporta Excel
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Esporta Dati HiLog</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {/* Date range */}
          <div className="space-y-2">
            <Label>Periodo (opzionale)</Label>
            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("flex-1 justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, 'dd/MM/yyyy') : 'Da'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("flex-1 justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateTo ? format(dateTo, 'dd/MM/yyyy') : 'A'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Section selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Sezioni da esportare</Label>
              <Button variant="ghost" size="sm" onClick={toggleAll} className="text-xs h-auto py-1">
                {selectedSections.size === SECTIONS.length ? 'Deseleziona tutto' : 'Seleziona tutto'}
              </Button>
            </div>
            <div className="space-y-2">
              {SECTIONS.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2">
                  <Checkbox
                    id={`section-${key}`}
                    checked={selectedSections.has(key)}
                    onCheckedChange={() => toggleSection(key)}
                  />
                  <label htmlFor={`section-${key}`} className="text-sm cursor-pointer flex-1">
                    {label}
                    <span className="text-muted-foreground ml-1">
                      ({(dataSets[key as keyof DataSets] || []).length} righe)
                    </span>
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-muted/50 rounded-lg p-3 text-sm">
            <p><span className="text-muted-foreground">Formato:</span> Excel (.xlsx)</p>
            <p><span className="text-muted-foreground">I dati rispettano i filtri attivi nella dashboard</span></p>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setOpen(false)}>Annulla</Button>
            <Button onClick={handleExport} disabled={selectedSections.size === 0} className="gap-1.5">
              <FileSpreadsheet className="w-4 h-4" />
              Esporta
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
