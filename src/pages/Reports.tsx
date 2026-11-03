import React, { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  FileText, Download, Calendar, FileSpreadsheet, FileImage,
  Archive, CheckCircle, Clock, AlertTriangle, Search, Eye, Trash2, Loader2
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useCorrelationReports, type CorrelationReport } from '@/hooks/useCorrelationReports';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { ModuleReports } from '@/components/reports/ModuleReports';

const Reports: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedYear, setSelectedYear] = useState('all');
  const { data: correlationReports = [], isLoading: loadingCorr, deleteReport } = useCorrelationReports();

  const assessmentReports: any[] = [];
  const platformReports: any[] = [];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'processing': return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'error': return <AlertTriangle className="w-4 h-4 text-red-500" />;
      default: return <FileText className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getFormatIcon = (format: string) => {
    switch (format) {
      case 'PDF': return <FileText className="w-4 h-4 text-red-500" />;
      case 'XLSX': return <FileSpreadsheet className="w-4 h-4 text-green-500" />;
      case 'PNG': return <FileImage className="w-4 h-4 text-blue-500" />;
      default: return <Archive className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'Assessment': return 'default';
      case 'Remediation': return 'secondary';
      case 'Threats': case 'Incident': return 'destructive';
      case 'HiLog': return 'default';
      default: return 'outline';
    }
  };

  const filterReports = (reports: any[]) => {
    return reports.filter(report => {
      const matchesSearch = report.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (report.description || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesYear = selectedYear === 'all' || (report.year || report.date?.slice(0, 4)) === selectedYear;
      return matchesSearch && matchesYear;
    });
  };

  const handleDownloadCorrelation = (report: CorrelationReport) => {
    const data = (report.report_data || []) as any[];
    const wsData = data.map((e: any) => ({
      'Data/Ora': e.datetime, 'Sorgente': e.source, 'Severity': e.severity || '-',
      'Evento': e.event, 'Hostname': e.hostname, 'Username': e.username, 'IP Sorgente': e.sourceIp,
    }));
    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Correlazioni');
    const summary = [
      { Campo: 'Titolo', Valore: report.title },
      { Campo: 'Periodo', Valore: report.time_range_label },
      { Campo: 'Eventi', Valore: report.events_count },
      { Campo: 'Data', Valore: new Date(report.created_at).toLocaleString('it-IT') },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'Riepilogo');
    XLSX.writeFile(wb, `${report.title.replace(/\s+/g, '-')}.xlsx`);
    toast.success('Report scaricato');
  };

  const handleDeleteCorrelation = async (report: CorrelationReport) => {
    try {
      await deleteReport.mutateAsync(report.id);
      toast.success('Report eliminato');
    } catch {
      toast.error('Errore nell\'eliminazione');
    }
  };

  const filteredCorrelationReports = correlationReports.filter(r => {
    const matchesSearch = r.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (r.description || '').toLowerCase().includes(searchTerm.toLowerCase());
    const year = r.created_at?.slice(0, 4);
    const matchesYear = selectedYear === 'all' || year === selectedYear;
    return matchesSearch && matchesYear;
  });

  const totalReports = assessmentReports.length + platformReports.length + correlationReports.length;

  const renderReportRow = (report: any, onDownload: () => void, onPreview?: () => void) => (
    <div key={report.id} className="flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors">
      <div className="flex items-center space-x-4">
        <div className="p-2 rounded-lg bg-primary/10">
          {getFormatIcon(report.format || 'XLSX')}
        </div>
        <div className="flex-1">
          <h4 className="font-medium">{report.title}</h4>
          <p className="text-sm text-muted-foreground">{report.description}</p>
          <div className="flex items-center space-x-4 mt-2">
            <div className="flex items-center space-x-1">
              <Calendar className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{report.date || new Date(report.created_at).toLocaleDateString('it-IT')}</span>
            </div>
            {report.size && <span className="text-xs text-muted-foreground">{report.size}</span>}
            <Badge variant={getTypeColor(report.type || 'HiLog') as any}>{report.type || 'HiLog Correlazione'}</Badge>
            {report.time_range_label && <Badge variant="outline" className="text-xs">{report.time_range_label}</Badge>}
            {report.events_count != null && <span className="text-xs text-muted-foreground">{report.events_count} eventi</span>}
          </div>
        </div>
      </div>
      <div className="flex items-center space-x-2">
        {getStatusIcon(report.status || 'completed')}
        {onPreview && (
          <Button variant="outline" size="sm" onClick={onPreview}><Eye className="w-4 h-4 mr-1" />Anteprima</Button>
        )}
        <Button variant="default" size="sm" onClick={onDownload}><Download className="w-4 h-4 mr-1" />Scarica</Button>
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Report e Documentazione</h1>
            <p className="text-muted-foreground">Tutti i report di Assessment, SurfaceScan360, DarkRisk360, DarkRisk360 Esteso, IRP e correlazioni HiLog</p>
          </div>
        </div>

        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input placeholder="Cerca report..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
              </div>
              <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="w-48 p-2 border border-border rounded-md bg-background">
                <option value="all">Tutti gli anni</option>
                <option value="2026">2026</option>
                <option value="2025">2025</option>
                <option value="2024">2024</option>
              </select>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="modules" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="modules">Report moduli</TabsTrigger>
            <TabsTrigger value="correlation">
              Correlazioni HiLog
              {correlationReports.length > 0 && <Badge variant="secondary" className="ml-2 text-xs">{correlationReports.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="modules" className="space-y-4">
            <ModuleReports search={searchTerm} year={selectedYear} />
          </TabsContent>

          <TabsContent value="correlation" className="space-y-4">
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <FileSpreadsheet className="w-5 h-5 mr-2 text-primary" />
                  Report Correlazione HiLog
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingCorr ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                ) : filteredCorrelationReports.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    Nessun report di correlazione salvato. Vai su <strong>HiLog → Correlazioni</strong> per generarne uno.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {filteredCorrelationReports.map(report => (
                      <div key={report.id} className="flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors">
                        <div className="flex items-center space-x-4">
                          <div className="p-2 rounded-lg bg-primary/10">
                            <FileSpreadsheet className="w-4 h-4 text-green-500" />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-medium">{report.title}</h4>
                            <p className="text-sm text-muted-foreground">{report.description}</p>
                            <div className="flex items-center space-x-4 mt-2 flex-wrap">
                              <div className="flex items-center space-x-1">
                                <Calendar className="w-3 h-3 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">{new Date(report.created_at).toLocaleDateString('it-IT')}</span>
                              </div>
                              <Badge variant="default">HiLog Correlazione</Badge>
                              <Badge variant="outline" className="text-xs">{report.time_range_label}</Badge>
                              <span className="text-xs text-muted-foreground">{report.events_count} eventi</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <CheckCircle className="w-4 h-4 text-green-500" />
                          <Button variant="default" size="sm" onClick={() => handleDownloadCorrelation(report)}>
                            <Download className="w-4 h-4 mr-1" />Scarica
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDeleteCorrelation(report)} className="text-destructive hover:text-destructive">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>

      </div>
    </DashboardLayout>
  );
};

export default Reports;
