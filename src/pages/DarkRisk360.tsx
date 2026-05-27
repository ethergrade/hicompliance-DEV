import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertTriangle,
  Eye,
  UserX,
  Shield,
  TrendingDown,
  Activity,
  Clock3,
  Radar,
  RefreshCw,
  Mail,
  Server,
  Globe,
  FileText,
  Download,
  ExternalLink,
  Building2,
  Plus,
  Trash2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AlertBellButton } from '@/components/dark-risk/AlertBellButton';
import { AlertConfigDialog } from '@/components/dark-risk/AlertConfigDialog';
import { DarkRiskKpiCard } from '@/components/dark-risk/DarkRiskKpiCard';
import { DarkRiskCoverageMatrix } from '@/components/dark-risk/DarkRiskCoverageMatrix';
import { DarkRiskThreatGroups } from '@/components/dark-risk/DarkRiskThreatGroups';
import { DarkRiskRecentAlerts } from '@/components/dark-risk/DarkRiskRecentAlerts';
import { DarkRiskFindingsTable, type DarkRiskFindingRow } from '@/components/dark-risk/DarkRiskFindingsTable';
import { DarkRiskFindingsAnalytics } from '@/components/dark-risk/DarkRiskFindingsAnalytics';
import { DarkRiskWeeklyTrend } from '@/components/dark-risk/DarkRiskWeeklyTrend';
import { DarkRiskAssetsTable, type DarkRiskAssetRow } from '@/components/dark-risk/DarkRiskAssetsTable';
import { useDarkRiskAlerts } from '@/hooks/useDarkRiskAlerts';
import { useDarkRiskOverview } from '@/hooks/useDarkRiskOverview';
import { useDarkRiskQaStatus } from '@/hooks/useDarkRiskQaStatus';
import { useDarkRiskRoadmapStatus } from '@/hooks/useDarkRiskRoadmapStatus';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { useSurfaceScanMonitoredIps } from '@/hooks/useSurfaceScanMonitoredIps';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { presentDarkRiskFindingType, presentDarkRiskSource } from '@/lib/darkrisk/presentation';
import { detectSensitiveIndicators, type SensitiveIndicators } from '@/lib/darkrisk/sensitiveDetection';
import { generateSurfaceScan360Pdf } from '@/lib/surfaceScan360PdfReport';
import { generateSurfaceScan360Docx } from '@/lib/surfaceScan360DocxReport';
import { adaptDarkRiskReportToSurfaceScanTemplate } from '@/lib/darkrisk/darkriskReportExportAdapter';
import { parseMonitoredScopeMixedEntries } from '@/lib/ipRange';

type DashboardTab = 'overview' | 'roadmap' | 'findings' | 'assets' | 'surface' | 'identity' | 'reports';
type DarkRiskReportMode = 'weekly' | 'extended';

type FindingFilterState = {
  severity: 'all' | 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string | null;
  query: string;
  highlightedFindingId: string | null;
  scope: 'all' | 'latest_overview';
};

type DarkRiskFindingRowExtended = DarkRiskFindingRow & {
  category: string;
  category_key?: string;
  query_kind?: string;
  query_term?: string;
  source_origin?: string;
  source_module?: string;
  source_scan_job_id?: string | null;
  scan_run_id?: string | null;
  detail_only?: boolean;
  sensitive_indicators?: SensitiveIndicators;
};

const normalizeSensitiveTagKey = (value: string): string => {
  const normalized = String(value || '').trim().toLowerCase();
  if (['domain', 'dominio', 'domini', 'domains'].includes(normalized)) return 'domains';
  if (['password', 'passwords', 'credenziale', 'credenziali', 'credential', 'credentials'].includes(normalized)) return 'passwords';
  if (['address', 'addresses', 'indirizzo', 'indirizzi'].includes(normalized)) return 'addresses';
  if (['credit_card', 'credit_cards', 'card', 'cards', 'carta', 'carte'].includes(normalized)) return 'credit_cards';
  if (['phone', 'phones', 'phone_number', 'phone_numbers', 'telefono', 'telefoni'].includes(normalized)) return 'phone_numbers';
  return normalized;
};

const severityOrder: Array<FindingFilterState['severity']> = ['all', 'critical', 'high', 'medium', 'low', 'info'];

const categoryIcon = (category: string): LucideIcon => {
  const text = category.toLowerCase();
  if (text.includes('credenzial')) return UserX;
  if (text.includes('email')) return Mail;
  if (text.includes('servizi')) return Server;
  if (text.includes('dns') || text.includes('tls')) return Globe;
  if (text.includes('reputation')) return Eye;
  return Shield;
};

const classifyThreatCategory = (title: string, findingType: string, source: string): string => {
  const sourceText = `${title} ${findingType} ${source}`.toLowerCase();

  if (/credential|credenzial|password|stealer|compromis/.test(sourceText)) return 'Credenziali compromesse';
  if (/mail|email/.test(sourceText) && /leak|expos|compromis/.test(sourceText)) return 'Email esposte';
  if (/database|dump|db /.test(sourceText)) return 'Database leak';
  if (/phish|brand|impersonation/.test(sourceText)) return 'Phishing e brand abuse';
  if (/open_port|open port|service_fingerprint|ports|pentest_tool|shodan/.test(sourceText)) return 'Servizi esposti';
  if (/dmarc|spf|dkim|mail_security|mx|bimi/.test(sourceText)) return 'Email security';
  if (/dns|tls|ssl|hsts|whois|rdap|http_security|headers/.test(sourceText)) return 'DNS e TLS';
  if (/safe_browsing|urlhaus|phishtank|reputation|dnsbl|threat/.test(sourceText)) return 'Reputation';
  return 'Minacce rilevate';
};

const normalizeThreatCategoryKey = (value: string | null | undefined): string => {
  const raw = String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' e ')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!raw) return '';
  if (/credenzial|credential|account|identity/.test(raw)) return 'credenziali_compromesse';
  if (/email espost|mail espost|exposed email/.test(raw)) return 'email_esposte';
  if (/database|dump|db leak/.test(raw)) return 'database_leak';
  if (/phishing|brand abuse|impersonation/.test(raw)) return 'phishing_brand_abuse';
  if (/servizi|service|open port|porte|exposed|exposure/.test(raw)) return 'servizi_esposti';
  if (/email security|mail security|dmarc|spf|dkim|mx|bimi/.test(raw)) return 'email_security';
  if (/dns|tls|ssl|hsts|rdap|whois|http security|headers/.test(raw)) return 'dns_tls';
  if (/reputation|safe browsing|dnsbl|threat intel|threat/.test(raw)) return 'reputation';
  if (/minacce|findings|vulnerabilita|vulnerability/.test(raw)) return 'minacce_rilevate';
  return raw;
};

const inactiveFindingStatuses = new Set(['resolved', 'suppressed', 'false_positive', 'accepted_risk']);

const isActiveDarkRiskStatus = (status: unknown): boolean => {
  return !inactiveFindingStatuses.has(String(status || 'open').toLowerCase());
};

const formatDateTime = (value: string | null | undefined): string => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('it-IT');
};

const formatDelta = (delta: number | null | undefined): string | null => {
  if (delta == null) return null;
  if (delta === 0) return 'Nessuna variazione';
  if (delta > 0) return `+${delta} vs ultima scansione`;
  return `${delta} vs ultima scansione`;
};

const riskScoreFromSeverity = (severity: string): number => {
  const normalized = String(severity || '').toLowerCase();
  if (normalized === 'critical') return 95;
  if (normalized === 'high') return 80;
  if (normalized === 'medium') return 60;
  if (normalized === 'low') return 35;
  return 15;
};

const roadmapStatusLabel: Record<string, string> = {
  completed: 'Completata',
  in_progress: 'In corso',
  planned: 'Pianificata',
  blocked: 'Bloccata',
};

