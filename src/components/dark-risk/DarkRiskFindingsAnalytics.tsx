import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Row = {
  id: string;
  site: string;
  scope_status: string;
  category: string;
  sensitive_tags: string[];
  severity: "info" | "low" | "medium" | "high" | "critical";
  risk_score: number;
  title: string;
  asset: string;
  finding_type: string;
  source: string;
  confidence?: "low" | "medium" | "high";
  query_kind?: string;
  query_term?: string;
  source_origin?: string;
  first_seen_at?: string;
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
    match_policy?: string;
    extraction_confidence?: string;
    evidence_scope?: string;
    created_at: string | null;
  }>;
  intelx_stats?: {
    email_queries_run?: number;
    strict_password_hits?: number;
    metadata_only_hits?: number;
  };
  latest_scan_run_id: string | null;
};

type ScopePieRow = {
  scope: string;
  count: number;
};

type SensitiveTagKey =
  | "domains"
  | "passwords"
  | "addresses"
  | "credit_cards"
  | "phone_numbers";
type SensitiveDetailRow = {
  tag: SensitiveTagKey;
  site: string;
  severity: Row["severity"];
  risk_score: number;
  title: string;
  asset: string;
  finding_type: string;
  source: string;
  markedAt?: string | null;
};

type SensitiveSampleViewRow = {
  id: string;
  tag: SensitiveTagKey | null;
  categoryLabel: string;
  assetScope: string;
  queryTerm: string;
  value: string;
  source: string;
  queryKind: string;
  createdAt: string | null;
};

type IdentityEvidenceRow = {
  identity: string;
  domains: number;
  passwords: number;
  addresses: number;
  credit_cards: number;
  phone_numbers: number;
  total: number;
  samples: DtiOverviewData["sensitive_samples"];
  passwordValues: string[];
  sourceLabels: string[];
  lastMarkedAt: string | null;
};

const invalidPasswordEvidenceTokens = new Set([
  "query",
  "selector",
  "metadata",
  "record",
  "source",
  "field",
  "password",
  "passwd",
  "pwd",
  "secret",
  "token",
  "unknown",
  "null",
  "none",
  "n/a",
  "na",
  "&#39",
  "&apos;",
  "&quot;",
]);

