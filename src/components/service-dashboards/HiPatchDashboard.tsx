import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Info, AlertTriangle } from 'lucide-react';
import { RiskScoreCard } from './RiskScoreCard';
import { VulnerabilitiesTable } from './VulnerabilitiesTable';
import { OsPatchesTable } from './OsPatchesTable';
import { SoftwarePatchesTable } from './SoftwarePatchesTable';
import { useAssessmentReport } from '@/hooks/useAssessmentReport';
import type { Vulnerability as ApiVulnerability } from '@/types/api';

// ─── Helpers ───────────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<string, number> = {
  critical: 4, high: 3, medium: 2, low: 1,
};

const normalizeSeverity = (s: string): 'Low' | 'Medium' | 'High' | 'Critical' => {
  const lower = s.toLowerCase();
  if (lower === 'critical') return 'Critical';
  if (lower === 'high') return 'High';
  if (lower === 'medium') return 'Medium';
  return 'Low';
};

const RISK_LEVEL_COLOR: Record<string, 'green' | 'yellow' | 'orange' | 'red'> = {
  altissimo: 'red',
  alto: 'orange',
  moderato: 'yellow',
  basso: 'green',
};

const mapVulnerabilities = (apiVulns: ApiVulnerability[]) =>
  apiVulns
    .map((v) => ({
      id: v.cve,
      remediation: v.affected_ips?.length ? `${v.affected_ips.length} IP(s) affetti` : '-',
      score: (v.epss_score ?? 0) * 100,
      severity: normalizeSeverity(v.severity),
    }))
    .sort((a, b) => (SEVERITY_ORDER[b.severity.toLowerCase()] ?? 0) - (SEVERITY_ORDER[a.severity.toLowerCase()] ?? 0));

// TODO: Replace mock OS/software patches with HiPatch API endpoint when available
// The assessment API does not provide OS/software patch data (only CVE vulnerabilities).
// Patch data should come from the HiPatch tool via a dedicated integration endpoint.

const osPatchesPending = [
  { systemName: 'SRV2025-HYPERV', patch: 'Definition updates', description: 'Update for Windows Security platform - KB5007651 (Version 10.0.27840.1000)', kbNumber: 'KB5007651', severity: 'Important' as const },
  { systemName: 'SRV2025-HYPERV', patch: 'Security updates', description: '2025-07 Cumulative Update for Microsoft server operating system version 24H2 for x64-based Systems (KB5062553)', kbNumber: 'KB5062553', severity: 'Important' as const },
  { systemName: 'SRV2022DOMOTZ', patch: 'Security updates', description: '2025-07 Cumulative Update for Microsoft server operating system version 21H2 for x64-based Systems (KB5062572)', kbNumber: 'KB5062572', severity: 'Important' as const },
];

const osPatchesInstalled = [
  { systemName: 'SRV2025-HYPERV', patch: 'Security updates', description: '2025-07 Cumulative Update for Microsoft server operating system version 24H2 for x64-based Systems (KB5062553)', kbNumber: 'KB5062553', status: 'Failed' as const },
  { systemName: 'SRV2025-HYPERV', patch: 'Definition updates', description: 'Update for Windows Security platform - KB5007651 (Version 10.0.27840.1000)', kbNumber: 'KB5007651', status: 'Failed' as const },
  { systemName: 'NB-PUCCINELLI', patch: 'Aggiornamento dell\'intelligence sulla sicurezza per Microsoft Defender Antivirus', description: '-2267602 KB (versione 1.441.307.0) - Canale corrente (Generico)', kbNumber: 'KB', status: 'Installed' as const },
  { systemName: 'NB-PUCCINELLI', patch: 'Aggiornamento per Microsoft Defender Antivirus piattaforma antimalware', description: '- 4052623 KB (versione 4.18.25100.9008) - Canale corrente (Generico)', kbNumber: 'KB', status: 'Installed' as const },
];

const softwarePatchesAvailable = [
  { systemName: 'SRV2022-VIRT-HV', patch: 'Installer', description: 'Open Office', impact: 'Critical' as const, status: 'Rejected' as const },
  { systemName: 'SRV2022-VIRT-HV', patch: 'Installer', description: 'Google Chrome', impact: 'Critical' as const, status: 'Rejected' as const },
  { systemName: 'SRV2022-VIRT-HV', patch: 'Installer', description: 'Thunderbird x64', impact: 'Critical' as const, status: 'Rejected' as const },
  { systemName: 'SRV2022-VIRT-HV', patch: 'Installer', description: 'Mozilla Firefox x64', impact: 'Critical' as const, status: 'Rejected' as const },
  { systemName: 'SRV2022DOMOTZ', patch: 'Installer', description: 'Open Office', impact: 'Critical' as const, status: 'Rejected' as const },
  { systemName: 'NB-PUCCINELLI', patch: 'Installer', description: 'WinRAR x64', impact: 'Critical' as const, status: 'Rejected' as const },
];

