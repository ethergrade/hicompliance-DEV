import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, ShieldCheck, Globe2, MailCheck, Radar, Shield, Lock, Server, MapPin, Network, Cable } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useClientOrganization } from '@/hooks/useClientOrganization';

interface ModuleResultRow {
  module_key: string;
  module_label: string;
  status: 'queued' | 'running' | 'success' | 'skipped' | 'error' | 'timeout';
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  duration_ms: number | null;
  completed_at: string | null;
}

interface ObservationRow {
  module: string;
  observation_type: string;
  value: Record<string, any>;
  created_at: string;
}

const statusBadgeClass: Record<string, string> = {
  success: 'bg-green-500/15 text-green-300 border-green-500/30',
  running: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  queued: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  skipped: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  timeout: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  error: 'bg-red-500/20 text-red-300 border-red-500/30',
};

const severityBadgeClass: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-300 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  medium: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  low: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  info: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
};

const moduleOrder = [
  'passes',
  'http_security',
  'headers',
  'redirects',
  'redirect_chain',
  'open_ports',
  'ssl_certificate',
  'tls_summary',
  'server_info',
  'server_location',
  'tech_stack',
  'dnssec',
  'whois',
  'quality',
  'threats',
  'dns_blocklists',
];

export const SurfaceScanModuleCards: React.FC = () => {
  const { organizationId } = useClientOrganization();
  const [loading, setLoading] = useState(false);
  const [latestScanId, setLatestScanId] = useState<string | null>(null);
  const [moduleResults, setModuleResults] = useState<ModuleResultRow[]>([]);
  const [observations, setObservations] = useState<ObservationRow[]>([]);

  useEffect(() => {
    if (!organizationId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const latestJobRes = await supabase
          .from('surface_scan_jobs' as any)
          .select('id')
          .eq('customer_id', organizationId)
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestJobRes.error) throw latestJobRes.error;
        const scanId = latestJobRes.data?.id ? String(latestJobRes.data.id) : null;
        setLatestScanId(scanId);
        if (!scanId) {
          setModuleResults([]);
          setObservations([]);
          return;
        }

        const [moduleRes, obsRes] = await Promise.all([
          supabase
            .from('surface_scan_module_results' as any)
            .select('module_key, module_label, status, severity, duration_ms, completed_at')
            .eq('scan_job_id', scanId)
            .in('module_key', moduleOrder),
          supabase
            .from('surface_observations' as any)
            .select('module, observation_type, value, created_at')
            .eq('scan_job_id', scanId)
            .in('module', moduleOrder)
            .order('created_at', { ascending: false })
            .limit(120),
        ]);

        if (moduleRes.error) throw moduleRes.error;
        if (obsRes.error) throw obsRes.error;

        setModuleResults((moduleRes.data || []) as ModuleResultRow[]);
        setObservations((obsRes.data || []) as ObservationRow[]);
      } catch (error) {
        console.error('Error loading SurfaceScan module cards:', error);
        setModuleResults([]);
        setObservations([]);
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [organizationId]);

  const observationByModule = useMemo(() => {
    const map: Record<string, ObservationRow | undefined> = {};
    for (const row of observations) {
      if (!map[row.module]) map[row.module] = row;
    }
    return map;
  }, [observations]);

  const moduleByKey = useMemo(() => {
    const map: Record<string, ModuleResultRow | undefined> = {};
    for (const row of moduleResults) {
      map[row.module_key] = row;
    }
    return map;
  }, [moduleResults]);

  const passes = observationByModule.passes?.value || {};
  const httpSecurity = observationByModule.http_security?.value || {};
  const headers = observationByModule.headers?.value || {};
  const redirects = observationByModule.redirects?.value || observationByModule.redirect_chain?.value || {};
  const openPorts = observationByModule.open_ports?.value || {};
  const ssl = observationByModule.ssl_certificate?.value || {};
  const tls = observationByModule.tls_summary?.value || {};
  const serverInfo = observationByModule.server_info?.value || {};
  const serverLocation = observationByModule.server_location?.value || {};
  const techStack = observationByModule.tech_stack?.value || {};
  const dnssec = observationByModule.dnssec?.value || {};
  const whois = observationByModule.whois?.value || {};
  const quality = observationByModule.quality?.value?.categories || {};
  const threats = observationByModule.threats?.value || {};
  const blocklists = observationByModule.dns_blocklists?.value || {};

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Radar className="w-5 h-5 text-primary" />
          Web-Check Style Modules (SurfaceScan360)
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Stato reale moduli su ultima scansione completata{latestScanId ? ` (${latestScanId.slice(0, 8)}...)` : ''}.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Caricamento moduli...
          </div>
        ) : !latestScanId ? (
          <div className="text-sm text-muted-foreground">Nessuna scansione completata disponibile.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium flex items-center gap-2"><ShieldCheck className="w-4 h-4" />Passes</div>
                <Badge className={statusBadgeClass[moduleByKey.passes?.status || 'skipped']}>
                  {moduleByKey.passes?.status || 'n/d'}
                </Badge>
              </div>
              <div className="text-sm">{passes.passedCount ?? 0}/{passes.totalCount ?? 0} controlli superati</div>
            </div>

            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium flex items-center gap-2"><Shield className="w-4 h-4" />HTTP Security</div>
                <Badge className={statusBadgeClass[moduleByKey.http_security?.status || 'skipped']}>
                  {moduleByKey.http_security?.status || 'n/d'}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                Score: {httpSecurity.score ?? '-'} · Status: {httpSecurity.statusCode ?? '-'}
              </div>
            </div>

            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">Headers</div>
                <Badge className={statusBadgeClass[moduleByKey.headers?.status || 'skipped']}>
                  {moduleByKey.headers?.status || 'n/d'}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                Server: {headers.highlighted?.server || '-'} · Cookies: {headers.highlighted?.set_cookie_count ?? 0}
              </div>
            </div>

            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">Redirects</div>
                <Badge className={statusBadgeClass[moduleByKey.redirects?.status || 'skipped']}>
                  {moduleByKey.redirects?.status || 'n/d'}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                Hop: {redirects.hopCount ?? '-'} · HTTPS: {redirects.redirectsToHttps ? 'sì' : 'no'}
              </div>
            </div>

            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium flex items-center gap-2"><Cable className="w-4 h-4" />Open Ports</div>
                <Badge className={statusBadgeClass[moduleByKey.open_ports?.status || 'skipped']}>
                  {moduleByKey.open_ports?.status || 'n/d'}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                Porte: {Array.isArray(openPorts.openPorts) ? openPorts.openPorts.length : 0} · Profilo: {openPorts.scanProfile || '-'}
              </div>
            </div>

            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium flex items-center gap-2"><Lock className="w-4 h-4" />SSL Certificate</div>
                <Badge className={statusBadgeClass[moduleByKey.ssl_certificate?.status || 'skipped']}>
                  {moduleByKey.ssl_certificate?.status || 'n/d'}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                Source: {ssl.source || '-'} · Exp: {ssl.expiresInDays != null ? `${ssl.expiresInDays}g` : 'n/d'}
              </div>
            </div>

            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">TLS Summary</div>
                <Badge className={statusBadgeClass[moduleByKey.tls_summary?.status || 'skipped']}>
                  {moduleByKey.tls_summary?.status || 'n/d'}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                TLS1.2: {tls.tls12Supported == null ? '-' : tls.tls12Supported ? 'on' : 'off'} · TLS1.3: {tls.tls13Supported == null ? '-' : tls.tls13Supported ? 'on' : 'off'}
              </div>
            </div>

            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium flex items-center gap-2"><Server className="w-4 h-4" />Server Info</div>
                <Badge className={statusBadgeClass[moduleByKey.server_info?.status || 'skipped']}>
                  {moduleByKey.server_info?.status || 'n/d'}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                ASN: {serverInfo.asn || '-'} · Ports: {Array.isArray(serverInfo.ports) ? serverInfo.ports.length : 0}
              </div>
            </div>

            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium flex items-center gap-2"><MapPin className="w-4 h-4" />Server Location</div>
                <Badge className={statusBadgeClass[moduleByKey.server_location?.status || 'skipped']}>
                  {moduleByKey.server_location?.status || 'n/d'}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                {serverLocation.city || '-'}, {serverLocation.countryCode || serverLocation.country || '-'}
              </div>
            </div>

            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium flex items-center gap-2"><Network className="w-4 h-4" />Tech Stack</div>
                <Badge className={statusBadgeClass[moduleByKey.tech_stack?.status || 'skipped']}>
                  {moduleByKey.tech_stack?.status || 'n/d'}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                Tecnologie: {techStack.count ?? (Array.isArray(techStack.technologies) ? techStack.technologies.length : 0)}
              </div>
            </div>

            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">DNSSEC</div>
                <Badge className={statusBadgeClass[moduleByKey.dnssec?.status || 'skipped']}>
                  {moduleByKey.dnssec?.status || 'n/d'}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                DNSKEY: {dnssec.dnskey_present ? 'sì' : 'no'} · DS: {dnssec.ds_present ? 'sì' : 'no'}
              </div>
            </div>

            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium flex items-center gap-2"><Globe2 className="w-4 h-4" />Domain WHOIS</div>
                <Badge className={statusBadgeClass[moduleByKey.whois?.status || 'skipped']}>
                  {moduleByKey.whois?.status || 'n/d'}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                Registrar: {whois.registrar || '-'}
              </div>
              <div className="text-sm text-muted-foreground">
                Scadenza: {whois.days_to_expiry != null ? `${whois.days_to_expiry} giorni` : 'n/d'}
              </div>
            </div>

            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">Quality Summary</div>
                <Badge className={statusBadgeClass[moduleByKey.quality?.status || 'skipped']}>
                  {moduleByKey.quality?.status || 'n/d'}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                Perf {quality.performance ?? '-'} · Acc {quality.accessibility ?? '-'} · BP {quality.best_practices ?? '-'} · SEO {quality.seo ?? '-'}
              </div>
            </div>

            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">Threat Checks</div>
                <Badge className={statusBadgeClass[moduleByKey.threats?.status || 'skipped']}>
                  {moduleByKey.threats?.status || 'n/d'}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                Safe Browsing: {threats.safe_browsing?.unsafe ? 'unsafe' : 'clean'} · URLHaus: {threats.urlhaus?.listed ? 'listed' : 'clean'}
              </div>
            </div>

            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium flex items-center gap-2"><MailCheck className="w-4 h-4" />DNS Blocklist</div>
                <Badge className={statusBadgeClass[moduleByKey.dns_blocklists?.status || 'skipped']}>
                  {moduleByKey.dns_blocklists?.status || 'n/d'}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                Listed: {blocklists.listed_count ?? 0} · Checked: {Array.isArray(blocklists.checked) ? blocklists.checked.length : 0}
              </div>
            </div>
          </div>
        )}

        {moduleResults.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {moduleResults.map((row) => (
              <Badge key={row.module_key} variant="outline" className={severityBadgeClass[row.severity || 'info']}>
                {row.module_label}: {row.severity}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SurfaceScanModuleCards;
