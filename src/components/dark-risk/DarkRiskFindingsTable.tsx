import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { presentDarkRiskFindingType, presentDarkRiskSource } from '@/lib/darkrisk/presentation';

export type DarkRiskFindingRow = {
  id: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  risk_score: number;
  title: string;
  asset: string;
  finding_type: string;
  confidence: 'low' | 'medium' | 'high';
  status: string;
  first_seen_at: string;
  last_seen_at: string;
  source: string;
  compromise_type: string;
  category?: string;
  site?: string;
  scope_status?: string;
  sensitive_tags?: string[];
};

const severityClasses: Record<DarkRiskFindingRow['severity'], string> = {
  critical: 'bg-red-500/20 text-red-300 border-red-500/40',
  high: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
  medium: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
  low: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  info: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
};

const formatDateTime = (value: string | null | undefined): string => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('it-IT');
};

const scopeClass = (scopeStatus: string | undefined): string => {
  const normalized = String(scopeStatus || '').toLowerCase();
  if (normalized === 'approved') return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
  if (normalized === 'candidate') return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
  if (normalized === 'excluded') return 'bg-red-500/20 text-red-300 border-red-500/40';
  return 'bg-slate-500/20 text-slate-300 border-slate-500/40';
};

const isRepositoryStyleTitle = (title: string): boolean => {
  const normalized = String(title || '').trim().toLowerCase();
  if (!normalized) return false;
  if (/\[part\s+\d+\s+of\s+\d+\]/i.test(normalized)) return true;
  if (/(\.txt|\.sql|\.csv|\.rar|\.zip|\.7z|\.log|\.json|\.xml|\.db|\.bak|\.xls|\.xlsx|\.doc|\.docx|\.pdf)\b/i.test(normalized)) return true;
  if (normalized.includes('/')) return true;
  return false;
};

const getRenderedTitle = (row: DarkRiskFindingRow, standardMode: boolean): string => {
  if (!standardMode) return row.title;
  if (!isRepositoryStyleTitle(row.title)) return row.title;
  return 'Evidenza repository classificata (dettaglio disponibile in modalità estesa)';
};

export const DarkRiskFindingsTable: React.FC<{
  rows: DarkRiskFindingRow[];
  subtitle?: string;
  standardMode?: boolean;
}> = ({ rows, subtitle, standardMode = false }) => {
  const PAGE_SIZE = 150;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [rows.length]);
  const visibleRows = useMemo(() => rows.slice(0, visibleCount), [rows, visibleCount]);
  const hasMoreRows = rows.length > visibleRows.length;

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle>Findings</CardTitle>
        {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nessuna minaccia critica rilevata nell'ultima scansione.
            Sono stati comunque controllati domini, selector e postura esterna secondo il perimetro autorizzato.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1160px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-3">Severity</th>
                    <th className="py-2 pr-3">Risk</th>
                    <th className="py-2 pr-3">Titolo</th>
                    <th className="py-2 pr-3">Asset</th>
                    <th className="py-2 pr-3">Sito</th>
                    <th className="py-2 pr-3">Scope</th>
                    <th className="py-2 pr-3">Categoria</th>
                    <th className="py-2 pr-3">Tipo</th>
                    <th className="py-2 pr-3">Confidence</th>
                    <th className="py-2 pr-3">Stato</th>
                    <th className="py-2 pr-3">Marcato il</th>
                    <th className="py-2 pr-3">Last seen</th>
                    <th className="py-2">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr key={row.id} className="border-b border-border/60 align-top">
                      <td className="py-2 pr-3"><Badge className={severityClasses[row.severity]}>{row.severity}</Badge></td>
                      <td className="py-2 pr-3 font-semibold">{row.risk_score}</td>
                      <td className="py-2 pr-3">
                        <p className="font-medium">{getRenderedTitle(row, standardMode)}</p>
                        <p className="text-xs text-muted-foreground">
                          {standardMode && isRepositoryStyleTitle(row.title) ? 'repository_exposure_signal' : row.compromise_type}
                        </p>
                        {(row.sensitive_tags || []).length > 0 ? (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {row.sensitive_tags?.map((tag) => (
                              <Badge key={`${row.id}-${tag}`} variant="outline" className="text-[10px]">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3">{row.asset}</td>
                      <td className="py-2 pr-3">{row.site || '-'}</td>
                      <td className="py-2 pr-3">
                        <Badge className={scopeClass(row.scope_status)}>{row.scope_status || 'unknown'}</Badge>
                      </td>
                      <td className="py-2 pr-3">{row.category || '-'}</td>
                      <td className="py-2 pr-3">{presentDarkRiskFindingType(row.finding_type)}</td>
                      <td className="py-2 pr-3">{row.confidence}</td>
                      <td className="py-2 pr-3">{row.status}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{formatDateTime(row.first_seen_at)}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{formatDateTime(row.last_seen_at)}</td>
                      <td className="py-2">{presentDarkRiskSource(row.source)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {hasMoreRows ? (
              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Visualizzati {visibleRows.length} di {rows.length} finding.
                </p>
                <button
                  type="button"
                  onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Mostra altri {Math.min(PAGE_SIZE, rows.length - visibleRows.length)}
                </button>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
};
