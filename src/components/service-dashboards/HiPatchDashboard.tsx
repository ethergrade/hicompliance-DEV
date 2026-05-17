import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Info, AlertTriangle } from 'lucide-react';
import { RiskScoreCard } from './RiskScoreCard';
import { DemoDataBadge } from './DemoDataBadge';
import { VulnerabilitiesTable } from './VulnerabilitiesTable';
import { OsPatchesTable } from './OsPatchesTable';
import { SoftwarePatchesTable } from './SoftwarePatchesTable';
import { useAssessmentReport } from '@/hooks/useAssessmentReport';
import { usePatchDashboard } from '@/hooks/usePatches';
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

// Patch data provided by usePatchDashboard hook with mock fallback
// Vulnerabilities come from the assessment API (useAssessmentReport)

export const HiPatchDashboard: React.FC = () => {
  const { vulnerabilities: apiVulns, summary, loading, error } = useAssessmentReport();
  const { data: patchData, isMock: patchIsMock } = usePatchDashboard();
  const { osPatchesPending, osPatchesInstalled, softwarePatchesAvailable, softwarePatchesInstalled } = patchData;

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
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold">Patches</h2>
          <DemoDataBadge show={patchIsMock} />
        </div>
        
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
