import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Database, Download, FileText, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { SurfaceScanJob } from '@/hooks/useSurfaceScanEngine';
import { useSurfaceScanReportRepository } from '@/hooks/useSurfaceScanReportRepository';
import { generateSurfaceScan360Pdf, type SurfaceScan360Report } from '@/lib/surfaceScan360PdfReport';
import { generateSurfaceScan360Docx } from '@/lib/surfaceScan360DocxReport';

interface SurfaceScanReportRepositoryProps {
  scanJobs: SurfaceScanJob[];
  canManage?: boolean;
}

const riskBadgeClass = (riskLevel?: string) => {
  const key = String(riskLevel || '').toLowerCase();
  if (key === 'critico' || key === 'critical') return 'bg-red-600 text-white';
  if (key === 'alto' || key === 'high') return 'bg-orange-600 text-white';
  if (key === 'medio' || key === 'medium') return 'bg-yellow-500 text-black';
  if (key === 'basso' || key === 'low') return 'bg-green-600 text-white';
  return 'bg-muted text-foreground';
};

export const SurfaceScanReportRepository: React.FC<SurfaceScanReportRepositoryProps> = ({ scanJobs, canManage = true }) => {
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
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5 text-primary" />
              Repository Report SurfaceScan360
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Report persistente canonico su scope organizzazione, aggiornato a completamento scansioni e disponibile per export PDF e DOCX.
            </p>
          </div>
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
      </CardHeader>
      <CardContent className="space-y-4">
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
                <TableHead>Risk</TableHead>
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
                  const riskScore = payload?.ai?.risk_score ?? payload?.scan?.overall_score;
                  const riskLevel = payload?.ai?.risk_level ?? payload?.scan?.risk_level;
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
      </CardContent>
    </Card>
  );
};

export default SurfaceScanReportRepository;
