import React, { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  FileText,
  Download,
  Calendar,
  FileSpreadsheet,
  FileImage,
  Archive,
  CheckCircle,
  Clock,
  AlertTriangle,
  Filter,
  Search,
  Eye
} from 'lucide-react';
import { Input } from '@/components/ui/input';

const Reports: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedYear, setSelectedYear] = useState('all');

  // Report Assessment NIS2/NIST/ISO
  const assessmentReports = [
    {
      id: 1,
      title: 'Assessment NIS2/NIST/ISO Completo 2025',
      description: 'Report completo di conformità e gap analysis',
      year: '2025',
      date: '2025-01-15',
      type: 'Assessment',
      format: 'PDF',
      size: '2.4 MB',
      status: 'completed',
      downloadUrl: '/reports/assessment-2025-complete.pdf'
    },
    {
      id: 2,
      title: 'Assessment Parziale Q4 2024',
      description: 'Report trimestrale quarto trimestre 2024',
      year: '2024',
      date: '2024-12-31',
      type: 'Assessment',
      format: 'PDF',
      size: '1.8 MB',
      status: 'completed',
      downloadUrl: '/reports/assessment-2024-q4.pdf'
    },
    {
      id: 3,
      title: 'Assessment Completo 2024',
      description: 'Report annuale completo di conformità 2024',
      year: '2024',
      date: '2024-12-15',
      type: 'Assessment',
      format: 'PDF',
      size: '3.1 MB',
      status: 'completed',
      downloadUrl: '/reports/assessment-2024-complete.pdf'
    },
    {
      id: 4,
      title: 'Remediation Plan 2024',
      description: 'Piano di remediation per gap identificati 2024',
      year: '2024',
      date: '2024-11-20',
      type: 'Remediation',
      format: 'PDF',
      size: '1.5 MB',
      status: 'completed',
      downloadUrl: '/reports/remediation-plan-2024.pdf'
    }
  ];

  // Altri report della piattaforma
  const platformReports = [
    {
      id: 5,
      title: 'Report Minacce Identificate 2025',
      description: 'Analisi delle minacce rilevate dalla piattaforma',
      year: '2025',
      date: '2025-01-10',
      type: 'Threats',
      format: 'PDF',
      size: '1.2 MB',
      status: 'completed',
      downloadUrl: '/reports/threats-2025.pdf'
    },
    {
      id: 6,
      title: 'SurfaceScan360 Report Annuale 2024',
      description: 'Report completo scansioni superficie attacco',
      year: '2024',
      date: '2024-12-28',
      type: 'SurfaceScan',
      format: 'PDF',
      size: '4.2 MB',
      status: 'completed',
      downloadUrl: '/reports/surfacescan-2024.pdf'
    },
    {
      id: 7,
      title: 'DarkRisk360 Intelligence Report 2024',
      description: 'Intelligence su attività dark web e mercati illegali',
      year: '2024',
      date: '2024-12-20',
      type: 'DarkRisk',
      format: 'PDF',
      size: '2.8 MB',
      status: 'completed',
      downloadUrl: '/reports/darkrisk-2024.pdf'
    },
    {
      id: 8,
      title: 'Analytics Dashboard Export Q4 2024',
      description: 'Export dati analytics e metriche prestazioni',
      year: '2024',
      date: '2024-12-31',
      type: 'Analytics',
      format: 'XLSX',
      size: '856 KB',
      status: 'completed',
      downloadUrl: '/reports/analytics-q4-2024.xlsx'
    },
    {
      id: 9,
      title: 'Incident Response Summary 2024',
      description: 'Riepilogo incidenti gestiti e risposte implementate',
      year: '2024',
      date: '2024-12-25',
      type: 'Incident',
      format: 'PDF',
      size: '1.7 MB',
      status: 'completed',
      downloadUrl: '/reports/incident-response-2024.pdf'
    },
    {
      id: 10,
      title: 'Executive Summary 2024',
      description: 'Report esecutivo con KPI e metriche chiave',
      year: '2024',
      date: '2024-12-30',
      type: 'Executive',
      format: 'PDF',
      size: '982 KB',
      status: 'completed',
      downloadUrl: '/reports/executive-summary-2024.pdf'
    }
  ];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'processing': return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'error': return <AlertTriangle className="w-4 h-4 text-red-500" />;
      default: return <FileText className="w-4 h-4 text-gray-500" />;
    }
  };

  const getFormatIcon = (format: string) => {
    switch (format) {
      case 'PDF': return <FileText className="w-4 h-4 text-red-500" />;
      case 'XLSX': return <FileSpreadsheet className="w-4 h-4 text-green-500" />;
      case 'PNG': return <FileImage className="w-4 h-4 text-blue-500" />;
      default: return <Archive className="w-4 h-4 text-gray-500" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'Assessment': return 'default';
      case 'Remediation': return 'secondary';
      case 'Threats': return 'destructive';
      case 'SurfaceScan': return 'outline';
      case 'DarkRisk': return 'secondary';
      case 'Analytics': return 'default';
      case 'Incident': return 'destructive';
      case 'Executive': return 'default';
      default: return 'outline';
    }
  };

  const filterReports = (reports: any[]) => {
    return reports.filter(report => {
      const matchesSearch = report.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           report.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesYear = selectedYear === 'all' || report.year === selectedYear;
      return matchesSearch && matchesYear;
    });
  };

  const handleDownload = (report: any) => {
    // Simula download - in produzione si collegherebbe al storage Supabase
    console.log(`Downloading report: ${report.title}`);
    // window.open(report.downloadUrl, '_blank');
  };

  const handlePreview = (report: any) => {
    // Simula preview - in produzione aprirebbe un viewer
    console.log(`Previewing report: ${report.title}`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Report e Documentazione</h1>
            <p className="text-muted-foreground">
              Scarica report Assessment NIS2/NIST/ISO e altri documenti della piattaforma
            </p>
          </div>
          <Button className="bg-primary text-primary-foreground">
            <Archive className="w-4 h-4 mr-2" />
            Archivio Completo
          </Button>
        </div>

        {/* Filtri */}
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="Cerca report per titolo o descrizione..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="w-48">
                <select 
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="w-full p-2 border border-border rounded-md bg-background"
                >
                  <option value="all">Tutti gli anni</option>
                  <option value="2025">2025</option>
                  <option value="2024">2024</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="assessment" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="assessment">Report Assessment NIS2/NIST/ISO</TabsTrigger>
            <TabsTrigger value="platform">Report Piattaforma</TabsTrigger>
          </TabsList>
          
          <TabsContent value="assessment" className="space-y-4">
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <FileText className="w-5 h-5 mr-2 text-primary" />
                  Report Assessment e Conformità
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {filterReports(assessmentReports).map((report) => (
                    <div key={report.id} className="flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors">
                      <div className="flex items-center space-x-4">
                        <div className="p-2 rounded-lg bg-primary/10">
                          {getFormatIcon(report.format)}
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium">{report.title}</h4>
                          <p className="text-sm text-muted-foreground">{report.description}</p>
                          <div className="flex items-center space-x-4 mt-2">
                            <div className="flex items-center space-x-1">
                              <Calendar className="w-3 h-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">{report.date}</span>
                            </div>
                            <span className="text-xs text-muted-foreground">{report.size}</span>
                            <Badge variant={getTypeColor(report.type) as any}>
                              {report.type}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="flex items-center space-x-1">
                          {getStatusIcon(report.status)}
                          <span className="text-xs">Pronto</span>
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handlePreview(report)}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          Anteprima
                        </Button>
                        <Button 
                          variant="default" 
                          size="sm"
                          onClick={() => handleDownload(report)}
                        >
                          <Download className="w-4 h-4 mr-1" />
                          Scarica
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="platform" className="space-y-4">
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Archive className="w-5 h-5 mr-2 text-primary" />
                  Report Piattaforma e Intelligence
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {filterReports(platformReports).map((report) => (
                    <div key={report.id} className="flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors">
                      <div className="flex items-center space-x-4">
                        <div className="p-2 rounded-lg bg-primary/10">
                          {getFormatIcon(report.format)}
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium">{report.title}</h4>
                          <p className="text-sm text-muted-foreground">{report.description}</p>
                          <div className="flex items-center space-x-4 mt-2">
                            <div className="flex items-center space-x-1">
                              <Calendar className="w-3 h-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">{report.date}</span>
                            </div>
                            <span className="text-xs text-muted-foreground">{report.size}</span>
                            <Badge variant={getTypeColor(report.type) as any}>
                              {report.type}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="flex items-center space-x-1">
                          {getStatusIcon(report.status)}
                          <span className="text-xs">Pronto</span>
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handlePreview(report)}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          Anteprima
                        </Button>
                        <Button 
                          variant="default" 
                          size="sm"
                          onClick={() => handleDownload(report)}
                        >
                          <Download className="w-4 h-4 mr-1" />
                          Scarica
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Summary Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Report Totali</p>
                  <p className="text-2xl font-bold text-foreground">{assessmentReports.length + platformReports.length}</p>
                </div>
                <FileText className="w-6 h-6 text-primary" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Report Assessment</p>
                  <p className="text-2xl font-bold text-foreground">{assessmentReports.length}</p>
                </div>
                <CheckCircle className="w-6 h-6 text-green-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Report Piattaforma</p>
                  <p className="text-2xl font-bold text-foreground">{platformReports.length}</p>
                </div>
                <Archive className="w-6 h-6 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Ultimo Report</p>
                  <p className="text-sm font-medium text-foreground">15 Gen 2025</p>
                </div>
                <Calendar className="w-6 h-6 text-yellow-500" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Reports;