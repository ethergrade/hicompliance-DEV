import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type Row = {
  id: string;
  site: string;
  scope_status: string;
  category: string;
  sensitive_tags: string[];
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  risk_score: number;
  title: string;
  asset: string;
  finding_type: string;
  source: string;
  query_kind?: string;
  source_origin?: string;
  last_seen_at?: string;
};

type DtiOverviewData = {
  privileged_sensitive_view: boolean;
  source_runs: {
    completed: number;
    partial: number;
    failed: number;
    skipped: number;
    total: number;
  };
  query_coverage: {
    at_domain_tld: number;
    selector: number;
    email_selector: number;
  };
  sensitive_totals: {
    domains: number;
    passwords: number;
    addresses: number;
    credit_cards: number;
    phone_numbers: number;
    total: number;
  };
  sensitive_by_asset: Array<{
    asset_scope: string;
    domains: number;
    passwords: number;
    addresses: number;
    credit_cards: number;
    phone_numbers: number;
    total: number;
  }>;
  sensitive_samples: Array<{
    source: string;
    query_kind: string;
    query_term: string;
    asset_scope: string;
    tag: string;
    value: string;
    masked_value: string;
    created_at: string | null;
  }>;
  latest_scan_run_id: string | null;
};

type ScopePieRow = {
  scope: string;
  count: number;
};

type SensitiveTagKey = 'domains' | 'passwords' | 'addresses' | 'credit_cards' | 'phone_numbers';
type SensitiveDetailRow = {
  tag: SensitiveTagKey;
  site: string;
  severity: Row['severity'];
  risk_score: number;
  title: string;
  asset: string;
  finding_type: string;
  source: string;
};

const categoryPalette = ['#8b5cf6', '#06b6d4', '#22c55e', '#f59e0b', '#ef4444', '#64748b', '#3b82f6', '#a855f7'];
const scopePalette: Record<string, string> = {
  approved: '#22c55e',
  candidate: '#f59e0b',
  excluded: '#ef4444',
  unknown: '#64748b',
};

const sensitiveLabel: Record<string, string> = {
  domains: 'Domini',
  passwords: 'Password',
  addresses: 'Indirizzi',
  credit_cards: 'Carte di credito',
  phone_numbers: 'Numeri di telefono',
};

const severityRank: Record<Row['severity'], number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

const severityTone: Record<Row['severity'], string> = {
  critical: 'bg-red-500/20 text-red-300 border-red-500/40',
  high: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
  medium: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
  low: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  info: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
};

const scopeTone: Record<string, string> = {
  approved: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  candidate: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  excluded: 'bg-red-500/20 text-red-300 border-red-500/40',
  unknown: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
};

function normalizeSensitiveTag(value: string): SensitiveTagKey | null {
  const normalized = String(value || '').trim().toLowerCase();
  if (['domains', 'domain', 'dominio', 'domini'].includes(normalized)) return 'domains';
  if (['passwords', 'password', 'credential', 'credentials', 'credenziale', 'credenziali'].includes(normalized)) return 'passwords';
  if (['addresses', 'address', 'indirizzo', 'indirizzi'].includes(normalized)) return 'addresses';
  if (['credit_cards', 'credit_card', 'cards', 'card', 'carta', 'carte'].includes(normalized)) return 'credit_cards';
  if (['phone_numbers', 'phone_number', 'phone', 'phones', 'telefono', 'telefoni'].includes(normalized)) return 'phone_numbers';
  return null;
}

function shortSiteLabel(value: string): string {
  if (value.length <= 38) return value;
  return `${value.slice(0, 35)}...`;
}

function isCredentialCompromiseRow(row: Row): boolean {
  const sourceText = `${row.category || ''} ${row.finding_type || ''} ${row.title || ''}`.toLowerCase();
  return /credential|credenzial|password|stealer|compromis/.test(sourceText);
}