const roadmapBadgeVariant = (status: string): 'default' | 'outline' | 'secondary' | 'destructive' => {
  if (status === 'completed') return 'default';
  if (status === 'in_progress') return 'secondary';
  if (status === 'blocked') return 'destructive';
  return 'outline';
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

const parseEmailSelectors = (input: string): string[] => {
  return Array.from(
    new Set(
      String(input || '')
        .split(/[\n,;\s]+/)
        .map((token) => String(token || '').trim().toLowerCase())
        .filter(Boolean)
        .filter((token) => emailRegex.test(token)),
    ),
  ).slice(0, 80);
};

const normalizeHost = (value: string): string => {
  const text = String(value || '').trim().toLowerCase();
  if (!text || text === '-') return 'n/a';

  if (/^https?:\/\//i.test(text)) {
    try {
      const url = new URL(text);
      return url.hostname || text;
    } catch {
      return text;
    }
  }

  return text.replace(/^@/, '');
};

const presentScopeEntryType = (entryType: string): string => {
  const normalized = String(entryType || '').toLowerCase();
  if (normalized === 'domain') return 'Dominio';
  if (normalized === 'single') return 'IP';
  if (normalized === 'range') return 'Range';
  if (normalized === 'cidr') return 'CIDR';
  return normalized || 'n/d';
};

const getDarkRiskReportMode = (report: Record<string, any>): DarkRiskReportMode => {
  const metadataMode = String(report?.model_metadata?.report_mode || '').toLowerCase();
  if (metadataMode === 'weekly' || metadataMode === 'settimanale') return 'weekly';
  if (metadataMode === 'extended' || metadataMode === 'esteso' || metadataMode === 'dti_extended') return 'extended';
  return String(report?.tier || '').toLowerCase() === 'extended' ? 'extended' : 'weekly';
};

const getDarkRiskReportLeakCount = (report: Record<string, any>): number => {
  const counts = report?.model_metadata?.leak_counts || report?.report_json?.dti_intelligence?.sensitive_summary || {};
  const explicit = Number(counts.sensitive_total ?? counts.total ?? NaN);
  if (Number.isFinite(explicit)) return explicit;
  return Number(counts.active_findings ?? report?.report_json?.findings?.length ?? 0) || 0;
};

const extractSensitiveTags = (input: unknown): string[] => {
  if (!input || typeof input !== 'object') return [];
  const tags = (input as any)?.tags;
  if (!Array.isArray(tags)) return [];
  return tags
    .map((tag) => String(tag || '').trim())
    .filter(Boolean)
    .slice(0, 8);
};

const DarkRisk360: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { alerts, createAlert, loading: alertsLoading } = useDarkRiskAlerts();
  const { data: overview, isLoading, isError, error, refetch, isFetching } = useDarkRiskOverview();
  const { organizationId } = useClientOrganization();
  const [alertDialogOpen, setAlertDialogOpen] = useState(false);
  const [syncingScan, setSyncingScan] = useState(false);
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [findingFilter, setFindingFilter] = useState<FindingFilterState>({
    severity: 'all',
    category: null,
    query: '',
    highlightedFindingId: null,
    scope: 'all',
  });
  const [assetTypeFilter, setAssetTypeFilter] = useState<'all' | 'domain' | 'subdomain' | 'ip' | 'url' | 'email' | 'candidate'>('all');
  const [identityEmailsInput, setIdentityEmailsInput] = useState('');
  const [identityScanning, setIdentityScanning] = useState(false);
  const [exportingReportId, setExportingReportId] = useState<string | null>(null);
  const [scopeInput, setScopeInput] = useState('');
  const [addingScope, setAddingScope] = useState(false);

  const {
    rules: scopeRules,
    loading: scopeLoading,
    saving: scopeSaving,
    isAdmin: isScopeAdmin,
    addRule: addScopeRule,
    removeRule: removeScopeRule,
  } = useSurfaceScanMonitoredIps();

  const {
    data: reportSnapshots = [],
    isLoading: reportsLoading,
    refetch: refetchReports,
  } = useQuery({
    queryKey: ['darkrisk360-report-snapshots', organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error: queryError } = await supabase
        .from('darkrisk_report_snapshots' as any)
        .select('id, title, tier, classification, status, generated_at, scan_run_id, html_storage_path, json_storage_path, pdf_storage_path, model_metadata')
        .eq('organization_id', organizationId)
        .order('generated_at', { ascending: false })
        .limit(12);
      if (queryError) throw queryError;
      return (data || []) as Array<Record<string, any>>;
    },
    staleTime: 60_000,
  });

  const {
    data: findingRows = [],
    isLoading: findingsLoading,
  } = useQuery({
    queryKey: ['darkrisk360-findings', organizationId, overview.latest_scan?.id || null],
    enabled: Boolean(organizationId),
    queryFn: async (): Promise<DarkRiskFindingRowExtended[]> => {
      if (!organizationId) return [];

      const latestOverviewScanId = overview.latest_scan?.id ? String(overview.latest_scan.id) : '';

      const [findingsQueryRes, latestSurfaceRes, latestExposureRes] = await Promise.all([
        supabase
          .from('darkrisk_findings' as any)
          .select('id, scan_run_id, title, finding_type, severity, confidence, status, risk_score, first_seen_at, last_seen_at, metadata, affected_asset_id, evidence_ids, description')
          .eq('organization_id', organizationId)
          .order('risk_score', { ascending: false })
          .limit(400),
        latestOverviewScanId
          ? supabase
              .from('surface_findings' as any)
              .select('id, title, finding_type, severity, status, created_at, module, affected_asset, affected_url')
              .eq('scan_job_id', latestOverviewScanId)
              .order('created_at', { ascending: false })
              .limit(800)
          : Promise.resolve({ data: [], error: null } as any),
        latestOverviewScanId
          ? supabase
              .from('surface_exposure_findings' as any)
              .select('id, title, finding_type, severity, status, created_at, source, affected_host, affected_url')
              .eq('scan_job_id', latestOverviewScanId)
              .order('created_at', { ascending: false })
              .limit(800)
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      if (findingsQueryRes.error) throw findingsQueryRes.error;
      if ((latestSurfaceRes as any).error) throw (latestSurfaceRes as any).error;
      if ((latestExposureRes as any).error) throw (latestExposureRes as any).error;

      const findings = (findingsQueryRes.data || []) as Array<Record<string, any>>;

      const latestSurfaceRows = ((latestSurfaceRes as any).data || [])
        .filter((row: Record<string, any>) => isActiveDarkRiskStatus(row.status))
        .map((row: Record<string, any>) => {
          const source = presentDarkRiskSource(String(row.module || 'surface_scan_engine'));
          const findingType = presentDarkRiskFindingType(String(row.finding_type || 'surface_finding'));
          const title = String(row.title || findingType);
          const assetValue = String(row.affected_asset || row.affected_url || '-');
          const sensitive = detectSensitiveIndicators(`${title}\n${assetValue}`);
          const category = classifyThreatCategory(
            title,
            String(row.finding_type || 'surface_finding'),
            String(row.module || 'surface_scan_engine'),
          );
          return {
            id: `surface-latest-${String(row.id)}`,
            severity: String(row.severity || 'info') as DarkRiskFindingRow['severity'],
            risk_score: riskScoreFromSeverity(String(row.severity || 'info')),
            title,
            asset: assetValue,
            finding_type: findingType,
            confidence: 'medium' as DarkRiskFindingRow['confidence'],
            status: String(row.status || 'new'),
            first_seen_at: String(row.created_at || ''),
            last_seen_at: String(row.created_at || ''),
            source,
            compromise_type: 'misconfiguration',
            category,
            category_key: normalizeThreatCategoryKey(category),
            site: normalizeHost(assetValue),
            scope_status: 'approved',
            sensitive_tags: sensitive.tags.map((tag) => normalizeSensitiveTagKey(tag)).filter(Boolean),
            sensitive_indicators: sensitive,
            source_origin: 'surface_latest',
            source_scan_job_id: latestOverviewScanId,
            detail_only: true,
          } satisfies DarkRiskFindingRowExtended;
        });

      const latestExposureRows = ((latestExposureRes as any).data || [])
        .filter((row: Record<string, any>) => isActiveDarkRiskStatus(row.status))
        .map((row: Record<string, any>) => {
          const source = presentDarkRiskSource(String(row.source || 'surface_exposure_engine'));
          const findingType = presentDarkRiskFindingType(String(row.finding_type || 'surface_exposure_finding'));
          const title = String(row.title || findingType);
          const assetValue = String(row.affected_host || row.affected_url || '-');
          const sensitive = detectSensitiveIndicators(`${title}\n${assetValue}\n${String(row.evidence || '')}`);
          const category = classifyThreatCategory(
            title,
            String(row.finding_type || 'surface_exposure_finding'),
            String(row.source || 'surface_exposure_engine'),
          );
          return {
            id: `exposure-latest-${String(row.id)}`,
            severity: String(row.severity || 'info') as DarkRiskFindingRow['severity'],
            risk_score: riskScoreFromSeverity(String(row.severity || 'info')),
            title,
            asset: assetValue,
            finding_type: findingType,
            confidence: 'medium' as DarkRiskFindingRow['confidence'],
            status: String(row.status || 'new'),
            first_seen_at: String(row.created_at || ''),
            last_seen_at: String(row.created_at || ''),
            source,
            compromise_type: 'misconfiguration',
            category,
            category_key: normalizeThreatCategoryKey(category),
            site: normalizeHost(assetValue),
            scope_status: 'approved',
            sensitive_tags: sensitive.tags.map((tag) => normalizeSensitiveTagKey(tag)).filter(Boolean),
            sensitive_indicators: sensitive,
            source_origin: 'surface_latest',
            source_scan_job_id: latestOverviewScanId,
            detail_only: true,
          } satisfies DarkRiskFindingRowExtended;
        });

      const latestOverviewRows = [...latestSurfaceRows, ...latestExposureRows];

      if (findings.length === 0) {
        return latestOverviewRows.map((row) => ({ ...row, detail_only: false }));
      }

      const assetIds = Array.from(
        new Set(
          findings
            .map((finding) => String(finding.affected_asset_id || '').trim())
            .filter(Boolean),
        ),
      );

      const assetsMap = new Map<string, { value: string; scope_status: string }>();
      if (assetIds.length > 0) {
        const { data: assetsData, error: assetsError } = await supabase
          .from('darkrisk_assets' as any)
          .select('id, normalized_value, value, scope_status')
          .eq('organization_id', organizationId)
          .in('id', assetIds);

        if (assetsError) throw assetsError;

        for (const asset of (assetsData || []) as Array<Record<string, any>>) {
          assetsMap.set(String(asset.id), {
            value: String(asset.normalized_value || asset.value || '-'),
            scope_status: String(asset.scope_status || 'approved'),
          });
        }
      }

      const evidenceIds = Array.from(
        new Set(
          findings.flatMap((finding) => {
            const raw = Array.isArray(finding.evidence_ids) ? finding.evidence_ids : [];
            return raw.map((entry) => String(entry || '').trim()).filter(Boolean);
          }),
        ),
      );

      const evidenceMap = new Map<string, Record<string, any>>();
      if (evidenceIds.length > 0) {
        const { data: evidenceData, error: evidenceError } = await supabase
          .from('darkrisk_evidence' as any)
          .select('id, metadata, summary, title, masked_value, contains_sensitive_data')
          .eq('organization_id', organizationId)
          .in('id', evidenceIds);

        if (evidenceError) throw evidenceError;
        for (const row of (evidenceData || []) as Array<Record<string, any>>) {
          evidenceMap.set(String(row.id), row);
        }
      }

      const darkRiskRows = findings
        .filter((finding) => isActiveDarkRiskStatus(finding.status))
        .map((finding) => {
        const source = presentDarkRiskSource(String(
          finding?.metadata?.source_module ||
          finding?.metadata?.source_origin ||
          'surface_scan_engine',
        ));
        const findingType = presentDarkRiskFindingType(String(finding.finding_type || 'unknown'));
        const title = String(finding.title || findingType);
        const categoryHint = String(finding?.metadata?.category_hint || '').trim();
        const category = categoryHint || classifyThreatCategory(title, findingType, source);
        const assetData = assetsMap.get(String(finding.affected_asset_id || ''));
        const assetValue = assetData?.value || '-';
        const scopeStatus = assetData?.scope_status || String(finding?.metadata?.scope_status || 'unknown');

        const findingSensitiveTags = extractSensitiveTags(finding?.metadata?.sensitive_indicators)
          .map((tag) => normalizeSensitiveTagKey(tag))
          .filter(Boolean);
        const evidenceRows = (Array.isArray(finding.evidence_ids) ? finding.evidence_ids : [])
          .map((id: unknown) => evidenceMap.get(String(id || '').trim()))
          .filter(Boolean) as Array<Record<string, any>>;

        const evidenceSensitiveTags = evidenceRows.flatMap((evidenceRow) =>
          extractSensitiveTags(evidenceRow?.metadata?.sensitive_indicators),
        );
        const normalizedEvidenceSensitiveTags = evidenceSensitiveTags
          .map((tag) => normalizeSensitiveTagKey(tag))
          .filter(Boolean);

        const fallbackSensitive = detectSensitiveIndicators(
          `${title}\n${String(finding.description || '')}\n${assetValue}\n${evidenceRows.map((row) => `${String(row.title || '')}\n${String(row.summary || '')}\n${String(row.masked_value || '')}`).join('\n')}`.slice(0, 7000),
        );

        const sensitiveTags = Array.from(
          new Set(
            [
              ...findingSensitiveTags,
              ...normalizedEvidenceSensitiveTags,
              ...(Array.isArray(fallbackSensitive.tags) ? fallbackSensitive.tags : []),
            ].map((tag) => normalizeSensitiveTagKey(String(tag))),
          ),
        ).filter(Boolean);

        return {
          id: String(finding.id),
          severity: String(finding.severity || 'info') as DarkRiskFindingRow['severity'],
          risk_score: Number(finding.risk_score || 0),
          title,
          asset: assetValue,
          finding_type: findingType,
          confidence: String(finding.confidence || 'medium') as DarkRiskFindingRow['confidence'],
          status: String(finding.status || 'new'),
          first_seen_at: String(finding.first_seen_at || ''),
          last_seen_at: String(finding.last_seen_at || ''),
          source,
          compromise_type: String(finding?.metadata?.compromise_type || 'unknown'),
          category,
          category_key: normalizeThreatCategoryKey(category),
          site: normalizeHost(assetValue),
          scope_status: scopeStatus,
          sensitive_tags: sensitiveTags,
          query_kind: String(finding?.metadata?.query_kind || ''),
          query_term: String(finding?.metadata?.query_term || ''),
          source_origin: String(finding?.metadata?.source_origin || ''),
          source_module: String(finding?.metadata?.source_module || ''),
          source_scan_job_id: String(finding?.metadata?.source_scan_job_id || '') || null,
          scan_run_id: String(finding?.scan_run_id || '') || null,
          sensitive_indicators: {
            domains: Number(finding?.metadata?.sensitive_indicators?.domains || fallbackSensitive.domains || 0),
            passwords: Number(finding?.metadata?.sensitive_indicators?.passwords || fallbackSensitive.passwords || 0),
            addresses: Number(finding?.metadata?.sensitive_indicators?.addresses || fallbackSensitive.addresses || 0),
            credit_cards: Number(finding?.metadata?.sensitive_indicators?.credit_cards || fallbackSensitive.credit_cards || 0),
            phone_numbers: Number(finding?.metadata?.sensitive_indicators?.phone_numbers || fallbackSensitive.phone_numbers || 0),
            total_hits: Number(finding?.metadata?.sensitive_indicators?.total_hits || fallbackSensitive.total_hits || 0),
            tags: sensitiveTags,
          },
        };
      });

      return [...darkRiskRows, ...latestOverviewRows];
    },
    staleTime: 60_000,
  });

  const {
    data: assetRows = [],
    isLoading: assetsLoading,
  } = useQuery({
    queryKey: ['darkrisk360-assets', organizationId],
    enabled: Boolean(organizationId),
    queryFn: async (): Promise<DarkRiskAssetRow[]> => {
      if (!organizationId) return [];

      const [assetsRes, findingsRes] = await Promise.all([
        supabase
          .from('darkrisk_assets' as any)
          .select('id, asset_type, normalized_value, value, scope_status, source, first_seen_at, last_seen_at')
          .eq('organization_id', organizationId)
          .order('last_seen_at', { ascending: false })
          .limit(600),
        supabase
          .from('darkrisk_findings' as any)
          .select('id, affected_asset_id, status')
          .eq('organization_id', organizationId)
          .limit(1200),
      ]);

      if (assetsRes.error) throw assetsRes.error;
      if (findingsRes.error) throw findingsRes.error;

      const findingCountByAsset = new Map<string, number>();
      for (const finding of ((findingsRes.data || []) as Array<Record<string, any>>)) {
        if (!isActiveDarkRiskStatus(finding.status)) continue;
        const assetId = String(finding.affected_asset_id || '').trim();
        if (!assetId) continue;
        findingCountByAsset.set(assetId, (findingCountByAsset.get(assetId) || 0) + 1);
      }

      return ((assetsRes.data || []) as Array<Record<string, any>>).map((asset) => ({
        id: String(asset.id),
        asset_type: String(asset.asset_type || 'unknown'),
        value: String(asset.normalized_value || asset.value || '-'),
        scope_status: String(asset.scope_status || 'approved'),
        source: String(asset.source || 'manual'),
        first_seen_at: asset.first_seen_at ? String(asset.first_seen_at) : null,
        last_seen_at: asset.last_seen_at ? String(asset.last_seen_at) : null,
        findings_count: findingCountByAsset.get(String(asset.id)) || 0,
      }));
    },
    staleTime: 60_000,
  });

  const {
    data: identityEmailSelectors = [],
    isLoading: identitySelectorsLoading,
    refetch: refetchIdentitySelectors,
  } = useQuery({
    queryKey: ['darkrisk360-email-selectors', organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error: queryError } = await supabase
        .from('darkrisk_selectors' as any)
        .select('id, value, normalized_value, status, updated_at')
        .eq('organization_id', organizationId)
        .eq('selector_type', 'email')
        .in('status', ['approved', 'candidate'])
        .order('updated_at', { ascending: false })
        .limit(80);
      if (queryError) throw queryError;
      return (data || []) as Array<Record<string, any>>;
    },
    staleTime: 60_000,
  });

  const {
    data: roadmap,
    isLoading: roadmapLoading,
    isError: roadmapError,
  } = useDarkRiskRoadmapStatus();
  const {
    data: qaStatus,
    isLoading: qaLoading,
    isError: qaError,
  } = useDarkRiskQaStatus();

  const generateReportMutation = useMutation({
    mutationFn: async (mode: DarkRiskReportMode) => {
      if (!organizationId) throw new Error('Nessun cliente selezionato');
      const { data, error: invokeError } = await supabase.functions.invoke('darkrisk360-generate-report', {
        body: {
          customer_id: organizationId,
          classification: 'confidential',
          report_mode: mode,
        },
      });
      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(String(data.error));
      return data;
    },
    onSuccess: async (data) => {
      toast.success(data?.reused ? 'Report esistente riutilizzato' : 'Report DarkRisk360 generato');
      await Promise.all([
        refetchReports(),
        queryClient.invalidateQueries({ queryKey: ['darkrisk360-overview', organizationId] }),
      ]);
      setActiveTab('reports');
    },
    onError: (err: any) => {
      toast.error(`Errore generazione report: ${String(err?.message || 'errore sconosciuto')}`);
    },
  });

  const activeAlertsCount = alerts.filter((alert) => alert.is_active).length;

  const kpiCards = useMemo(
    () => [
      {
        key: 'active_threats',
        title: 'Minacce Attive',
        value: overview.kpis.active_threats.value,
        delta: overview.kpis.active_threats.delta,
        tone: 'text-red-500',
        icon: AlertTriangle,
        description: 'Numero di finding attivi (non risolti) rilevati nel ciclo corrente.',
      },
      {
        key: 'credential_leaks',
        title: 'Credenziali Leak',
        value: overview.kpis.credential_leaks.value,
        delta: overview.kpis.credential_leaks.delta,
        tone: 'text-orange-500',
        icon: UserX,
        description: 'Evidenze rilevate su credenziali, identità o possibili compromissioni account.',
      },
      {
        key: 'monitored_domains',
        title: 'Domini Monitorati',
        value: overview.kpis.monitored_domains.value,
        delta: overview.kpis.monitored_domains.delta,
        tone: 'text-primary',
        icon: Shield,
        description: 'Domini in perimetro autorizzato monitorati dal modulo DarkRisk360.',
      },
      {
        key: 'risk_score',
        title: 'Punteggio Rischio',
        value: `${overview.kpis.risk_score.value}`,
        delta: overview.kpis.risk_score.delta,
        tone: 'text-red-500',
        icon: TrendingDown,
        extra: overview.kpis.risk_score.level,
        description: 'Indice sintetico 0-100 calcolato da severità, confidenza e trend dei finding.',
      },
      {
        key: 'last_scan',
        title: 'Ultima Scansione',
        value: overview.kpis.last_scan.value ? formatDateTime(overview.kpis.last_scan.value) : 'Nessuna scansione',
        delta: overview.kpis.last_scan.delta,
        tone: 'text-foreground',
        icon: Clock3,
        description: 'Timestamp di completamento dell’ultimo ciclo disponibile per il cliente.',
      },
      {
        key: 'coverage',
        title: 'Copertura Controlli',
        value: `${overview.kpis.controls_coverage.value}%`,
        delta: null,
        tone: 'text-primary',
        icon: Radar,
        extra: `${overview.kpis.controls_coverage.completed}/${overview.kpis.controls_coverage.total} completati`,
        description: 'Percentuale dei controlli previsti eseguiti con successo nel ciclo corrente.',
      },
      {
        key: 'critical_findings',
        title: 'Finding Critici',
        value: overview.kpis.critical_findings.value,
        delta: overview.kpis.critical_findings.delta,
        tone: 'text-red-500',
        icon: Activity,
        description: 'Finding con severità critical da verificare o gestire con priorità immediata.',
      },
      {
        key: 'new_alerts',
        title: 'Nuovi Alert',
        value: overview.kpis.new_alerts.value,
        delta: overview.kpis.new_alerts.delta,
        tone: 'text-yellow-500',
        icon: Eye,
        description: 'Nuovi eventi emersi rispetto alla scansione precedente sullo stesso perimetro.',
      },
    ],
    [overview],
  );

  const filteredFindings = useMemo(() => {
    return findingRows
      .filter((row) => {
        if (findingFilter.scope === 'latest_overview') {
          const latestScanId = String(overview.latest_scan?.id || '');
          if (!latestScanId || row.source_scan_job_id !== latestScanId) return false;
        } else if (row.detail_only) {
          return false;
        }

        if (findingFilter.severity !== 'all' && row.severity !== findingFilter.severity) return false;
        if (findingFilter.category) {
          const rowCategoryKey = row.category_key || normalizeThreatCategoryKey(row.category);
          const filterCategoryKey = normalizeThreatCategoryKey(findingFilter.category);
          if (rowCategoryKey !== filterCategoryKey) return false;
        }

        const query = findingFilter.query.trim().toLowerCase();
        if (!query) return true;

        const text = `${row.title} ${row.finding_type} ${row.asset} ${row.source} ${row.compromise_type}`.toLowerCase();
        return text.includes(query);
      })
      .sort((a, b) => {
        if (findingFilter.highlightedFindingId) {
          if (a.id === findingFilter.highlightedFindingId) return -1;
          if (b.id === findingFilter.highlightedFindingId) return 1;
        }
        return b.risk_score - a.risk_score;
      });
  }, [findingRows, findingFilter, overview.latest_scan?.id]);

  const filteredAssets = useMemo(() => {
    return assetRows.filter((row) => {
      const normalizedType = row.asset_type.toLowerCase();
      const normalizedScope = row.scope_status.toLowerCase();

      if (assetTypeFilter === 'all') return true;
      if (assetTypeFilter === 'candidate') return normalizedScope === 'candidate';
      return normalizedType === assetTypeFilter;
    });
  }, [assetRows, assetTypeFilter]);

  const reportRepository = useMemo(() => {
    const weeklyReports = reportSnapshots.filter((report) => getDarkRiskReportMode(report) === 'weekly');
    const extendedReports = reportSnapshots.filter((report) => getDarkRiskReportMode(report) === 'extended');

    return {
      weekly: weeklyReports[0] || null,
      extended: extendedReports[0] || null,
      hiddenDuplicates: Math.max(0, reportSnapshots.length - (weeklyReports[0] ? 1 : 0) - (extendedReports[0] ? 1 : 0)),
    };
  }, [reportSnapshots]);

  const surfaceLinkedStats = useMemo(() => {
    const surfaceRows = findingRows.filter((row) => {
      const marker = `${row.source} ${row.source_origin || ''} ${row.source_module || ''} ${row.finding_type}`.toLowerCase();
      return marker.includes('surface') || marker.includes('open_port') || marker.includes('service_fingerprint');
    });

    const approvedAssets = assetRows.filter((row) => row.scope_status.toLowerCase() === 'approved');
    const highPriority = surfaceRows.filter((row) => row.severity === 'critical' || row.severity === 'high').length;
    const latestSurfaceRows = surfaceRows.filter((row) => row.source_origin === 'surface_latest' || row.source_scan_job_id);

    return {
      findings: surfaceRows.length,
      latestFindings: latestSurfaceRows.length,
      highPriority,
      assets: approvedAssets.length,
    };
  }, [assetRows, findingRows]);

  const handleSyncSurfaceScan = async (options?: {
    triggerType?: string;
    includeDtiExtended?: boolean;
    successMessage?: string;
  }) => {
    if (!organizationId) {
      toast.error('Nessun cliente selezionato');
      return;
    }

    setSyncingScan(true);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('darkrisk360-sync-surfacescan', {
        body: {
          customer_id: organizationId,
          trigger_type: options?.triggerType || 'manual',
          include_dti_extended: options?.includeDtiExtended ?? true,
        },
      });

      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(String(data.error));

      toast.success(options?.successMessage || 'Sincronizzazione DarkRisk360 completata');
      void Promise.all([
        refetch(),
        queryClient.invalidateQueries({ queryKey: ['darkrisk360-findings', organizationId] }),
        queryClient.invalidateQueries({ queryKey: ['darkrisk360-assets', organizationId] }),
      ]);
    } catch (invokeError: any) {
      toast.error(`Errore sync DarkRisk360: ${String(invokeError?.message || 'errore sconosciuto')}`);
    } finally {
      setSyncingScan(false);
    }
  };

  const handleIdentityLeakScan = async () => {
    if (!organizationId) {
      toast.error('Nessun cliente selezionato');
      return;
    }

    const parsedEmails = parseEmailSelectors(identityEmailsInput);
    if (parsedEmails.length === 0) {
      toast.error('Inserisci almeno una email valida (es. user@dominio.it)');
      return;
    }

    setIdentityScanning(true);
    try {
      const selectorRows = parsedEmails.map((email) => ({
        organization_id: organizationId,
        tenant_id: organizationId,
        selector_type: 'email',
        value: email,
        normalized_value: email,
        source: 'manual',
        status: 'approved',
        metadata: {
          added_from: 'darkrisk_ui_identity',
          added_at: new Date().toISOString(),
        },
      }));

      const { error: selectorError } = await supabase
        .from('darkrisk_selectors' as any)
        .upsert(selectorRows as any, {
          onConflict: 'organization_id,selector_type,normalized_value',
          ignoreDuplicates: false,
        });
      if (selectorError) throw selectorError;

      const { data, error: invokeError } = await supabase.functions.invoke('darkrisk360-sync-surfacescan', {
        body: {
          customer_id: organizationId,
          trigger_type: 'identity_email_manual',
          identity_emails: parsedEmails,
        },
      });
      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(String(data.error));

      toast.success(`Analisi identity avviata su ${parsedEmails.length} email`);
      setIdentityEmailsInput('');
      void Promise.all([
        refetch(),
        refetchIdentitySelectors(),
        queryClient.invalidateQueries({ queryKey: ['darkrisk360-findings', organizationId] }),
        queryClient.invalidateQueries({ queryKey: ['darkrisk360-assets', organizationId] }),
      ]);
    } catch (scanError: any) {
      toast.error(`Errore analisi identity: ${String(scanError?.message || 'errore sconosciuto')}`);
    } finally {
      setIdentityScanning(false);
    }
  };

  const handleAddScopeRule = async () => {
    const entries = parseMonitoredScopeMixedEntries(scopeInput);
    if (entries.length === 0) {
      toast.error('Inserisci almeno un dominio/IP/range/CIDR in scope');
      return;
    }

    setAddingScope(true);
    try {
      let successCount = 0;
      const failedEntries: string[] = [];

      for (const entry of entries) {
        const ok = await addScopeRule(entry, {
          discovered_via: 'manual',
          silent: true,
          auto_queue_scan: true,
          auto_sync_darkrisk: false,
        });
        if (ok) {
          successCount += 1;
        } else {
          failedEntries.push(entry);
        }
      }

      if (successCount > 0) {
        setScopeInput('');
        toast.success(`Scope aggiornato: ${successCount} regole aggiunte`);
        await handleSyncSurfaceScan({
          triggerType: 'scope_batch_manual',
          includeDtiExtended: true,
          successMessage: 'Scope salvato e sincronizzazione DTI estesa avviata',
        });
        void Promise.all([
          refetch(),
          queryClient.invalidateQueries({ queryKey: ['darkrisk360-assets', organizationId] }),
        ]);
      }

      if (failedEntries.length > 0) {
        toast.error(
          `Regole non aggiunte: ${failedEntries.slice(0, 3).join(', ')}${failedEntries.length > 3 ? ' ...' : ''}`,
        );
      }
    } finally {
      setAddingScope(false);
    }
  };

  const handleRemoveScopeRule = async (ruleId: string) => {
    const ok = await removeScopeRule(ruleId);
    if (ok) {
      void refetch();
    }
  };

  const openReportAsset = async (report: Record<string, any>, format: 'html' | 'json' | 'pdf') => {
    if (!organizationId) {
      toast.error('Nessun cliente selezionato');
      return;
    }

    const { data, error: invokeError } = await supabase.functions.invoke('darkrisk360-report-access', {
      body: {
        customer_id: organizationId,
        report_id: String(report?.id || ''),
        format,
        reason: 'manual_export_from_darkrisk_ui',
      },
    });

    if (invokeError) {
      toast.error(`Impossibile aprire export ${format.toUpperCase()}: ${String(invokeError.message || 'errore sconosciuto')}`);
      return;
    }

    if (!data?.ok || !data?.signed_url) {
      toast.error(String(data?.error || `Export ${format.toUpperCase()} non disponibile`));
      return;
    }

    window.open(String(data.signed_url), '_blank', 'noopener,noreferrer');
  };

  const loadReportJsonSnapshot = async (report: Record<string, any>) => {
    if (!organizationId) throw new Error('Nessun cliente selezionato');

    if (report?.report_json && typeof report.report_json === 'object') {
      return report.report_json;
    }

    const { data, error: invokeError } = await supabase.functions.invoke('darkrisk360-report-access', {
      body: {
        customer_id: organizationId,
        report_id: String(report?.id || ''),
        format: 'json',
        reason: 'manual_export_surface_template',
      },
    });
    if (invokeError) throw invokeError;
    if (!data?.ok || !data?.signed_url) {
      throw new Error(String(data?.error || 'Export JSON non disponibile'));
    }

    const response = await fetch(String(data.signed_url));
    if (!response.ok) {
      throw new Error(`Download JSON fallito (${response.status})`);
    }
    return await response.json();
  };

  const exportDarkRiskWithSurfaceTemplate = async (report: Record<string, any>, format: 'pdf' | 'docx') => {
    try {
      setExportingReportId(String(report?.id || ''));
      const reportJson = await loadReportJsonSnapshot(report);
      const adapted = adaptDarkRiskReportToSurfaceScanTemplate(reportJson);
      if (format === 'pdf') {
        generateSurfaceScan360Pdf(adapted);
      } else {
        await generateSurfaceScan360Docx(adapted);
      }
      toast.success(`Export ${format.toUpperCase()} completato`);
    } catch (exportError: any) {
      toast.error(`Export ${format.toUpperCase()} non riuscito: ${String(exportError?.message || 'errore sconosciuto')}`);
    } finally {
      setExportingReportId(null);
    }
  };

  const openCategoryDetail = (category: string) => {
    setActiveTab('findings');
    setFindingFilter({
      severity: 'all',
      category,
      query: '',
      highlightedFindingId: null,
      scope: 'latest_overview',
    });
  };

  const openFindingDetail = (findingId: string, fallbackType: string) => {
    setActiveTab('findings');
    setFindingFilter((prev) => ({
      ...prev,
      highlightedFindingId: findingId,
      category: prev.category,
      query: prev.query || fallbackType,
      scope: 'all',
    }));
  };

  const openSurfaceFindings = () => {
    setActiveTab('findings');
    setFindingFilter({
      severity: 'all',
      category: null,
      query: 'SurfaceScan360',
      highlightedFindingId: null,
      scope: 'latest_overview',
    });
  };

  const openSurfaceAssets = () => {
    setActiveTab('assets');
    setAssetTypeFilter('all');
  };

  const onKpiClick = (key: string) => {
    if (key === 'monitored_domains') {
      setActiveTab('assets');
      setAssetTypeFilter('domain');
      return;
    }

    setActiveTab('findings');

    if (key === 'critical_findings') {
      setFindingFilter({ severity: 'critical', category: null, query: '', highlightedFindingId: null, scope: 'latest_overview' });
      return;
    }

    if (key === 'credential_leaks') {
      setFindingFilter({ severity: 'all', category: 'Credenziali compromesse', query: '', highlightedFindingId: null, scope: 'all' });
      return;
    }

    if (key === 'new_alerts') {
      setFindingFilter({ severity: 'all', category: null, query: 'new', highlightedFindingId: null, scope: 'all' });
      return;
    }

    setFindingFilter({ severity: 'all', category: null, query: '', highlightedFindingId: null, scope: 'all' });
  };

  const renderReportSnapshot = (report: Record<string, any>, mode: DarkRiskReportMode) => (
    <div key={String(report.id)} className="flex flex-wrap items-center gap-3 rounded-lg border border-border/70 bg-muted/20 p-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium truncate">{String(report.title || 'DarkRisk360 Report')}</p>
          <Badge variant={mode === 'extended' ? 'default' : 'secondary'}>
            {mode === 'extended' ? 'Esteso DTI finale' : 'Settimanale'}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {mode === 'weekly'
            ? `Leak/evidenze conteggiate: ${getDarkRiskReportLeakCount(report)}`
            : 'Report esteso unico: non viene duplicato a ogni scansione'}
          {' '}• {String(report.classification || 'confidential')} • {formatDateTime(report.generated_at)}
        </p>
      </div>
      <Badge variant="outline">{String(report.status || 'completed')}</Badge>
      <Button
        variant="outline"
        size="sm"
        disabled={exportingReportId === String(report.id)}
        onClick={() => void exportDarkRiskWithSurfaceTemplate(report, 'pdf')}
      >
        <Download className="w-4 h-4 mr-2" />
        PDF
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={exportingReportId === String(report.id)}
        onClick={() => void exportDarkRiskWithSurfaceTemplate(report, 'docx')}
      >
        <Download className="w-4 h-4 mr-2" />
        DOCX
      </Button>
      <Button variant="outline" size="sm" onClick={() => void openReportAsset(report, 'json')}>
        <Download className="w-4 h-4 mr-2" />
        JSON
      </Button>
      <Button variant="outline" size="sm" onClick={() => void openReportAsset(report, 'html')}>
        <ExternalLink className="w-4 h-4 mr-2" />
        HTML
      </Button>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-3xl font-bold text-foreground">DarkRisk360</h1>
              <Badge variant="outline">{overview.tier === 'extended' ? 'Estesa' : 'Standard'}</Badge>
              {!overview.enabled && <Badge variant="destructive">Servizio non abilitato</Badge>}
            </div>
            <p className="text-muted-foreground">
              Monitoraggio minacce, esposizione digitale e Domain Threat Intelligence
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <AlertBellButton alertCount={activeAlertsCount} onClick={() => setAlertDialogOpen(true)} />
            <Button variant="outline" onClick={() => void refetch()} disabled={isLoading || isFetching}>
              <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
              Aggiorna
            </Button>
            <Button className="bg-primary text-primary-foreground" disabled={syncingScan || isFetching} onClick={() => void handleSyncSurfaceScan()}>
              <Eye className="w-4 h-4 mr-2" />
              {syncingScan ? 'Scansione in corso...' : 'Nuova scansione'}
            </Button>
            <Button
              variant="outline"
              disabled={!organizationId || generateReportMutation.isPending}
              onClick={() => generateReportMutation.mutate(overview.tier === 'extended' ? 'extended' : 'weekly')}
            >
              <FileText className="w-4 h-4 mr-2" />
              {generateReportMutation.isPending ? 'Generazione...' : 'Genera report'}
            </Button>
            <Button variant="outline" onClick={() => navigate('/admin/clients')}>
              <Building2 className="w-4 h-4 mr-2" />
              Cambia cliente
            </Button>
          </div>
        </div>

        {(isLoading || alertsLoading) && (
          <Card className="border-border">
            <CardContent className="py-8 text-sm text-muted-foreground">Caricamento dati DarkRisk360 in corso...</CardContent>
          </Card>
        )}

        {isError && !isLoading && (
          <Card className="border-red-500/40">
            <CardContent className="py-6 text-sm text-red-300">
              Impossibile caricare i dati DarkRisk360: {String((error as any)?.message || 'errore sconosciuto')}.
            </CardContent>
          </Card>
        )}

        {!isLoading && !isError && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {kpiCards.map((card) => (
                <DarkRiskKpiCard
                  key={card.key}
                  title={card.title}
                  value={card.value}
                  delta={formatDelta(card.delta)}
                  extra={card.extra || null}
                  toneClass={card.tone}
                  icon={card.icon}
                  description={card.description}
                  onClick={() => onKpiClick(card.key)}
                />
              ))}
            </div>

            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as DashboardTab)} className="space-y-4">
              <TabsList className="w-full justify-start overflow-x-auto">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="roadmap">Roadmap</TabsTrigger>
                <TabsTrigger value="findings">Findings</TabsTrigger>
                <TabsTrigger value="assets">Assets</TabsTrigger>
                <TabsTrigger value="surface">Surface</TabsTrigger>
                <TabsTrigger value="identity">Identity</TabsTrigger>
                <TabsTrigger value="reports">Reports</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <Card className="border-border">
                  <CardHeader className="pb-3">
                    <CardTitle>Identity Leak Check (Email)</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Inserisci email aziendali da monitorare per leak e compromissioni identity. Le email vengono incluse automaticamente nei cicli DarkRisk360 successivi.
                    </p>
                    <Textarea
                      value={identityEmailsInput}
                      onChange={(event) => setIdentityEmailsInput(event.target.value)}
                      placeholder="es. soc@azienda.it, admin@azienda.it"
                      className="min-h-[84px]"
                    />
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        onClick={() => void handleIdentityLeakScan()}
                        disabled={identityScanning || !organizationId}
                        className="bg-primary text-primary-foreground"
                      >
                        {identityScanning ? 'Analisi in corso...' : 'Avvia controllo identity'}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setActiveTab('identity')}>
                        Vai a Identity
                      </Button>
                      <Badge variant="outline">Email monitorate: {identityEmailSelectors.length}</Badge>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border">
                  <CardHeader className="pb-3">
                    <CardTitle>Scope DarkRisk360</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Inserisci domini/IP direttamente da DarkRisk360: il sistema propaga lo scope, mette in coda i controlli predefiniti e sincronizza automaticamente i moduli attivi del cliente.
                    </p>
                    <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground space-y-1">
                      <div className="font-medium text-foreground">Legenda input scope (misto supportato)</div>
                      <div>Separatore lista: `,` `;` `|` oppure a capo.</div>
                      <div>Esempio: `terenziboutique.com, cereriaterenzi.com, 203.0.113.10, 203.0.113.10-203.0.113.20, 203.0.113.0/24`</div>
                      <div>Tipi supportati: dominio, IP singolo, range IP, CIDR.</div>
                    </div>
                    <div className="flex flex-col gap-2 md:flex-row">
                      <Input
                        value={scopeInput}
                        onChange={(event) => setScopeInput(event.target.value)}
                        placeholder="es. terenziboutique.com, cereriaterenzi.com, 203.0.113.10, 203.0.113.10-203.0.113.20, 203.0.113.0/24"
                        disabled={!organizationId || !isScopeAdmin || scopeSaving || addingScope}
                      />
                      <Button
                        onClick={() => void handleAddScopeRule()}
                        disabled={!organizationId || !isScopeAdmin || scopeSaving || addingScope || !scopeInput.trim()}
                        className="bg-primary text-primary-foreground"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        {addingScope || scopeSaving ? 'Aggiunta...' : 'Aggiungi scope'}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => void handleSyncSurfaceScan()}
                        disabled={!organizationId || syncingScan}
                      >
                        <RefreshCw className={`w-4 h-4 mr-2 ${syncingScan ? 'animate-spin' : ''}`} />
                        {syncingScan ? 'Riesecuzione...' : 'Riesegui controlli default'}
                      </Button>
                    </div>
                    {!isScopeAdmin && (
                      <p className="text-xs text-amber-300">Solo admin possono modificare lo scope.</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">Regole scope: {scopeRules.length}</Badge>
                      <Badge variant="secondary">Queue automatica attiva</Badge>
                      {scopeLoading && <Badge variant="outline">Caricamento scope...</Badge>}
                    </div>
                    {scopeRules.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {scopeRules.slice(0, 12).map((rule) => (
                          <div key={rule.id} className="rounded-md border border-border/70 bg-muted/20 px-3 py-2 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{rule.input_value}</p>
                              <p className="text-xs text-muted-foreground">{presentScopeEntryType(rule.entry_type)}</p>
                            </div>
                            {isScopeAdmin && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-muted-foreground hover:text-red-300"
                                onClick={() => void handleRemoveScopeRule(rule.id)}
                                disabled={scopeSaving}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Nessuna regola scope configurata su questo cliente.</p>
                    )}
                  </CardContent>
                </Card>

                <DarkRiskWeeklyTrend />
                <DarkRiskCoverageMatrix controls={overview.coverage_controls} />
                <DarkRiskThreatGroups
                  groups={overview.threat_groups}
                  resolveIcon={categoryIcon}
                  onOpenCategory={openCategoryDetail}
                />
                <DarkRiskRecentAlerts alerts={overview.recent_alerts as any} onOpenFinding={openFindingDetail} />
              </TabsContent>

              <TabsContent value="roadmap" className="space-y-4">
                <Card className="border-border">
                  <CardHeader className="pb-3">
                    <CardTitle>Roadmap Implementazione (MD09)</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {roadmapLoading ? (
                      <p className="text-sm text-muted-foreground">Calcolo stato roadmap in corso...</p>
                    ) : roadmapError ? (
                      <p className="text-sm text-red-300">Impossibile calcolare lo stato roadmap.</p>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Avanzamento complessivo</span>
                            <span className="font-semibold">{roadmap.summary.progress_percent}%</span>
                          </div>
                          <div className="h-2 rounded-full bg-muted">
                            <div
                              className="h-2 rounded-full bg-primary transition-all"
                              style={{ width: `${Math.max(0, Math.min(100, roadmap.summary.progress_percent))}%` }}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                          <Badge variant="default">Completate: {roadmap.summary.completed}</Badge>
                          <Badge variant="secondary">In corso: {roadmap.summary.in_progress}</Badge>
                          <Badge variant="outline">Pianificate: {roadmap.summary.planned}</Badge>
                          <Badge variant="destructive">Bloccate: {roadmap.summary.blocked}</Badge>
                          <Badge variant="outline">Tier: {roadmap.tier}</Badge>
                        </div>

                        <div className="space-y-2">
                          {roadmap.phases.map((phase) => (
                            <div key={phase.key} className="rounded-lg border border-border/70 bg-muted/20 p-3">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-medium">{phase.title}</p>
                                <Badge variant={roadmapBadgeVariant(phase.status)}>
                                  {roadmapStatusLabel[phase.status] || phase.status}
                                </Badge>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">{phase.evidence}</p>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-border">
                  <CardHeader className="pb-3">
                    <CardTitle>QA Security Snapshot (MD10)</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {qaLoading ? (
                      <p className="text-sm text-muted-foreground">Verifica automatica QA in corso...</p>
                    ) : qaError ? (
                      <p className="text-sm text-red-300">Impossibile leggere lo snapshot QA.</p>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <Badge variant={qaStatus.score >= 80 ? 'default' : qaStatus.score >= 50 ? 'secondary' : 'destructive'}>
                            Score {qaStatus.score}/100
                          </Badge>
                          <Badge variant="outline">
                            Checklist: {qaStatus.passed}/{qaStatus.total}
                          </Badge>
                        </div>
                        <div className="space-y-1">
                          {qaStatus.checklist.map((item) => (
                            <div key={item.id} className="flex items-center justify-between rounded border border-border/60 bg-muted/20 px-3 py-2 text-xs">
                              <span className="font-mono">{item.id}</span>
                              <Badge variant={item.passed ? 'default' : 'destructive'}>
                                {item.passed ? 'PASS' : 'FAIL'}
                              </Badge>
                            </div>
                          ))}
                        </div>
                        {qaStatus.notes.length > 0 ? (
                          <p className="text-xs text-muted-foreground">{qaStatus.notes[0]}</p>
                        ) : null}
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="findings" className="space-y-4">
                <Card className="border-border">
                  <CardHeader className="pb-3">
                    <CardTitle>Filtri Finding</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {severityOrder.map((severity) => (
                        <Button
                          key={severity}
                          size="sm"
                          variant={findingFilter.severity === severity ? 'default' : 'outline'}
                          onClick={() => setFindingFilter((prev) => ({ ...prev, severity }))}
                        >
                          {severity}
                        </Button>
                      ))}
                      <Button
                        size="sm"
                        variant={findingFilter.category ? 'default' : 'outline'}
                        onClick={() => setFindingFilter((prev) => ({ ...prev, category: null, highlightedFindingId: null, scope: 'all' }))}
                      >
                        Tutte le categorie
                      </Button>
                    </div>
                    <Input
                      placeholder="Cerca per titolo, tipo, asset, source..."
                      value={findingFilter.query}
                      onChange={(event) => setFindingFilter((prev) => ({ ...prev, query: event.target.value, highlightedFindingId: null }))}
                    />
                    {findingFilter.category ? (
                      <p className="text-xs text-muted-foreground">
                        Categoria attiva: {findingFilter.category}
                        {findingFilter.scope === 'latest_overview' ? ' · dettaglio coerente con il riquadro Minacce Rilevate' : ''}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
                <DarkRiskFindingsAnalytics
                  rows={filteredFindings.map((row) => ({
                    id: row.id,
                    site: row.site || normalizeHost(row.asset),
                    scope_status: row.scope_status || 'unknown',
                    category: row.category || 'Minacce rilevate',
                    sensitive_tags: row.sensitive_tags || [],
                    severity: row.severity,
                    risk_score: row.risk_score,
                    title: row.title,
                    asset: row.asset,
                    finding_type: row.finding_type,
                    source: row.source,
                    query_kind: row.query_kind || '',
                    source_origin: row.source_origin || '',
                    first_seen_at: row.first_seen_at,
                    last_seen_at: row.last_seen_at,
                  }))}
                  extendedMode={overview.tier === 'extended'}
                  dti={overview.dti}
                />
                <DarkRiskFindingsTable
                  rows={filteredFindings}
                  subtitle={findingsLoading ? 'Caricamento finding in corso...' : `${filteredFindings.length} finding filtrati`}
                />
              </TabsContent>

              <TabsContent value="assets" className="space-y-4">
                <Card className="border-border">
                  <CardHeader className="pb-3">
                    <CardTitle>Filtri Asset</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    {(['all', 'domain', 'subdomain', 'ip', 'url', 'email', 'candidate'] as const).map((filterValue) => (
                      <Button
                        key={filterValue}
                        size="sm"
                        variant={assetTypeFilter === filterValue ? 'default' : 'outline'}
                        onClick={() => setAssetTypeFilter(filterValue)}
                      >
                        {filterValue}
                      </Button>
                    ))}
                  </CardContent>
                </Card>
                <DarkRiskAssetsTable
                  rows={filteredAssets}
                  subtitle={assetsLoading ? 'Caricamento asset in corso...' : `${filteredAssets.length} asset nel filtro corrente`}
                />
              </TabsContent>

              <TabsContent value="surface">
                <Card className="border-border">
                  <CardHeader className="pb-3">
                    <CardTitle>Surface</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {overview.latest_scan ? (
                      <>
                        <div className="space-y-2 text-sm text-muted-foreground">
                          <p>Questa vista aggrega i segnali SurfaceScan360 (domini, IP, porte, servizi, TLS, CVE) sui dati reali già sincronizzati.</p>
                          <p>Usa i collegamenti rapidi per aprire il modulo operativo o filtrare direttamente ritrovamenti e asset collegati.</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="rounded-lg border border-border/70 bg-muted/20 p-4 space-y-3">
                            <div>
                              <p className="text-sm font-semibold text-foreground">Modulo SurfaceScan360</p>
                              <p className="text-xs text-muted-foreground">Apri dashboard, scope, porte, tecnologie e repository report.</p>
                            </div>
                            <Button variant="outline" size="sm" onClick={() => navigate('/surface-scan')}>
                              <ExternalLink className="w-4 h-4 mr-2" />
                              Apri SurfaceScan360
                            </Button>
                          </div>

                          <div className="rounded-lg border border-border/70 bg-muted/20 p-4 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-foreground">Ritrovamenti tecnici</p>
                                <p className="text-xs text-muted-foreground">Finding Surface sincronizzati e filtrati nel ciclo corrente.</p>
                              </div>
                              <Badge variant="outline">{surfaceLinkedStats.latestFindings || surfaceLinkedStats.findings}</Badge>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Badge className="bg-red-500/15 text-red-300 border-red-500/30">{surfaceLinkedStats.highPriority} critical/high</Badge>
                            </div>
                            <Button variant="outline" size="sm" onClick={openSurfaceFindings}>
                              <Activity className="w-4 h-4 mr-2" />
                              Vedi ritrovamenti
                            </Button>
                          </div>

                          <div className="rounded-lg border border-border/70 bg-muted/20 p-4 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-foreground">Asset in scope</p>
                                <p className="text-xs text-muted-foreground">Domini, IP, URL e identity importati nel perimetro DarkRisk360.</p>
                              </div>
                              <Badge variant="outline">{surfaceLinkedStats.assets}</Badge>
                            </div>
                            <Button variant="outline" size="sm" onClick={openSurfaceAssets}>
                              <Shield className="w-4 h-4 mr-2" />
                              Vedi asset collegati
                            </Button>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-background/40 p-3">
                          <Badge variant="secondary">Sync automatico attivo</Badge>
                          <Badge variant="outline">Finding Surface: {surfaceLinkedStats.findings}</Badge>
                          <Badge variant="outline">Asset approvati: {surfaceLinkedStats.assets}</Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={syncingScan}
                            onClick={() => void handleSyncSurfaceScan({ triggerType: 'surface_tab_manual', successMessage: 'Sincronizzazione SurfaceScan360 aggiornata' })}
                          >
                            <RefreshCw className={`w-4 h-4 mr-2 ${syncingScan ? 'animate-spin' : ''}`} />
                            Aggiorna collegamenti
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">I dati SurfaceScan360 non sono disponibili per questa scansione. Verificare integrazione o rilanciare il job.</p>
                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" onClick={() => navigate('/surface-scan')}>
                            <ExternalLink className="w-4 h-4 mr-2" />
                            Apri SurfaceScan360
                          </Button>
                          <Button
                            size="sm"
                            disabled={syncingScan}
                            onClick={() => void handleSyncSurfaceScan({ triggerType: 'surface_tab_manual', successMessage: 'Sincronizzazione SurfaceScan360 avviata' })}
                          >
                            <RefreshCw className={`w-4 h-4 mr-2 ${syncingScan ? 'animate-spin' : ''}`} />
                            Avvia sincronizzazione
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="identity">
                <div className="space-y-4">
                  <Card className="border-border">
                    <CardHeader className="pb-3">
                      <CardTitle>Identity Exposure</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        Identità impattate: <span className="font-semibold text-foreground">{overview.kpis.impacted_identities.value}</span>
                      </p>
                      {overview.tier === 'extended' ? (
                        <p className="text-sm text-muted-foreground">Modalità Estesa attiva: workflow analyst e correlazione identity sempre inclusi.</p>
                      ) : (
                        <p className="text-sm text-muted-foreground">Modalità Standard: viste sintetiche, remediation e raccomandazioni operative.</p>
                      )}

                      <div className="rounded-lg border border-border/70 bg-muted/20 p-3 space-y-3">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <p className="text-sm font-medium">Controllo mirato leak email</p>
                          <Badge variant="outline">Analisi identity continua</Badge>
                        </div>
                        <Textarea
                          value={identityEmailsInput}
                          onChange={(event) => setIdentityEmailsInput(event.target.value)}
                          placeholder="Inserisci email (una per riga o CSV), es. ceo@azienda.it, it@azienda.it"
                          className="min-h-[92px]"
                        />
                        <div className="flex items-center gap-2 flex-wrap">
                          <Button
                            onClick={() => void handleIdentityLeakScan()}
                            disabled={identityScanning || !organizationId}
                            className="bg-primary text-primary-foreground"
                          >
                            {identityScanning ? 'Analisi in corso...' : 'Avvia controllo leak identity'}
                          </Button>
                          <p className="text-xs text-muted-foreground">
                            I selector email approvati entrano automaticamente nei cicli successivi.
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-border">
                    <CardHeader className="pb-3">
                      <CardTitle>Email monitorate per Identity</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {identitySelectorsLoading ? (
                        <p className="text-sm text-muted-foreground">Caricamento selector email...</p>
                      ) : identityEmailSelectors.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nessuna email monitorata. Inserisci un set iniziale per avviare controlli mirati.</p>
                      ) : (
                        <div className="space-y-2">
                          {identityEmailSelectors.map((selector) => (
                            <div key={String(selector.id)} className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                              <span className="text-sm font-medium">{String(selector.normalized_value || selector.value || '-')}</span>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">{String(selector.status || 'approved')}</Badge>
                                <span className="text-xs text-muted-foreground">{formatDateTime(selector.updated_at)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="reports" className="space-y-4">
                <Card className="border-border">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <CardTitle>Repository Report DarkRisk360</CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          Export unificato con template SurfaceScan360: PDF e DOCX disponibili per ogni snapshot.
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!organizationId || generateReportMutation.isPending}
                        onClick={() => generateReportMutation.mutate('weekly')}
                      >
                        <FileText className="w-4 h-4 mr-2" />
                        {generateReportMutation.isPending ? 'Generazione...' : 'Genera settimanale'}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {(reportsLoading || generateReportMutation.isPending) && (
                      <p className="text-sm text-muted-foreground">Aggiornamento repository report in corso...</p>
                    )}
                    {!reportsLoading && reportSnapshots.length === 0 && (
                      <p className="text-sm text-muted-foreground">Nessun report snapshot disponibile per il cliente selezionato.</p>
                    )}
                    {!reportsLoading && reportSnapshots.length > 0 && (
                      <div className="space-y-4">
                        <div className="rounded-xl border border-border/70 bg-muted/20 p-4 space-y-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-foreground">SETTIMANALE</p>
                              <p className="text-xs text-muted-foreground">
                                Un solo report per settimana con la quantità di leak/evidenze trovate nel ciclo DarkRisk360 standard.
                              </p>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!organizationId || generateReportMutation.isPending}
                              onClick={() => generateReportMutation.mutate('weekly')}
                            >
                              <FileText className="w-4 h-4 mr-2" />
                              Genera settimanale
                            </Button>
                          </div>
                          {reportRepository.weekly ? (
                            renderReportSnapshot(reportRepository.weekly, 'weekly')
                          ) : (
                            <p className="text-sm text-muted-foreground">Nessun report settimanale disponibile per questa settimana.</p>
                          )}
                        </div>

                        {overview.tier === 'extended' && (
                          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-foreground">ESTESO · DTI ESTESO</p>
                                <p className="text-xs text-muted-foreground">
                                  Report finale unico: viene creato una sola volta e poi riutilizzato, senza duplicati a ogni scansione.
                                </p>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={!organizationId || generateReportMutation.isPending || Boolean(reportRepository.extended)}
                                onClick={() => generateReportMutation.mutate('extended')}
                              >
                                <FileText className="w-4 h-4 mr-2" />
                                {reportRepository.extended ? 'Esteso già generato' : 'Genera esteso'}
                              </Button>
                            </div>
                            {reportRepository.extended ? (
                              renderReportSnapshot(reportRepository.extended, 'extended')
                            ) : (
                              <p className="text-sm text-muted-foreground">Nessun report esteso finale ancora disponibile.</p>
                            )}
                          </div>
                        )}

                        {reportRepository.hiddenDuplicates > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {reportRepository.hiddenDuplicates} snapshot storico duplicato nascosto dalla vista operativa. Lo storico resta preservato nel DB.
                          </p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}

        <AlertConfigDialog
          open={alertDialogOpen}
          onOpenChange={setAlertDialogOpen}
          onSubmit={createAlert}
          mode="create"
        />
      </div>
    </DashboardLayout>
  );
};

export default DarkRisk360;