function isDisplayablePasswordValue(value: string | null | undefined): boolean {
  const normalized = String(value || "").trim();
  if (!normalized) return false;
  const lowered = normalized.toLowerCase();
  if (normalized.length < 4 || normalized.length > 120) return false;
  if (invalidPasswordEvidenceTokens.has(lowered)) return false;
  if (/^&#\d{1,6};?$/i.test(normalized)) return false;
  if (/^&[a-z]{2,8};$/i.test(normalized)) return false;
  if (lowered.includes("@")) return false;
  if (/[=:]/.test(normalized)) return false;
  if (/^https?:\/\//i.test(normalized)) return false;
  if (/^[*_#\-.]+$/.test(normalized)) return false;
  return true;
}

const categoryPalette = [
  "#8b5cf6",
  "#06b6d4",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#64748b",
  "#3b82f6",
  "#a855f7",
];
const identityLegendItems = [
  { label: "Password", color: "#f59e0b" },
  { label: "Domini", color: "#8b5cf6" },
  { label: "Indirizzi", color: "#22c55e" },
  { label: "Carte", color: "#ef4444" },
  { label: "Telefoni", color: "#06b6d4" },
];
const scopePalette: Record<string, string> = {
  approved: "#22c55e",
  candidate: "#f59e0b",
  excluded: "#ef4444",
  unknown: "#64748b",
};

const sensitiveLabel: Record<string, string> = {
  domains: "Domini",
  passwords: "Password",
  addresses: "Indirizzi",
  credit_cards: "Carte di credito",
  phone_numbers: "Numeri di telefono",
};

const severityRank: Record<Row["severity"], number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

const severityTone: Record<Row["severity"], string> = {
  critical: "bg-red-500/20 text-red-300 border-red-500/40",
  high: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  medium: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
  low: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  info: "bg-slate-500/20 text-slate-300 border-slate-500/40",
};

const scopeTone: Record<string, string> = {
  approved: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  candidate: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  excluded: "bg-red-500/20 text-red-300 border-red-500/40",
  unknown: "bg-slate-500/20 text-slate-300 border-slate-500/40",
};

function ChartLegend({
  items,
}: {
  items: Array<{ label: string; color: string }>;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs">
      {items.map((item) => (
        <span
          key={`${item.label}-${item.color}`}
          className="inline-flex items-center gap-1.5 text-muted-foreground"
        >
          <span
            className="h-2.5 w-2.5 rounded-[2px]"
            style={{ backgroundColor: item.color }}
          />
          <span>{item.label}</span>
        </span>
      ))}
    </div>
  );
}

function IdentityCredentialTooltip({ active, payload, label }: any) {
  if (!active || !Array.isArray(payload) || payload.length === 0) return null;
  const row = payload[0]?.payload as
    | (IdentityEvidenceRow & { identityLabel?: string })
    | undefined;
  if (!row) return null;
  const passwordValues = Array.isArray(row.passwordValues)
    ? row.passwordValues
    : [];
  const preview = passwordValues;
  return (
    <div className="rounded-md border border-border/70 bg-[#0b1220] p-3 text-xs shadow-xl max-w-[420px]">
      <p className="font-medium mb-1">
        {String(label || row.identityLabel || row.identity || "")}
      </p>
      <div className="text-muted-foreground mb-2">
        Password:{" "}
        <span className="text-foreground font-semibold">{row.passwords}</span> ·
        Domini:{" "}
        <span className="text-foreground font-semibold">{row.domains}</span>
      </div>
      <p className="text-[11px] text-muted-foreground mb-1">
        Password in chiaro (lista completa):
      </p>
      {preview.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Nessuna password valida classificata.
        </p>
      ) : (
        <div className="max-h-40 overflow-y-auto space-y-1">
          {preview.map((value) => (
            <div
              key={`${row.identity}-${value}`}
              className="font-mono text-[11px] break-all"
            >
              {value}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function normalizeSensitiveTag(value: string): SensitiveTagKey | null {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (["domains", "domain", "dominio", "domini"].includes(normalized))
    return "domains";
  if (
    [
      "passwords",
      "password",
      "credential",
      "credentials",
      "credenziale",
      "credenziali",
    ].includes(normalized)
  )
    return "passwords";
  if (["addresses", "address", "indirizzo", "indirizzi"].includes(normalized))
    return "addresses";
  if (
    ["credit_cards", "credit_card", "cards", "card", "carta", "carte"].includes(
      normalized,
    )
  )
    return "credit_cards";
  if (
    [
      "phone_numbers",
      "phone_number",
      "phone",
      "phones",
      "telefono",
      "telefoni",
    ].includes(normalized)
  )
    return "phone_numbers";
  return null;
}

function shortSiteLabel(value: string): string {
  if (value.length <= 38) return value;
  return `${value.slice(0, 35)}...`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("it-IT");
}

function displayDarkRiskSource(value: string): string {
  const source = String(value || "").trim();
  if (!source) return "DarkRisk360";
  if (/intelx|firecrawl|openai/i.test(source)) return "DarkRisk360";
  return source;
}

function isEmailLike(value: string): boolean {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return Boolean(normalized && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized));
}

function isEmailSelectorCoverageKind(
  queryKind: string | undefined,
  queryTerm: string | undefined,
): boolean {
  const kind = String(queryKind || "").toLowerCase();
  if (kind === "email_selector") return true;
  if (kind === "selector" && isEmailLike(String(queryTerm || ""))) return true;
  return false;
}

function isIdentitySensitiveSample(
  row: DtiOverviewData["sensitive_samples"][number],
): boolean {
  const queryKind = String(row.query_kind || "").toLowerCase();
  const tag = normalizeSensitiveTag(row.tag || "");
  return (
    isEmailSelectorCoverageKind(queryKind, String(row.query_term || "")) &&
    Boolean(tag)
  );
}

function normalizeSearchText(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function tokenizePowerQuery(query: string): string[] {
  return (
    query
      .match(/"[^"]+"|'[^']+'|\S+/g)
      ?.map((token) => token.replace(/^['"]|['"]$/g, "")) || []
  );
}

function sensitiveSampleField(
  row: SensitiveSampleViewRow,
  field: string,
): string {
  const normalizedField = normalizeSearchText(field);
  if (["categoria", "category", "tag", "tipo"].includes(normalizedField))
    return `${row.categoryLabel} ${row.tag || ""}`;
  if (["dominio", "domain", "site", "sito", "asset"].includes(normalizedField))
    return row.assetScope;
  if (["query", "q"].includes(normalizedField)) return row.queryTerm;
  if (["valore", "value", "contenuto", "evidenza"].includes(normalizedField))
    return row.value;
  if (["source", "fonte"].includes(normalizedField)) return row.source;
  if (["kind", "query_kind", "origine"].includes(normalizedField))
    return row.queryKind;
  if (
    ["marcato", "marked", "date", "data", "created", "created_at"].includes(
      normalizedField,
    )
  ) {
    return `${row.createdAt || ""} ${formatDateTime(row.createdAt)}`;
  }
  if (["has", "contiene"].includes(normalizedField))
    return `${row.categoryLabel} ${row.tag || ""} ${row.value}`;
  return `${row.categoryLabel} ${row.assetScope} ${row.queryTerm} ${row.value} ${row.source} ${row.queryKind} ${row.createdAt || ""} ${formatDateTime(row.createdAt)}`;
}

function matchesSensitivePowerQuery(
  row: SensitiveSampleViewRow,
  query: string,
): boolean {
  const tokens = tokenizePowerQuery(query);
  if (tokens.length === 0) return true;

  return tokens.every((token) => {
    const separatorIndex = token.indexOf(":");
    if (separatorIndex > 0) {
      const field = token.slice(0, separatorIndex);
      const expected = normalizeSearchText(token.slice(separatorIndex + 1));
      if (!expected) return true;
      return normalizeSearchText(sensitiveSampleField(row, field)).includes(
        expected,
      );
    }
    const expected = normalizeSearchText(token);
    return normalizeSearchText(sensitiveSampleField(row, "all")).includes(
      expected,
    );
  });
}

export const DarkRiskFindingsAnalytics: React.FC<{
  rows: Row[];
  extendedMode?: boolean;
  dti?: DtiOverviewData | null;
}> = ({ rows, extendedMode = false, dti = null }) => {
  const [sensitivePowerQuery, setSensitivePowerQuery] = useState("");
  const [sensitiveTagFilter, setSensitiveTagFilter] = useState<
    "all" | SensitiveTagKey
  >("all");

  const data = useMemo(() => {
    const siteCategory = new Map<string, Record<string, number>>();
    const siteFindings = new Map<string, Row[]>();
    const categoryTotals = new Map<string, number>();
    const scopeTotals = new Map<string, number>();
    const sensitiveTotals = new Map<SensitiveTagKey, number>();
    const sensitiveDetails: SensitiveDetailRow[] = [];

    for (const row of rows) {
      const site = row.site || "n/a";
      const category = row.category || "Minacce rilevate";
      const scope = (row.scope_status || "unknown").toLowerCase();

      if (!siteCategory.has(site)) siteCategory.set(site, { total: 0 });
      const siteBucket = siteCategory.get(site)!;
      siteBucket[category] = (siteBucket[category] || 0) + 1;
      siteBucket.total = (siteBucket.total || 0) + 1;

      categoryTotals.set(category, (categoryTotals.get(category) || 0) + 1);
      scopeTotals.set(scope, (scopeTotals.get(scope) || 0) + 1);

      if (!siteFindings.has(site)) siteFindings.set(site, []);
      siteFindings.get(site)!.push(row);

      const isScopeDomainIntelQuery =
        String(row.query_kind || "").toLowerCase() === "at_domain_tld";
      for (const tag of row.sensitive_tags || []) {
        const normalizedTag = normalizeSensitiveTag(tag);
        if (!normalizedTag) continue;
        if (isScopeDomainIntelQuery) {
          sensitiveTotals.set(
            normalizedTag,
            (sensitiveTotals.get(normalizedTag) || 0) + 1,
          );
          sensitiveDetails.push({
            tag: normalizedTag,
            site,
            severity: row.severity,
            risk_score: Number(row.risk_score || 0),
            title: row.title,
            asset: row.asset,
            finding_type: row.finding_type,
            source: displayDarkRiskSource(row.source),
            markedAt: row.first_seen_at || row.last_seen_at || null,
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

    const sensitiveRows = (
      Object.keys(sensitiveLabel) as SensitiveTagKey[]
    ).map((tag) => {
      const dtiCount = dti?.sensitive_totals?.[tag];
      return {
        tag,
        label: sensitiveLabel[tag],
        count:
          typeof dtiCount === "number"
            ? dtiCount
            : sensitiveTotals.get(tag) || 0,
      };
    });

    const detailedSensitiveRows = sensitiveDetails
      .sort((a, b) => {
        const severityDelta =
          severityRank[b.severity] - severityRank[a.severity];
        if (severityDelta !== 0) return severityDelta;
        return b.risk_score - a.risk_score;
      })
      .slice(0, 80);

    const groupedAssetRows = Array.from(siteFindings.entries())
      .map(([site, groupedRows]) => {
        const sorted = [...groupedRows].sort((a, b) => {
          const severityDelta =
            severityRank[b.severity] - severityRank[a.severity];
          if (severityDelta !== 0) return severityDelta;
          return Number(b.risk_score || 0) - Number(a.risk_score || 0);
        });
        return {
          site,
          scope_status: String(
            sorted[0]?.scope_status || "unknown",
          ).toLowerCase(),
          total: sorted.length,
          maxSeverity: sorted[0]?.severity || "info",
          rows: sorted,
        };
      })
      .sort((a, b) => {
        const severityDelta =
          severityRank[b.maxSeverity] - severityRank[a.maxSeverity];
        if (severityDelta !== 0) return severityDelta;
        return b.total - a.total;
      });

    const identityMap = new Map<string, IdentityEvidenceRow>();
    for (const sample of dti?.sensitive_samples || []) {
      if (!isIdentitySensitiveSample(sample)) continue;
      const tag = normalizeSensitiveTag(sample.tag || "");
      if (!tag) continue;
      const identity = String(
        sample.query_term || sample.asset_scope || "n/a",
      ).toLowerCase();
      const bucket = identityMap.get(identity) || {
        identity,
        domains: 0,
        passwords: 0,
        addresses: 0,
        credit_cards: 0,
        phone_numbers: 0,
        total: 0,
        samples: [],
        passwordValues: [],
        sourceLabels: [],
        lastMarkedAt: null,
      };
      const sampleValue = String(
        sample.value || sample.masked_value || "",
      ).trim();
      if (tag === "passwords") {
        if (!isDisplayablePasswordValue(sampleValue)) continue;
        if (!bucket.passwordValues.includes(sampleValue)) {
          bucket.passwordValues.push(sampleValue);
        }
      }
      bucket[tag] += 1;
      bucket.total += 1;
      const sourceLabel = displayDarkRiskSource(
        String(sample.source || "DarkRisk360"),
      );
      if (sourceLabel && !bucket.sourceLabels.includes(sourceLabel)) {
        bucket.sourceLabels.push(sourceLabel);
      }
      const sampleTs =
        sample.created_at && Number.isFinite(Date.parse(sample.created_at))
          ? sample.created_at
          : null;
      if (
        sampleTs &&
        (!bucket.lastMarkedAt ||
          Date.parse(sampleTs) > Date.parse(bucket.lastMarkedAt))
      ) {
        bucket.lastMarkedAt = sampleTs;
      }
      if (bucket.samples.length < 40) bucket.samples.push(sample);
      identityMap.set(identity, bucket);
    }

    const identityRows = Array.from(identityMap.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 12)
      .map((row) => ({
        ...row,
        identityLabel: shortSiteLabel(row.identity),
      }));

    const identityFindingRows = rows
      .filter((row) =>
        isEmailSelectorCoverageKind(
          row.query_kind,
          row.query_term || row.asset,
        ),
      )
      .map((row) => ({
        email: String(
          row.query_term || row.asset || row.site || "-",
        ).toLowerCase(),
        severity: row.severity,
        confidence: String(row.confidence || "medium"),
        riskScore: Number(row.risk_score || 0),
        title: row.title,
        source: displayDarkRiskSource(row.source),
        firstSeenAt: row.first_seen_at || null,
        lastSeenAt: row.last_seen_at || null,
      }))
      .sort((a, b) => {
        const severityDelta =
          severityRank[b.severity] - severityRank[a.severity];
        if (severityDelta !== 0) return severityDelta;
        return b.riskScore - a.riskScore;
      })
      .slice(0, 200);

    const sensitiveSampleRows: SensitiveSampleViewRow[] = (
      dti?.sensitive_samples || []
    ).map((sample, index) => {
      const tag = normalizeSensitiveTag(sample.tag || "");
      return {
        id: `${sample.query_kind || "sample"}-${sample.asset_scope || "asset"}-${sample.tag || "tag"}-${index}`,
        tag,
        categoryLabel: tag
          ? sensitiveLabel[tag]
          : String(sample.tag || "Altro"),
        assetScope: String(sample.asset_scope || "-"),
        queryTerm: String(sample.query_term || "-"),
        value: String(sample.value || sample.masked_value || "-"),
        source: displayDarkRiskSource(String(sample.source || "DarkRisk360")),
        queryKind: String(sample.query_kind || "-"),
        createdAt: sample.created_at || null,
      };
    });

    return {
      topCategories,
      siteRows,
      scopeRows,
      sensitiveRows,
      detailedSensitiveRows,
      groupedAssetRows,
      identityRows,
      identityFindingRows,
      sensitiveSampleRows,
    };
  }, [rows, dti]);

  const filteredSensitiveSampleRows = useMemo(() => {
    return data.sensitiveSampleRows.filter((row) => {
      if (sensitiveTagFilter !== "all" && row.tag !== sensitiveTagFilter)
        return false;
      return matchesSensitivePowerQuery(row, sensitivePowerQuery);
    });
  }, [data.sensitiveSampleRows, sensitivePowerQuery, sensitiveTagFilter]);

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle>Analytics Findings</CardTitle>
        <p className="text-xs text-muted-foreground">
          Distribuzione per sito, scope e categoria + classificazione evidenze
          sensibili.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {dti ? (
          <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                Query @domain.tld: {dti.query_coverage.at_domain_tld || 0}
              </Badge>
              <Badge variant="outline">
                Query selector: {dti.query_coverage.selector || 0}
              </Badge>
              <Badge variant="outline">
                Query email: {dti.query_coverage.email_selector || 0}
              </Badge>
              <Badge variant="outline">
                Source run: {dti.source_runs.completed}/{dti.source_runs.total}{" "}
                completed
              </Badge>
              <Badge variant="outline">
                Email query run:{" "}
                {Number(dti.intelx_stats?.email_queries_run || 0)}
              </Badge>
              <Badge variant="outline">
                Strict password hit:{" "}
                {Number(dti.intelx_stats?.strict_password_hits || 0)}
              </Badge>
              {Number(dti.intelx_stats?.metadata_only_hits || 0) > 0 ? (
                <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40">
                  metadata-only excluded{" "}
                  {Number(dti.intelx_stats?.metadata_only_hits || 0)}
                </Badge>
              ) : null}
              {dti.source_runs.partial > 0 ? (
                <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40">
                  partial {dti.source_runs.partial}
                </Badge>
              ) : null}
              {dti.source_runs.failed > 0 ? (
                <Badge className="bg-red-500/20 text-red-300 border-red-500/40">
                  failed {dti.source_runs.failed}
                </Badge>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 rounded-lg border border-border/70 bg-muted/20 p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">
                Finding per sito (stack categoria)
              </p>
              <Badge variant="outline">Top {data.siteRows.length} siti</Badge>
            </div>
            <div className="h-[265px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.siteRows}
                  margin={{ top: 8, right: 12, left: 0, bottom: 68 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(148,163,184,0.25)"
                  />
                  <XAxis
                    dataKey="siteLabel"
                    interval={0}
                    angle={-18}
                    textAnchor="end"
                    height={76}
                    stroke="#94a3b8"
                  />
                  <YAxis allowDecimals={false} stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{
                      background: "#0b1220",
                      border: "1px solid rgba(148,163,184,0.3)",
                    }}
                    formatter={(value: number, key: string) => [value, key]}
                    labelFormatter={(label) => String(label)}
                  />
                  {data.topCategories.map((category, index) => (
                    <Bar
                      key={category}
                      dataKey={category}
                      stackId="siteCategories"
                      fill={categoryPalette[index % categoryPalette.length]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <ChartLegend
              items={data.topCategories.map((category, index) => ({
                label: category,
                color: categoryPalette[index % categoryPalette.length],
              }))}
            />
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
                      <Cell
                        key={entry.scope}
                        fill={scopePalette[entry.scope] || scopePalette.unknown}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "#0b1220",
                      border: "1px solid rgba(148,163,184,0.3)",
                    }}
                    formatter={(value: number, key: string) => [value, key]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
          <p className="text-sm font-medium mb-3">
            Evidenze sensibili rilevate nella collection
          </p>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {data.sensitiveRows.map((row) => (
              <div
                key={row.tag}
                className="rounded-md border border-border/60 bg-background/40 p-3"
              >
                <p className="text-xs text-muted-foreground">{row.label}</p>
                <p className="text-xl font-semibold mt-1">{row.count}</p>
              </div>
            ))}
          </div>
          {(() => {
            const passwordCount =
              data.sensitiveRows.find((row) => row.tag === "passwords")
                ?.count || 0;
            if (data.credentialCompromiseRows.length === 0 || passwordCount > 0)
              return null;
            return (
              <p className="mt-3 text-xs text-amber-300">
                Sono presenti segnali di compromissione credenziale ma non sono
                stati estratti valori password in chiaro dai payload correnti.
              </p>
            );
          })()}
          {extendedMode ? (
            <div className="mt-4 rounded-md border border-border/60 bg-background/30 p-3">
              <div className="flex flex-col gap-3 mb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium">
                      Dettaglio evidenze sensibili su query domini in scope
                      (`@dominio`)
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      PowerQuery: testo libero oppure campi `categoria:`,
                      `dominio:`, `query:`, `valore:`, `source:`, `kind:`,
                      `marcato:`.
                    </p>
                  </div>
                  <Badge variant="outline">
                    {filteredSensitiveSampleRows.length}/
                    {data.sensitiveSampleRows.length ||
                      data.detailedSensitiveRows.length}{" "}
                    risultati
                  </Badge>
                </div>
                <Input
                  value={sensitivePowerQuery}
                  onChange={(event) =>
                    setSensitivePowerQuery(event.target.value)
                  }
                  placeholder="Es. categoria:Password dominio:dominio.it query:@dominio.it valore:chrome marcato:2026"
                  className="h-9 text-xs"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={
                      sensitiveTagFilter === "all" ? "default" : "outline"
                    }
                    onClick={() => setSensitiveTagFilter("all")}
                  >
                    Tutte
                  </Button>
                  {(Object.keys(sensitiveLabel) as SensitiveTagKey[]).map(
                    (tag) => (
                      <Button
                        key={`sensitive-filter-${tag}`}
                        type="button"
                        size="sm"
                        variant={
                          sensitiveTagFilter === tag ? "default" : "outline"
                        }
                        onClick={() => setSensitiveTagFilter(tag)}
                      >
                        {sensitiveLabel[tag]}
                      </Button>
                    ),
                  )}
                  {sensitivePowerQuery || sensitiveTagFilter !== "all" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSensitivePowerQuery("");
                        setSensitiveTagFilter("all");
                      }}
                    >
                      Pulisci filtri
                    </Button>
                  ) : null}
                </div>
              </div>
              {(dti?.sensitive_samples?.length || 0) === 0 &&
              data.detailedSensitiveRows.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nessuna evidenza sensibile classificata nel ciclo corrente.
                </p>
              ) : data.sensitiveSampleRows.length > 0 &&
                filteredSensitiveSampleRows.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nessuna evidenza corrisponde ai filtri PowerQuery impostati.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1040px] text-xs">
                    <thead>
                      <tr className="border-b border-border/60 text-left text-muted-foreground">
                        <th className="py-2 pr-3">Categoria</th>
                        <th className="py-2 pr-3">Dominio / Sito</th>
                        <th className="py-2 pr-3">Query</th>
                        <th className="py-2 pr-3">Valore</th>
                        <th className="py-2 pr-3">Marcato il</th>
                        <th className="py-2">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sensitiveSampleRows.length > 0
                        ? filteredSensitiveSampleRows
                            .slice(0, 160)
                            .map((row) => (
                              <tr
                                key={row.id}
                                className="border-b border-border/40 align-top"
                              >
                                <td className="py-2 pr-3">
                                  {row.categoryLabel}
                                </td>
                                <td className="py-2 pr-3 font-medium">
                                  {row.assetScope}
                                </td>
                                <td className="py-2 pr-3">{row.queryTerm}</td>
                                <td className="py-2 pr-3 font-mono text-[11px] break-all">
                                  {row.value}
                                </td>
                                <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">
                                  {formatDateTime(row.createdAt)}
                                </td>
                                <td className="py-2">
                                  {displayDarkRiskSource(row.source)}
                                </td>
                              </tr>
                            ))
                        : data.detailedSensitiveRows.map((row, index) => (
                            <tr
                              key={`${row.tag}-${row.site}-${index}`}
                              className="border-b border-border/40 align-top"
                            >
                              <td className="py-2 pr-3">
                                {sensitiveLabel[row.tag]}
                              </td>
                              <td className="py-2 pr-3 font-medium">
                                {row.site}
                              </td>
                              <td className="py-2 pr-3">-</td>
                              <td className="py-2 pr-3">-</td>
                              <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">
                                {formatDateTime(row.markedAt)}
                              </td>
                              <td className="py-2">
                                {displayDarkRiskSource(row.source)}
                              </td>
                            </tr>
                          ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground mt-4">
              Dettaglio contenuti disponibile in modalità DarkRisk360 Estesa. In
              Standard vengono mostrati solo i conteggi.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-sm font-medium">
              Compromissioni credenziali rilevate (lista in chiaro per identity)
            </p>
            <Badge variant="outline">
              {
                data.identityRows.filter((row) => row.passwordValues.length > 0)
                  .length
              }
            </Badge>
          </div>
          {data.identityRows.filter((row) => row.passwordValues.length > 0)
            .length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nessuna compromissione credenziale classificata nel filtro
              corrente.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1220px] text-xs">
                <thead>
                  <tr className="border-b border-border/60 text-left text-muted-foreground">
                    <th className="py-2 pr-3">Identity (Email)</th>
                    <th className="py-2 pr-3">Password valide</th>
                    <th className="py-2 pr-3">Password in chiaro</th>
                    <th className="py-2 pr-3">Domini</th>
                    <th className="py-2 pr-3">Altri dati</th>
                    <th className="py-2 pr-3">Marcato il</th>
                    <th className="py-2">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {data.identityRows
                    .filter((row) => row.passwordValues.length > 0)
                    .map((row) => (
                      <tr
                        key={`credential-identity-${row.identity}`}
                        className="border-b border-border/40 align-top"
                      >
                        <td className="py-2 pr-3 font-medium">
                          {row.identity}
                        </td>
                        <td className="py-2 pr-3 font-semibold">
                          {row.passwordValues.length}
                        </td>
                        <td className="py-2 pr-3">
                          <div className="space-y-1">
                            {row.passwordValues.slice(0, 30).map((value) => (
                              <div
                                key={`${row.identity}-clear-pwd-${value}`}
                                className="font-mono text-[11px] break-all"
                              >
                                {value}
                              </div>
                            ))}
                            {row.passwordValues.length > 30 ? (
                              <div className="text-[11px] text-muted-foreground">
                                +{row.passwordValues.length - 30} altre password
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td className="py-2 pr-3">{row.domains}</td>
                        <td className="py-2 pr-3">
                          {row.addresses + row.credit_cards + row.phone_numbers}
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">
                          {formatDateTime(row.lastMarkedAt)}
                        </td>
                        <td className="py-2">
                          {row.sourceLabels.join(", ") || "DarkRisk360"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-sm font-medium">
                Identity con evidenza di credenziali
              </p>
              <p className="text-xs text-muted-foreground">
                Distribuzione per email monitorata e dettaglio valori rilevati.
              </p>
            </div>
            <Badge variant="outline">{data.identityRows.length} identity</Badge>
          </div>
          {data.identityRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nessuna evidenza identity classificata dalle query email nel ciclo
              corrente.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="rounded-md border border-border/60 bg-background/30 p-3">
                  <div className="h-[240px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={data.identityRows}
                        margin={{ top: 8, right: 12, left: 0, bottom: 64 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="rgba(148,163,184,0.25)"
                        />
                        <XAxis
                          dataKey="identityLabel"
                          interval={0}
                          angle={-18}
                          textAnchor="end"
                          height={74}
                          stroke="#94a3b8"
                        />
                        <YAxis allowDecimals={false} stroke="#94a3b8" />
                        <Tooltip content={<IdentityCredentialTooltip />} />
                        <Bar
                          dataKey="passwords"
                          stackId="identitySensitive"
                          name="Password"
                          fill="#f59e0b"
                        />
                        <Bar
                          dataKey="domains"
                          stackId="identitySensitive"
                          name="Domini"
                          fill="#8b5cf6"
                        />
                        <Bar
                          dataKey="addresses"
                          stackId="identitySensitive"
                          name="Indirizzi"
                          fill="#22c55e"
                        />
                        <Bar
                          dataKey="credit_cards"
                          stackId="identitySensitive"
                          name="Carte"
                          fill="#ef4444"
                        />
                        <Bar
                          dataKey="phone_numbers"
                          stackId="identitySensitive"
                          name="Telefoni"
                          fill="#06b6d4"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <ChartLegend items={identityLegendItems} />
                </div>
                <div className="overflow-x-auto rounded-md border border-border/60 bg-background/30">
                  <table className="w-full min-w-[860px] text-xs">
                    <thead>
                      <tr className="border-b border-border/60 text-left text-muted-foreground">
                        <th className="py-2 px-3">Identity</th>
                        <th className="py-2 px-3">Password</th>
                        <th className="py-2 px-3">Domini</th>
                        <th className="py-2 px-3">Altri dati</th>
                        <th className="py-2 px-3">Evidenze</th>
                        <th className="py-2 px-3">Ultima marcatura</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.identityRows.map((row) => (
                        <tr
                          key={row.identity}
                          className="border-b border-border/40 align-top"
                        >
                          <td className="py-2 px-3 font-medium">
                            {row.identity}
                          </td>
                          <td className="py-2 px-3">{row.passwords}</td>
                          <td className="py-2 px-3">{row.domains}</td>
                          <td className="py-2 px-3">
                            {row.addresses +
                              row.credit_cards +
                              row.phone_numbers}
                          </td>
                          <td className="py-2 px-3">
                            <div className="space-y-1">
                              {row.passwordValues.slice(0, 6).map((value) => (
                                <div
                                  key={`${row.identity}-pwd-${value}`}
                                  className="font-mono text-[11px] break-all"
                                >
                                  <span className="text-muted-foreground">
                                    Password:{" "}
                                  </span>
                                  {value}
                                </div>
                              ))}
                              {row.passwordValues.length > 6 ? (
                                <div className="text-[11px] text-muted-foreground">
                                  +{row.passwordValues.length - 6} altre
                                  password
                                </div>
                              ) : null}
                              {row.passwordValues.length === 0 ? (
                                <div className="text-[11px] text-muted-foreground">
                                  Nessuna password valida in chiaro nel campione
                                  corrente.
                                </div>
                              ) : null}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">
                            {formatDateTime(row.lastMarkedAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="mt-4 overflow-x-auto rounded-md border border-border/60 bg-background/30">
                <table className="w-full min-w-[980px] text-xs">
                  <thead>
                    <tr className="border-b border-border/60 text-left text-muted-foreground">
                      <th className="py-2 px-3">Email</th>
                      <th className="py-2 px-3">Severity</th>
                      <th className="py-2 px-3">Confidence</th>
                      <th className="py-2 px-3">Risk</th>
                      <th className="py-2 px-3">Finding</th>
                      <th className="py-2 px-3">Source</th>
                      <th className="py-2 px-3">First seen</th>
                      <th className="py-2 px-3">Last seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.identityFindingRows.length === 0 ? (
                      <tr>
                        <td
                          className="py-3 px-3 text-muted-foreground"
                          colSpan={8}
                        >
                          Nessun finding identity per-email nel ciclo corrente.
                        </td>
                      </tr>
                    ) : (
                      data.identityFindingRows.map((row, index) => (
                        <tr
                          key={`identity-finding-${row.email}-${index}`}
                          className="border-b border-border/40 align-top"
                        >
                          <td className="py-2 px-3 font-medium">{row.email}</td>
                          <td className="py-2 px-3">
                            <Badge className={severityTone[row.severity]}>
                              {row.severity}
                            </Badge>
                          </td>
                          <td className="py-2 px-3">{row.confidence}</td>
                          <td className="py-2 px-3 font-semibold">
                            {row.riskScore}
                          </td>
                          <td className="py-2 px-3">{row.title}</td>
                          <td className="py-2 px-3">{row.source}</td>
                          <td className="py-2 px-3 whitespace-nowrap text-muted-foreground">
                            {formatDateTime(row.firstSeenAt)}
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap text-muted-foreground">
                            {formatDateTime(row.lastSeenAt)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-sm font-medium">
              Lista Asset con Finding (collassabile)
            </p>
            <Badge variant="outline">
              {data.groupedAssetRows.length} asset
            </Badge>
          </div>
          {data.groupedAssetRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nessun finding disponibile per il filtro corrente.
            </p>
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
                      <Badge
                        className={
                          scopeTone[assetGroup.scope_status] ||
                          scopeTone.unknown
                        }
                      >
                        {assetGroup.scope_status}
                      </Badge>
                      <Badge variant="outline">
                        {assetGroup.total} finding
                      </Badge>
                      <Badge className={severityTone[assetGroup.maxSeverity]}>
                        max {assetGroup.maxSeverity}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Apri / Chiudi
                    </span>
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
                          <tr
                            key={row.id}
                            className="border-b border-border/40 align-top"
                          >
                            <td className="py-2 pr-3">
                              <Badge className={severityTone[row.severity]}>
                                {row.severity}
                              </Badge>
                            </td>
                            <td className="py-2 pr-3 font-semibold">
                              {row.risk_score}
                            </td>
                            <td className="py-2 pr-3">{row.title}</td>
                            <td className="py-2 pr-3">{row.finding_type}</td>
                            <td className="py-2 pr-3">{row.category}</td>
                            <td className="py-2 pr-3">
                              {displayDarkRiskSource(row.source)}
                            </td>
                            <td className="py-2">
                              {(row.sensitive_tags || []).length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {row.sensitive_tags.map((tag) => {
                                    const normalizedTag =
                                      normalizeSensitiveTag(tag);
                                    return (
                                      <Badge
                                        key={`${row.id}-${tag}`}
                                        variant="outline"
                                        className="text-[10px]"
                                      >
                                        {normalizedTag
                                          ? sensitiveLabel[normalizedTag]
                                          : tag}
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