export const DarkRiskFindingsAnalytics: React.FC<{ rows: Row[]; extendedMode?: boolean; dti?: DtiOverviewData | null }> = ({
  rows,
  extendedMode = false,
  dti = null,
}) => {
  const data = useMemo(() => {
    const siteCategory = new Map<string, Record<string, number>>();
    const siteFindings = new Map<string, Row[]>();
    const categoryTotals = new Map<string, number>();
    const scopeTotals = new Map<string, number>();
    const sensitiveTotals = new Map<SensitiveTagKey, number>();
    const sensitiveDetails: SensitiveDetailRow[] = [];

    for (const row of rows) {
      const site = row.site || 'n/a';
      const category = row.category || 'Minacce rilevate';
      const scope = (row.scope_status || 'unknown').toLowerCase();

      if (!siteCategory.has(site)) siteCategory.set(site, { total: 0 });
      const siteBucket = siteCategory.get(site)!;
      siteBucket[category] = (siteBucket[category] || 0) + 1;
      siteBucket.total = (siteBucket.total || 0) + 1;

      categoryTotals.set(category, (categoryTotals.get(category) || 0) + 1);
      scopeTotals.set(scope, (scopeTotals.get(scope) || 0) + 1);

      if (!siteFindings.has(site)) siteFindings.set(site, []);
      siteFindings.get(site)!.push(row);

      const isScopeDomainIntelQuery = String(row.query_kind || '').toLowerCase() === 'at_domain_tld';
      for (const tag of row.sensitive_tags || []) {
        const normalizedTag = normalizeSensitiveTag(tag);
        if (!normalizedTag) continue;
        if (isScopeDomainIntelQuery) {
          sensitiveTotals.set(normalizedTag, (sensitiveTotals.get(normalizedTag) || 0) + 1);
          sensitiveDetails.push({
            tag: normalizedTag,
            site,
            severity: row.severity,
            risk_score: Number(row.risk_score || 0),
            title: row.title,
            asset: row.asset,
            finding_type: row.finding_type,
            source: row.source,
          });
        }
      }
    }

    const topCategories = Array.from(categoryTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name]) => name);

    const siteRows = Array.from(siteCategory.entries())
      .map(([site, bucket]) => {
        const rowData: Record<string, number | string> = {
          site,
          siteLabel: shortSiteLabel(site),
          total: Number(bucket.total || 0),
        };
        for (const category of topCategories) {
          rowData[category] = Number(bucket[category] || 0);
        }
        return rowData;
      })
      .sort((a, b) => Number(b.total || 0) - Number(a.total || 0))
      .slice(0, 12);

    const scopeRows = Array.from(scopeTotals.entries())
      .map(([scope, count]) => ({ scope, count }))
      .sort((a, b) => b.count - a.count);

    const sensitiveRows = (Object.keys(sensitiveLabel) as SensitiveTagKey[]).map((tag) => {
      const dtiCount = dti?.sensitive_totals?.[tag];
      return {
        tag,
        label: sensitiveLabel[tag],
        count: typeof dtiCount === 'number' ? dtiCount : (sensitiveTotals.get(tag) || 0),
      };
    });

    const detailedSensitiveRows = sensitiveDetails
      .sort((a, b) => {
        const severityDelta = severityRank[b.severity] - severityRank[a.severity];
        if (severityDelta !== 0) return severityDelta;
        return b.risk_score - a.risk_score;
      })
      .slice(0, 80);

    const groupedAssetRows = Array.from(siteFindings.entries())
      .map(([site, groupedRows]) => {
        const sorted = [...groupedRows].sort((a, b) => {
          const severityDelta = severityRank[b.severity] - severityRank[a.severity];
          if (severityDelta !== 0) return severityDelta;
          return Number(b.risk_score || 0) - Number(a.risk_score || 0);
        });
        return {
          site,
          scope_status: String(sorted[0]?.scope_status || 'unknown').toLowerCase(),
          total: sorted.length,
          maxSeverity: sorted[0]?.severity || 'info',
          rows: sorted,
        };
      })
      .sort((a, b) => {
        const severityDelta = severityRank[b.maxSeverity] - severityRank[a.maxSeverity];
        if (severityDelta !== 0) return severityDelta;
        return b.total - a.total;
      });

    const credentialCompromiseRows = rows
      .filter((row) => isCredentialCompromiseRow(row))
      .sort((a, b) => {
        const severityDelta = severityRank[b.severity] - severityRank[a.severity];
        if (severityDelta !== 0) return severityDelta;
        return Number(b.risk_score || 0) - Number(a.risk_score || 0);
      })
      .slice(0, 120);

    return {
      topCategories,
      siteRows,
      scopeRows,
      sensitiveRows,
      detailedSensitiveRows,
      groupedAssetRows,
      credentialCompromiseRows,
    };
  }, [rows, dti]);

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle>Analytics Findings</CardTitle>
        <p className="text-xs text-muted-foreground">
          Distribuzione per sito, scope e categoria + classificazione evidenze sensibili.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {dti ? (
          <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Query @domain.tld: {dti.query_coverage.at_domain_tld || 0}</Badge>
              <Badge variant="outline">Query selector: {dti.query_coverage.selector || 0}</Badge>
              <Badge variant="outline">Query email: {dti.query_coverage.email_selector || 0}</Badge>
              <Badge variant="outline">Source run: {dti.source_runs.completed}/{dti.source_runs.total} completed</Badge>
              {dti.source_runs.partial > 0 ? <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40">partial {dti.source_runs.partial}</Badge> : null}
              {dti.source_runs.failed > 0 ? <Badge className="bg-red-500/20 text-red-300 border-red-500/40">failed {dti.source_runs.failed}</Badge> : null}
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 rounded-lg border border-border/70 bg-muted/20 p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">Finding per sito (stack categoria)</p>
              <Badge variant="outline">Top {data.siteRows.length} siti</Badge>
            </div>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.siteRows} margin={{ top: 8, right: 12, left: 0, bottom: 28 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                  <XAxis dataKey="siteLabel" interval={0} angle={-18} textAnchor="end" height={56} stroke="#94a3b8" />
                  <YAxis allowDecimals={false} stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{ background: '#0b1220', border: '1px solid rgba(148,163,184,0.3)' }}
                    formatter={(value: number, key: string) => [value, key]}
                    labelFormatter={(label) => String(label)}
                  />
                  <Legend />
                  {data.topCategories.map((category, index) => (
                    <Bar key={category} dataKey={category} stackId="siteCategories" fill={categoryPalette[index % categoryPalette.length]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
            <p className="text-sm font-medium mb-2">Distribuzione scope</p>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.scopeRows}
                    dataKey="count"
                    nameKey="scope"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={(entry: ScopePieRow & { percent?: number }) =>
                      `${entry.scope} ${(Number(entry.percent || 0) * 100).toFixed(0)}%`
                    }
                  >
                    {data.scopeRows.map((entry) => (
                      <Cell key={entry.scope} fill={scopePalette[entry.scope] || scopePalette.unknown} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#0b1220', border: '1px solid rgba(148,163,184,0.3)' }}
                    formatter={(value: number, key: string) => [value, key]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
          <p className="text-sm font-medium mb-3">Evidenze sensibili rilevate nella collection</p>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {data.sensitiveRows.map((row) => (
              <div key={row.tag} className="rounded-md border border-border/60 bg-background/40 p-3">
                <p className="text-xs text-muted-foreground">{row.label}</p>
                <p className="text-xl font-semibold mt-1">{row.count}</p>
              </div>
            ))}
          </div>
          {(() => {
            const passwordCount = data.sensitiveRows.find((row) => row.tag === 'passwords')?.count || 0;
            if (data.credentialCompromiseRows.length === 0 || passwordCount > 0) return null;
            return (
              <p className="mt-3 text-xs text-amber-300">
                Sono presenti segnali di compromissione credenziale ma non sono stati estratti valori password in chiaro dai payload correnti.
              </p>
            );
          })()}
          {extendedMode ? (
            <div className="mt-4 rounded-md border border-border/60 bg-background/30 p-3">
              <p className="text-xs font-medium mb-2">Dettaglio evidenze sensibili su query domini in scope (`@dominio`)</p>
              {(dti?.sensitive_samples?.length || 0) === 0 && data.detailedSensitiveRows.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nessuna evidenza sensibile classificata nel ciclo corrente.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-xs">
                    <thead>
                      <tr className="border-b border-border/60 text-left text-muted-foreground">
                        <th className="py-2 pr-3">Categoria</th>
                        <th className="py-2 pr-3">Dominio / Sito</th>
                        <th className="py-2 pr-3">Query</th>
                        <th className="py-2 pr-3">Valore</th>
                        <th className="py-2">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(dti?.sensitive_samples?.length || 0) > 0 ? (
                        dti!.sensitive_samples.slice(0, 120).map((row, index) => {
                          const normalizedTag = normalizeSensitiveTag(row.tag);
                          return (
                            <tr key={`${row.tag}-${row.asset_scope}-${index}`} className="border-b border-border/40 align-top">
                              <td className="py-2 pr-3">{normalizedTag ? sensitiveLabel[normalizedTag] : row.tag}</td>
                              <td className="py-2 pr-3 font-medium">{row.asset_scope || '-'}</td>
                              <td className="py-2 pr-3">{row.query_term || '-'}</td>
                              <td className="py-2 pr-3 font-mono text-[11px] break-all">{row.value || row.masked_value || '-'}</td>
                              <td className="py-2">{row.source || 'DarkRisk360'}</td>
                            </tr>
                          );
                        })
                      ) : (
                        data.detailedSensitiveRows.map((row, index) => (
                          <tr key={`${row.tag}-${row.site}-${index}`} className="border-b border-border/40 align-top">
                            <td className="py-2 pr-3">{sensitiveLabel[row.tag]}</td>
                            <td className="py-2 pr-3 font-medium">{row.site}</td>
                            <td className="py-2 pr-3">-</td>
                            <td className="py-2 pr-3">-</td>
                            <td className="py-2">{row.source}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground mt-4">
              Dettaglio contenuti disponibile in modalità DarkRisk360 Estesa. In Standard vengono mostrati solo i conteggi.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-sm font-medium">Compromissioni credenziali rilevate (lista in chiaro)</p>
            <Badge variant="outline">{data.credentialCompromiseRows.length}</Badge>
          </div>
          {data.credentialCompromiseRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nessuna compromissione credenziale classificata nel filtro corrente.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-xs">
                <thead>
                  <tr className="border-b border-border/60 text-left text-muted-foreground">
                    <th className="py-2 pr-3">Severity</th>
                    <th className="py-2 pr-3">Risk</th>
                    <th className="py-2 pr-3">Sito</th>
                    <th className="py-2 pr-3">Asset</th>
                    <th className="py-2 pr-3">Titolo</th>
                    <th className="py-2 pr-3">Tipo</th>
                    <th className="py-2">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {data.credentialCompromiseRows.map((row) => (
                    <tr key={`credential-row-${row.id}`} className="border-b border-border/40 align-top">
                      <td className="py-2 pr-3">
                        <Badge className={severityTone[row.severity]}>{row.severity}</Badge>
                      </td>
                      <td className="py-2 pr-3 font-semibold">{row.risk_score}</td>
                      <td className="py-2 pr-3">{row.site || '-'}</td>
                      <td className="py-2 pr-3">{row.asset || '-'}</td>
                      <td className="py-2 pr-3">{row.title}</td>
                      <td className="py-2 pr-3">{row.finding_type}</td>
                      <td className="py-2">{row.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-sm font-medium">Lista Asset con Finding (collassabile)</p>
            <Badge variant="outline">{data.groupedAssetRows.length} asset</Badge>
          </div>
          {data.groupedAssetRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessun finding disponibile per il filtro corrente.</p>
          ) : (
            <div className="space-y-3">
              {data.groupedAssetRows.map((assetGroup, index) => (
                <details
                  key={`${assetGroup.site}-${index}`}
                  className="rounded-md border border-border/60 bg-background/30 p-3"
                  open={index < 2}
                >
                  <summary className="cursor-pointer list-none flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-medium">{assetGroup.site}</span>
                      <Badge className={scopeTone[assetGroup.scope_status] || scopeTone.unknown}>
                        {assetGroup.scope_status}
                      </Badge>
                      <Badge variant="outline">{assetGroup.total} finding</Badge>
                      <Badge className={severityTone[assetGroup.maxSeverity]}>
                        max {assetGroup.maxSeverity}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">Apri / Chiudi</span>
                  </summary>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[980px] text-xs">
                      <thead>
                        <tr className="border-b border-border/60 text-left text-muted-foreground">
                          <th className="py-2 pr-3">Severity</th>
                          <th className="py-2 pr-3">Risk</th>
                          <th className="py-2 pr-3">Titolo</th>
                          <th className="py-2 pr-3">Tipo</th>
                          <th className="py-2 pr-3">Categoria</th>
                          <th className="py-2 pr-3">Source</th>
                          <th className="py-2">Tag sensibili</th>
                        </tr>
                      </thead>
                      <tbody>
                        {assetGroup.rows.map((row) => (
                          <tr key={row.id} className="border-b border-border/40 align-top">
                            <td className="py-2 pr-3">
                              <Badge className={severityTone[row.severity]}>{row.severity}</Badge>
                            </td>
                            <td className="py-2 pr-3 font-semibold">{row.risk_score}</td>
                            <td className="py-2 pr-3">{row.title}</td>
                            <td className="py-2 pr-3">{row.finding_type}</td>
                            <td className="py-2 pr-3">{row.category}</td>
                            <td className="py-2 pr-3">{row.source}</td>
                            <td className="py-2">
                              {(row.sensitive_tags || []).length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {row.sensitive_tags.map((tag) => {
                                    const normalizedTag = normalizeSensitiveTag(tag);
                                    return (
                                      <Badge key={`${row.id}-${tag}`} variant="outline" className="text-[10px]">
                                        {normalizedTag ? sensitiveLabel[normalizedTag] : tag}
                                      </Badge>
                                    );
                                  })}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
