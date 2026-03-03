import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Download, FileSpreadsheet, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { useClientContext } from '@/contexts/ClientContext';
import type { AdvancedFilter } from './filterEngine';

interface CorrelatedEvent {
  datetime: string;
  source: string;
  event: string;
  hostname: string;
  username: string;
  sourceIp: string;
  severity?: string;
}

interface CorrelationExportProps {
  events: CorrelatedEvent[];
  filter: AdvancedFilter;
  eventsCount: number;
}

const TIME_RANGES = [
  { label: 'Ultimi 7 giorni', value: '7', days: 7 },
  { label: 'Ultimi 14 giorni', value: '14', days: 14 },
  { label: 'Ultimo mese', value: '30', days: 30 },
  { label: 'Ultimi 3 mesi', value: '90', days: 90 },
  { label: 'Ultimi 6 mesi', value: '180', days: 180 },
  { label: 'Ultimo anno', value: '365', days: 365 },
];

export const CorrelationExport: React.FC<CorrelationExportProps> = ({ events, filter, eventsCount }) => {
  const [open, setOpen] = useState(false);
  const [timeRange, setTimeRange] = useState('30');
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const { selectedOrganization } = useClientContext();
  const selectedClientId = selectedOrganization?.id;

  const selectedRange = TIME_RANGES.find(r => r.value === timeRange) || TIME_RANGES[2];

  const generateExcel = (data: CorrelatedEvent[]) => {
    const wsData = data.map(e => ({
      'Data/Ora': e.datetime,
      'Sorgente': e.source,
      'Severity': e.severity || '-',
      'Evento': e.event,
      'Hostname': e.hostname,
      'Username': e.username,
      'IP Sorgente': e.sourceIp,
    }));

    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Correlazioni');

    // Summary sheet
    const summaryData = [
      { Campo: 'Titolo Report', Valore: title || `Correlazione HiLog - ${selectedRange.label}` },
      { Campo: 'Periodo', Valore: selectedRange.label },
      { Campo: 'Eventi Totali', Valore: data.length },
      { Campo: 'Data Generazione', Valore: new Date().toLocaleString('it-IT') },
      { Campo: 'Sorgenti', Valore: [...new Set(data.map(e => e.source))].join(', ') },
    ];
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Riepilogo');

    return wb;
  };

  const handleExportExcel = () => {
    const wb = generateExcel(events);
    const fileName = `hilog-correlazione-${selectedRange.days}d-${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
    toast.success('Report Excel scaricato');
  };

  const handleSaveReport = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Non autenticato');

      const reportTitle = title || `Correlazione HiLog - ${selectedRange.label}`;

      const { error } = await supabase.from('hilog_correlation_reports' as any).insert({
        organization_id: selectedClientId,
        user_id: user.id,
        title: reportTitle,
        description: `Report di correlazione cross-source generato per ${selectedRange.label}. ${eventsCount} eventi analizzati.`,
        time_range_label: selectedRange.label,
        time_range_days: selectedRange.days,
        filter_config: filter as any,
        report_data: events.slice(0, 500) as any, // cap at 500 for DB storage
        events_count: eventsCount,
        format: 'XLSX',
        status: 'completed',
      });

      if (error) throw error;

      // Also download the Excel
      const wb = generateExcel(events);
      const fileName = `hilog-correlazione-${selectedRange.days}d-${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, fileName);

      toast.success('Report salvato e scaricato! Lo trovi anche nella sezione Report.');
      setOpen(false);
      setTitle('');
    } catch (err: any) {
      console.error(err);
      toast.error('Errore nel salvataggio: ' + (err.message || 'Errore sconosciuto'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={handleExportExcel} className="gap-1.5">
        <FileSpreadsheet className="w-4 h-4" />
        Esporta Excel
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="default" size="sm" className="gap-1.5">
            <Save className="w-4 h-4" />
            Genera Report
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Genera Report Correlazione</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Titolo Report (opzionale)</Label>
              <Input
                placeholder={`Correlazione HiLog - ${selectedRange.label}`}
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Periodo di analisi</Label>
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_RANGES.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
              <p><span className="text-muted-foreground">Eventi trovati:</span> <strong>{eventsCount}</strong></p>
              <p><span className="text-muted-foreground">Formato:</span> Excel (.xlsx)</p>
              <p><span className="text-muted-foreground">Salvato in:</span> Database + Sezione Report</p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setOpen(false)}>Annulla</Button>
              <Button onClick={handleSaveReport} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Salva e Scarica
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
