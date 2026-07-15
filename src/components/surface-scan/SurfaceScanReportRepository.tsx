import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { BarChart2, Database, Download, FileText, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { SurfaceScanJob } from '@/hooks/useSurfaceScanEngine';
import { useSurfaceScanReportRepository } from '@/hooks/useSurfaceScanReportRepository';
import { generateSurfaceScan360Pdf, type SurfaceScan360Report } from '@/lib/surfaceScan360PdfReport';
import { generateSurfaceScan360Docx } from '@/lib/surfaceScan360DocxReport';
import { surfaceScan360Api } from '@/lib/api/surface-scan360';
import { useClientOrganization } from '@/hooks/useClientOrganization';

interface SurfaceScanReportRepositoryProps {
  scanJobs: SurfaceScanJob[];
  organizationId?: string;
  canManage?: boolean;
}

interface MonthlyReport {
  id: string;
  month_key: string;
  month_start: string;
  created_at: string;
  payload: {
    weekly_snapshots?: number;
    trend?: { score_start?: number; score_end?: number; score_delta?: number };
    findings_summary?: { total?: number; critical?: number; high?: number; resolved?: number };
    breach_intel?: { creds_found?: number; hashes_found?: number };
    ai?: { executive_summary?: string | null };
  };
}

const riskBadgeClass = (riskLevel?: string) => {
  const key = String(riskLevel || '').toLowerCase();
  if (key === 'critico' || key === 'critical') return 'bg-red-600 text-white';
  if (key === 'alto' || key === 'high') return 'bg-orange-600 text-white';
  if (key === 'medio' || key === 'medium') return 'bg-yellow-500 text-black';
  if (key === 'basso' || key === 'low') return 'bg-green-600 text-white';
  return 'bg-muted text-foreground';
};

export const SurfaceScanReportRepository: React.FC<SurfaceScanReportRepositoryProps> = ({ scanJobs, organizationId, canManage = true }) => {
  const { groupId } = useClientOrganization();
  const [monthlyReports, setMonthlyReports] = useState<MonthlyReport[]>([]);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [generatingMonthly, setGeneratingMonthly] = useState(false);

  const loadMonthlyReports = async () => {
    if (!organizationId) return;
    setMonthlyLoading(true);
    try {
      const data = await surfaceScan360Api.getMonthlyReports(organizationId, groupId);
      setMonthlyReports(data as MonthlyReport[]);
    } catch {
      // errore non bloccante
    } finally {
      setMonthlyLoading(false);
    }
  };

  useEffect(() => {
    void loadMonthlyReports();
  }, [organizationId, groupId]);

  const handleGenerateMonthly = async (monthKey?: string) => {
    if (!organizationId) return;
    setGeneratingMonthly(true);
    try {
      const result = await surfaceScan360Api.generateMonthlyReport(
        organizationId,
        { month_key: monthKey, trigger_source: 'manual' },
        groupId,
      );
      const r = result as { month_key?: string };
      toast.success(`Report mensile generato${r.month_key ? ` per ${r.month_key}` : ''}`);
      await loadMonthlyReports();
    } catch (err) {
      toast.error('Generazione fallita: ' + String(err));
    } finally {
      setGeneratingMonthly(false);
    }
  };

  const handleDownloadMonthly = async (report: MonthlyReport) => {
    if (!organizationId) return;
    try {
      await surfaceScan360Api.downloadMonthlyReport(organizationId, report.id, groupId);
    } catch {
      toast.error('Download del report non riuscito');
    }
  };

  const {
    reports,
    loading,
    generating,
    deletingReportId,
    missingCompletedJobs,
    refetch,
    generateReport,
    deleteReport,
    generateMissingReports,
  } = useSurfaceScanReportRepository(scanJobs);

  const downloadPdf = (payload: SurfaceScan360Report) => {
    try {
      generateSurfaceScan360Pdf(payload);
    } catch (error) {
      console.error('Error exporting SurfaceScan report PDF:', error);
      toast.error('Export PDF non riuscito');
    }
  };

  const downloadDocx = async (payload: SurfaceScan360Report) => {
    try {
      await generateSurfaceScan360Docx(payload);
    } catch (error) {
      console.error('Error exporting SurfaceScan report DOCX:', error);
      toast.error('Export DOCX non riuscito');
    }
  };

  const handleGenerateMissing = async () => {
    const result = await generateMissingReports();
    if (result.created === 0 && result.skipped === 0) {
      toast.success('Nessun report mancante');
      return;
    }
    toast.success(
      `Repository aggiornato: ${result.created} creati${result.skipped > 0 ? `, ${result.skipped} non generati` : ''}`,
    );
  };

  const handleDelete = async (reportId: string) => {
    const shouldDelete = window.confirm('Confermi l\'eliminazione di questo report dal repository?');
    if (!shouldDelete) return;
    await deleteReport(reportId);
  };

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="w-5 h-5 text-primary" />
          Repository Report SurfaceScan360
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Report scan e report mensili aggregati dell&apos;organizzazione.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs defaultValue="scan">
          <TabsList>
            <TabsTrigger value="scan" className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />Report Scan
            </TabsTrigger>
            <TabsTrigger value="monthly" className="flex items-center gap-1.5">
              <BarChart2 className="w-3.5 h-3.5" />Report Mensili
            </TabsTrigger>
          </TabsList>

          <TabsContent value="scan" className="space-y-4 mt-4">
            <div className="flex items-center justify-between gap-3">
              <div />
              <div className="flex items-center gap-2">
                {canManage && (
                  <>
                    <Button variant="outline" onClick={() => refetch()} disabled={loading}>
                      <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                      Aggiorna
                    </Button>
                    <Button onClick={() => generateReport()} disabled={generating}>
                      {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
                      Rigenera report canonico
                    </Button>
                  </>
                )}
              </div>
            </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Report in repository: {reports.length}</Badge>
          <Badge variant={missingCompletedJobs.length > 0 ? 'destructive' : 'outline'}>
            Scan completate dall'ultimo report canonico: {missingCompletedJobs.length}
          </Badge>
          {missingCompletedJobs.length > 0 && (
            <Button size="sm" variant="outline" onClick={handleGenerateMissing} disabled={generating}>
              Genera report mancanti
            </Button>
          )}
        </div>

        <div className="rounded-lg border border-border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Creato</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Profilo</TableHead>
                <TableHead>Postura</TableHead>
                <TableHead>Findings</TableHead>
                <TableHead>Origine</TableHead>
                <TableHead>Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                    Caricamento repository...
                  </TableCell>
                </TableRow>
              )}

              {!loading && reports.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                    Nessun report disponibile.
                  </TableCell>
                </TableRow>
              )}

              {!loading &&
                reports.map((row) => {
                  const payload = row.payload as SurfaceScan360Report;
                  const riskScore = payload?.exposure_score?.posture_score ?? payload?.ai?.risk_score ?? payload?.scan?.overall_score;
                  const riskLevel = payload?.exposure_score?.risk_level ?? payload?.ai?.risk_level ?? payload?.scan?.risk_level;
                  const target =
                    payload?.scan?.target ||
                    payload?.scan?.normalized_target ||
                    row.title ||
                    row.scan_job_id ||
                    '-';
                  const findingsCount = Array.isArray(payload?.findings)
                    ? payload.findings.length
                    : Object.values(payload?.findings_by_severity || {}).reduce(
                        (sum, value) => sum + (Number(value) || 0),
                        0,
                      );
                  const origin = payload?.report_repository?.auto_generated ? 'Auto' : 'Manuale';

                  return (
                    <TableRow key={row.id}>
                      <TableCell className="text-sm">
                        {new Date(row.created_at).toLocaleString('it-IT')}
                      </TableCell>
                      <TableCell className="max-w-[320px] truncate font-medium">{target}</TableCell>
                      <TableCell className="text-sm">{payload?.scan?.scan_profile || '-'}</TableCell>
                      <TableCell>
                        {riskScore != null ? (
                          <Badge className={riskBadgeClass(riskLevel)}>
                            {riskLevel || 'n/d'} · {riskScore}/100
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{findingsCount}</TableCell>
                      <TableCell>
                        <Badge variant={origin === 'Auto' ? 'default' : 'secondary'}>{origin}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => downloadPdf(payload)}
                            disabled={deletingReportId === row.id}
                          >
                            <Download className="w-4 h-4 mr-2" />
                            PDF
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void downloadDocx(payload)}
                            disabled={deletingReportId === row.id}
                          >
                            <Download className="w-4 h-4 mr-2" />
                            DOCX
                          </Button>
                          {canManage && row.scan_job_id && (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={generating}
                              onClick={() =>
                                generateReport({
                                  jobId: row.scan_job_id || undefined,
                                  forceRegenerate: true,
                                })
                              }
                            >
                              Rigenera
                            </Button>
                          )}
                          {canManage && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            disabled={generating || deletingReportId === row.id}
                            onClick={() => handleDelete(row.id)}
                          >
                            {deletingReportId === row.id ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4 mr-2" />
                            )}
                            Elimina
                          </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </div>
          </TabsContent>

          <TabsContent value="monthly" className="space-y-4 mt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary">Report mensili: {monthlyReports.length}</Badge>
              </div>
              {canManage && (
                <Button onClick={() => handleGenerateMonthly()} disabled={generatingMonthly}>
                  {generatingMonthly ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <BarChart2 className="w-4 h-4 mr-2" />}
                  Genera mese corrente
                </Button>
              )}
            </div>

            <div className="rounded-lg border border-border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mese</TableHead>
                    <TableHead>Snapshot</TableHead>
                    <TableHead>Score (start→end)</TableHead>
                    <TableHead>Findings</TableHead>
                    <TableHead>Breach</TableHead>
                    <TableHead>Generato</TableHead>
                    <TableHead>Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyLoading && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                        Caricamento report mensili...
                      </TableCell>
                    </TableRow>
                  )}
                  {!monthlyLoading && monthlyReports.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                        Nessun report mensile. Usa il pulsante &quot;Genera mese corrente&quot; per creare il primo.
                      </TableCell>
                    </TableRow>
                  )}
                  {!monthlyLoading && monthlyReports.map(r => {
                    const p = r.payload;
                    const delta = p.trend?.score_delta ?? 0;
                    const deltaStr = delta > 0 ? `+${delta}` : String(delta);
                    const deltaClass = delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-red-400' : 'text-muted-foreground';
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.month_key}</TableCell>
                        <TableCell className="text-sm">{p.weekly_snapshots ?? '-'}</TableCell>
                        <TableCell className="text-sm">
                          {p.trend?.score_start ?? '-'} → {p.trend?.score_end ?? '-'}
                          <span className={`ml-1.5 text-xs ${deltaClass}`}>({deltaStr})</span>
                        </TableCell>
                        <TableCell className="text-sm">
                          <span className="text-red-400">{p.findings_summary?.critical ?? 0} crit</span>
                          <span className="text-muted-foreground ml-1">/ {p.findings_summary?.total ?? 0} tot</span>
                        </TableCell>
                        <TableCell className="text-sm">
                          {(p.breach_intel?.creds_found ?? 0) + (p.breach_intel?.hashes_found ?? 0) > 0
                            ? <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">{p.breach_intel?.creds_found ?? 0} creds</Badge>
                            : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-sm">{new Date(r.created_at).toLocaleString('it-IT')}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" onClick={() => handleDownloadMonthly(r)}>
                              <Download className="w-4 h-4 mr-1" />PDF
                            </Button>
                            {canManage && (
                              <Button size="sm" variant="ghost" onClick={() => handleGenerateMonthly(r.month_key)} disabled={generatingMonthly}>
                                Rigenera
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default SurfaceScanReportRepository;