const softwarePatchesInstalled = [
  { systemName: 'NB-PUCCINELLI', product: 'OBS Studio', type: 'PATCH', status: 'Failed' as const },
  { systemName: 'NB-PUCCINELLI', product: 'Microsoft Visual C++ 2015-2022 Redistributable (x86)', type: 'PATCH', status: 'Installed' as const },
  { systemName: 'NB-PUCCINELLI', product: 'Dev Home (Preview)', type: 'PATCH', status: 'Installed' as const },
  { systemName: 'SRV2022DOMOTZ', product: 'Microsoft Edge', type: 'PATCH', status: 'Installed' as const },
  { systemName: 'SRV2022DOMOTZ', product: 'Beats winlogbeat', type: 'PATCH', status: 'Installed' as const },
];

export const HiPatchDashboard: React.FC = () => {
  const { vulnerabilities: apiVulns, summary, loading, error } = useAssessmentReport();

  const mappedVulns = useMemo(() => mapVulnerabilities(apiVulns), [apiVulns]);

  const avgScore = useMemo(() => {
    if (mappedVulns.length === 0) return 0;
    const total = mappedVulns.reduce((sum, v) => sum + v.score, 0);
    return Math.round(total / mappedVulns.length);
  }, [mappedVulns]);

  const maxScore = useMemo(() => {
    if (mappedVulns.length === 0) return 0;
    return Math.round(Math.max(...mappedVulns.map((v) => v.score)));
  }, [mappedVulns]);

  const riskLabel = summary?.risk_label ?? 'N/D';
  const riskScore = summary?.risk_score ?? 0;
  const riskLevelColor: 'green' | 'yellow' | 'orange' | 'red' =
    RISK_LEVEL_COLOR[riskLabel.toLowerCase()] ?? 'yellow';
  const ringColor =
    riskLevelColor === 'red' ? '#ef4444' :
    riskLevelColor === 'orange' ? '#f59e0b' :
    riskLevelColor === 'yellow' ? '#eab308' : '#10b981';

  if (error) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
        <AlertTriangle className="w-5 h-5" />
        <span>Dati assessment non disponibili</span>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Vulnerabilities Section */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Vulnerabilities</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <RiskScoreCard 
            title="Rischio Assessment"
            level={riskLabel}
            levelColor={riskLevelColor}
            score={riskScore}
            ringColor={ringColor}
          />
          <RiskScoreCard 
            title="Avg EPSS Score"
            level={avgScore > 50 ? 'Alto' : avgScore > 10 ? 'Moderato' : 'Basso'}
            levelColor={avgScore > 50 ? 'red' : avgScore > 10 ? 'yellow' : 'green'}
            score={avgScore}
            ringColor="hsl(var(--muted-foreground))"
          />
          <RiskScoreCard 
            title="Max EPSS Score"
            level={maxScore > 50 ? 'Critico' : maxScore > 10 ? 'Alto' : 'Moderato'}
            levelColor={maxScore > 50 ? 'red' : maxScore > 10 ? 'orange' : 'yellow'}
            score={maxScore}
            ringColor="#f59e0b"
          />
        </div>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-lg">
              Ultime vulnerabilità
              {loading && <span className="ml-2 text-sm text-muted-foreground animate-pulse">caricamento...</span>}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {mappedVulns.length > 0
                ? `${mappedVulns.length} CVE rilevate — ordinate per severità`
                : 'Nessuna vulnerabilità rilevata nell\'ultimo scan'}
            </p>
          </CardHeader>
          <CardContent>
            {mappedVulns.length > 0 ? (
              <VulnerabilitiesTable vulnerabilities={mappedVulns} />
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <Info className="w-10 h-10 mx-auto mb-2 opacity-30" />
                Dati vulnerabilità non ancora disponibili. Esegui uno scan per popolare questa sezione.
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Patches Section */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Patches</h2>
        
        <RiskScoreCard 
          title="HiPatch Risk Score"
          level="Basso"
          levelColor="green"
          score={30}
          ringColor="#10b981"
          className="max-w-md"
        />

        {/* OS Patches */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-lg">OS Patches</CardTitle>
          </CardHeader>
          <CardContent className="space-y-8">
            <div>
              <h4 className="text-sm text-muted-foreground mb-4">Ultime patch in attesa</h4>
              <OsPatchesTable patches={osPatchesPending} type="pending" />
            </div>
            
            <div>
              <h4 className="text-sm text-muted-foreground mb-4">Ultime patch installate</h4>
              <OsPatchesTable patches={osPatchesInstalled} type="installed" />
            </div>
          </CardContent>
        </Card>

        {/* Software Patches */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-lg">Software Patches</CardTitle>
          </CardHeader>
          <CardContent className="space-y-8">
            <div>
              <h4 className="text-sm text-muted-foreground mb-4">Ultime software patch disponibili</h4>
              <SoftwarePatchesTable patches={softwarePatchesAvailable} type="available" />
            </div>
            
            <div>
              <h4 className="text-sm text-muted-foreground mb-4">Ultime software patch installate</h4>
              <SoftwarePatchesTable patches={softwarePatchesInstalled} type="installed" />
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
};
