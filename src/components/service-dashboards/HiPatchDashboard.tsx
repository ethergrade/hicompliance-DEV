import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Info } from 'lucide-react';
import { RiskScoreCard } from './RiskScoreCard';
import { VulnerabilitiesTable } from './VulnerabilitiesTable';
import { OsPatchesTable } from './OsPatchesTable';
import { SoftwarePatchesTable } from './SoftwarePatchesTable';

// Mock data
const vulnerabilities = [
  { id: 'CVE-2024-56433', remediation: '-', score: 0.05, severity: 'Low' as const },
  { id: 'CVE-2025-8194', remediation: '-', score: 0.00, severity: 'High' as const },
  { id: 'CVE-2025-59375', remediation: '-', score: 0.00, severity: 'High' as const },
  { id: 'CVE-2025-8677', remediation: '-', score: 0.00, severity: 'High' as const },
  { id: 'CVE-2025-9230', remediation: '-', score: 0.00, severity: 'High' as const },
  { id: 'CVE-2025-9714', remediation: '-', score: 0.00, severity: 'Medium' as const },
  { id: 'CVE-2025-40780', remediation: '-', score: 0.00, severity: 'High' as const },
  { id: 'CVE-2023-4693', remediation: '-', score: 0.00, severity: 'Medium' as const },
  { id: 'CVE-2023-4692', remediation: '-', score: 0.00, severity: 'High' as const },
  { id: 'CVE-2025-40778', remediation: '-', score: 0.00, severity: 'High' as const },
  { id: 'http-cookie-flags', remediation: '-', score: 0.00, severity: 'High' as const },
  { id: 'Strict_Transport_Security', remediation: '-', score: 0.00, severity: 'Medium' as const },
];

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
  return (
    <div className="space-y-8">
      {/* Vulnerabilities Section */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Vulnerabilities</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <RiskScoreCard 
            title="Average Risk Score"
            level="Moderato"
            levelColor="yellow"
            score={48}
            ringColor="hsl(var(--muted-foreground))"
          />
          <RiskScoreCard 
            title="Max Risk Score"
            level="Alto"
            levelColor="orange"
            score={80}
            ringColor="#f59e0b"
          />
        </div>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-lg">Last vulnerabilities</CardTitle>
            <p className="text-sm text-muted-foreground">ordered by date and score</p>
          </CardHeader>
          <CardContent>
            <VulnerabilitiesTable vulnerabilities={vulnerabilities} />
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
