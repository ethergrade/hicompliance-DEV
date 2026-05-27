import React, { useState } from 'react';
import jsPDF from 'jspdf';
import { format } from 'date-fns';
import { FileText, CalendarIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface DataSets {
  windowsLogs: Record<string, any>[];
  entraId: Record<string, any>[];
  securityEvents: Record<string, any>[];
  firewall: Record<string, any>[];
  hosts: Record<string, any>[];
  startup: Record<string, any>[];
}

interface HiLogPdfExportProps {
  dataSets: DataSets;
}

const LOGO_PATH = '/lovable-uploads/ebc3b9f3-fce3-4df9-a7f9-b0b576887830.png';

const SECTIONS = [
  { key: 'windowsLogs', label: 'Windows Logs' },
  { key: 'entraId', label: 'Microsoft Entra ID' },
  { key: 'securityEvents', label: 'Security Events' },
  { key: 'firewall', label: 'Firewall' },
  { key: 'hosts', label: 'Hosts' },
  { key: 'startup', label: 'Startup / Shutdown' },
] as const;

const COLUMN_PRIORITY = [
  'datetime',
  'hostname',
  'username',
  'name',
  'sourceIp',
  'ip',
  'ipAddresses',
  'severity',
  'category',
  'eventId',
  'eventCode',
  'eventType',
  'action',
  'operation',
  'result',
  'domain',
  'source',
  'message',
  'description',
] as const;

const COLUMN_LABELS: Record<string, string> = {
  datetime: 'Data/Ora',
  hostname: 'Hostname',
  username: 'Username',
  name: 'Nome',
  sourceIp: 'Source IP',
  ip: 'IP',
  ipAddresses: 'IP Addresses',
  severity: 'Severity',
  category: 'Categoria',
  eventId: 'Event ID',
  eventCode: 'Event Code',
  eventType: 'Event Type',
  action: 'Action',
  operation: 'Operazione',
  result: 'Risultato',
  domain: 'Dominio',
  source: 'Sorgente',
  message: 'Messaggio',
  description: 'Descrizione',
};

const parseDatetime = (dt: string): Date | null => {
  const parts = dt.match(/(\d{2})\/(\d{2})\/(\d{4})\s*(\d{2})?:?(\d{2})?:?(\d{2})?/);
  if (!parts) return null;
  return new Date(
    parseInt(parts[3], 10),
    parseInt(parts[2], 10) - 1,
    parseInt(parts[1], 10),
    parseInt(parts[4] || '0', 10),
    parseInt(parts[5] || '0', 10),
    parseInt(parts[6] || '0', 10)
  );
};

const filterByDateRange = (data: Record<string, any>[], from: Date | undefined, to: Date | undefined): Record<string, any>[] => {
  if (!from && !to) return data;
  return data.filter((row) => {
    const dt = parseDatetime(String(row.datetime || ''));
    if (!dt) return true;
    if (from && dt < from) return false;
    if (to) {
      const endOfDay = new Date(to);
      endOfDay.setHours(23, 59, 59, 999);
      if (dt > endOfDay) return false;
    }
    return true;
  });
};

const valueToText = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '-';
  if (Array.isArray(value)) {
    const compact = value.map((v) => String(v)).filter(Boolean);
    return compact.length > 0 ? compact.join(', ') : '-';
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

const humanizeColumn = (key: string): string => {
  if (COLUMN_LABELS[key]) return COLUMN_LABELS[key];
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const pickColumns = (rows: Record<string, any>[], maxColumns = 8): string[] => {
  const keysFrequency = new Map<string, number>();

  rows.forEach((row) => {
    Object.entries(row).forEach(([key, value]) => {
      if (value === undefined) return;
      if (key === 'id') return;
      keysFrequency.set(key, (keysFrequency.get(key) || 0) + 1);
    });
  });

  const priority = (key: string) => {
    const idx = COLUMN_PRIORITY.indexOf(key as (typeof COLUMN_PRIORITY)[number]);
    return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
  };

  return Array.from(keysFrequency.keys())
    .sort((a, b) => {
      const pa = priority(a);
      const pb = priority(b);
      if (pa !== pb) return pa - pb;

      const fa = keysFrequency.get(a) || 0;
      const fb = keysFrequency.get(b) || 0;
      if (fa !== fb) return fb - fa;

      return a.localeCompare(b);
    })
    .slice(0, maxColumns);
};

const loadLogoAsDataUrl = async (path: string): Promise<string | null> => {
  try {
    const response = await fetch(path);
    if (!response.ok) return null;
    const blob = await response.blob();

    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

export const HiLogPdfExport: React.FC<HiLogPdfExportProps> = ({ dataSets }) => {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selectedSections, setSelectedSections] = useState<Set<string>>(new Set(SECTIONS.map((s) => s.key)));
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  const toggleSection = (key: string) => {
    const next = new Set(selectedSections);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedSections(next);
  };

  const toggleAll = () => {
    if (selectedSections.size === SECTIONS.length) {
      setSelectedSections(new Set());
    } else {
      setSelectedSections(new Set(SECTIONS.map((s) => s.key)));
    }
  };

  const handleExport = async () => {
    setExporting(true);

    try {
      const selected = SECTIONS.filter((section) => selectedSections.has(section.key));
      const filteredSections = selected.map((section) => {
        const rows = filterByDateRange(dataSets[section.key], dateFrom, dateTo);
        return {
          ...section,
          rows,
        };
      });

      const totalRows = filteredSections.reduce((sum, section) => sum + section.rows.length, 0);
      if (totalRows === 0) {
        toast.error('Nessun dato da esportare con i filtri selezionati');
        return;
      }

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 10;
      const usableWidth = pageWidth - margin * 2;
      const topStart = 27;
      const bottomSafe = pageHeight - 14;

      const generatedAt = new Date();
      const generatedAtLabel = generatedAt.toLocaleString('it-IT');
      const logoData = await loadLogoAsDataUrl(LOGO_PATH);

      const drawPageHeader = (title: string, subtitle: string, drawLogo = false) => {
        doc.setFillColor(10, 19, 40);
        doc.rect(0, 0, pageWidth, 20, 'F');

        const logoSize = 12;
        let startX = margin;

        if (drawLogo && logoData) {
          doc.addImage(logoData, 'PNG', margin, 4, logoSize, logoSize);
          startX += logoSize + 3;
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(255, 255, 255);
        doc.text(title, startX, 9);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(184, 200, 220);
        doc.text(subtitle, startX, 15);
      };

      // Cover / summary page
      drawPageHeader('HiLog Export PDF', `Generato il ${generatedAtLabel}`, true);

      let y = topStart;
      doc.setTextColor(30, 41, 59);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('Riepilogo export', margin, y);
      y += 7;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`Periodo da: ${dateFrom ? format(dateFrom, 'dd/MM/yyyy') : 'Tutti i dati'}`, margin, y);
      y += 6;
      doc.text(`Periodo a: ${dateTo ? format(dateTo, 'dd/MM/yyyy') : 'Tutti i dati'}`, margin, y);
      y += 6;
      doc.text(`Righe totali esportate: ${totalRows}`, margin, y);
      y += 8;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Sezioni incluse', margin, y);
      y += 6;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      filteredSections.forEach((section) => {
        doc.text(`- ${section.label}: ${section.rows.length} righe`, margin, y);
        y += 6;
      });

      filteredSections.forEach((section) => {
        doc.addPage();
        drawPageHeader(`HiLog - ${section.label}`, `${section.rows.length} righe`, false);

        let currentY = topStart;

        if (section.rows.length === 0) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          doc.setTextColor(100, 116, 139);
          doc.text('Nessun dato disponibile in questa sezione con i filtri selezionati.', margin, currentY);
          return;
        }

        const columns = pickColumns(section.rows, 8);
        if (columns.length === 0) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          doc.setTextColor(100, 116, 139);
          doc.text('Nessuna colonna esportabile trovata.', margin, currentY);
          return;
        }

        const colWidth = usableWidth / columns.length;

        const drawTableHeader = () => {
          doc.setFillColor(226, 232, 240);
          doc.rect(margin, currentY, usableWidth, 7, 'F');

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(30, 41, 59);

          columns.forEach((columnKey, index) => {
            const cellX = margin + index * colWidth;
            const title = humanizeColumn(columnKey);
            const titleLines = doc.splitTextToSize(title, colWidth - 2);
            doc.text(titleLines, cellX + 1, currentY + 4);
          });

          currentY += 7;
        };

        drawTableHeader();

        section.rows.forEach((row, rowIndex) => {
          const cellLines = columns.map((columnKey) => {
            const value = valueToText(row[columnKey]);
            return doc.splitTextToSize(value, colWidth - 2);
          });

          const maxLines = Math.max(...cellLines.map((lines) => lines.length), 1);
          const rowHeight = Math.max(6, maxLines * 3.5 + 1.5);

          if (currentY + rowHeight > bottomSafe) {
            doc.addPage();
            drawPageHeader(`HiLog - ${section.label}`, `${section.rows.length} righe · continuazione`, false);
            currentY = topStart;
            drawTableHeader();
          }

          if (rowIndex % 2 === 0) {
            doc.setFillColor(248, 250, 252);
            doc.rect(margin, currentY, usableWidth, rowHeight, 'F');
          }

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(15, 23, 42);

          cellLines.forEach((lines, colIndex) => {
            const cellX = margin + colIndex * colWidth;
            doc.text(lines, cellX + 1, currentY + 3.5);
          });

          currentY += rowHeight;
        });
      });

      const totalPages = doc.getNumberOfPages();
      for (let page = 1; page <= totalPages; page += 1) {
        doc.setPage(page);
        doc.setFillColor(10, 19, 40);
        doc.rect(0, pageHeight - 8, pageWidth, 8, 'F');

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(180, 200, 220);
        doc.text('HiSolution - HiLog PDF Export', margin, pageHeight - 3);
        doc.text(`Pagina ${page}/${totalPages}`, pageWidth - margin - 18, pageHeight - 3);
      }

      const fileName = `hilog-export-${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(fileName);

      toast.success(`PDF esportato con successo (${totalRows} righe)`);
      setOpen(false);
    } catch (error) {
      console.error('Errore export PDF HiLog', error);
      toast.error('Errore durante l\'esportazione PDF');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <FileText className="w-4 h-4" />
          Esporta PDF
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Esporta PDF HiLog</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Periodo (opzionale)</Label>
            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn('flex-1 justify-start text-left font-normal', !dateFrom && 'text-muted-foreground')}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, 'dd/MM/yyyy') : 'Da'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateFrom}
                    onSelect={setDateFrom}
                    initialFocus
                    className={cn('p-3 pointer-events-auto')}
                  />
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn('flex-1 justify-start text-left font-normal', !dateTo && 'text-muted-foreground')}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateTo ? format(dateTo, 'dd/MM/yyyy') : 'A'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateTo}
                    onSelect={setDateTo}
                    initialFocus
                    className={cn('p-3 pointer-events-auto')}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Sezioni da includere</Label>
              <Button variant="ghost" size="sm" onClick={toggleAll} className="text-xs h-auto py-1">
                {selectedSections.size === SECTIONS.length ? 'Deseleziona tutto' : 'Seleziona tutto'}
              </Button>
            </div>

            <div className="space-y-2">
              {SECTIONS.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2">
                  <Checkbox
                    id={`pdf-section-${key}`}
                    checked={selectedSections.has(key)}
                    onCheckedChange={() => toggleSection(key)}
                  />
                  <label htmlFor={`pdf-section-${key}`} className="text-sm cursor-pointer flex-1">
                    {label}
                    <span className="text-muted-foreground ml-1">
                      ({(dataSets[key] || []).length} righe)
                    </span>
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-muted/50 rounded-lg p-3 text-sm">
            <p><span className="text-muted-foreground">Formato:</span> PDF (.pdf)</p>
            <p><span className="text-muted-foreground">Logo:</span> HiSolution</p>
            <p><span className="text-muted-foreground">Generazione:</span> dati tabellari (no screenshot)</p>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={exporting}>Annulla</Button>
            <Button onClick={handleExport} disabled={selectedSections.size === 0 || exporting} className="gap-1.5">
              <FileText className="w-4 h-4" />
              {exporting ? 'Esportazione...' : 'Esporta PDF'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
