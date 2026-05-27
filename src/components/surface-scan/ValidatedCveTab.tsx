import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ShieldCheck, PlayCircle, Loader2, AlertCircle, ExternalLink, Activity, FileSearch } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/components/auth/AuthProvider';
import {
  useExternalScanJobs,
  useExternalCveFindings,
  useTriggerPentestScan,
  type ScanProfile,
  type ExternalCveFinding,
} from '@/hooks/usePentestTools';

const severityClass: Record<string, string> = {
  critical: 'bg-destructive text-destructive-foreground',
  high: 'bg-red-500 text-white',
  medium: 'bg-amber-500 text-white',
  low: 'bg-yellow-400 text-black',
  info: 'bg-muted text-muted-foreground',
};

// Label vendor-neutral per i tipi di scansione e l'origine
const SCAN_PROFILE_LABELS: Record<string, string> = {
  safe_recon: 'Ricognizione passiva',
  recon_safe: 'Ricognizione passiva',
  cve_web: 'Validazione CVE Web',
  cve_network: 'Validazione CVE Network',
};
const TRIGGERED_BY_LABELS: Record<string, string> = {
  manual: 'Avvio manuale',
  cron: 'Schedulazione automatica',
  auto_from_shodan: 'Validazione automatica da OSINT',
};
const scanProfileLabel = (v?: string | null) => (v && SCAN_PROFILE_LABELS[v]) || v || '—';
const triggeredByLabel = (v?: string | null) => (v && TRIGGERED_BY_LABELS[v]) || v || '—';


const confidenceLabel: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  validated: { label: 'Validato', variant: 'default' },
  active_scan_validated: { label: 'Scan attivo confermato', variant: 'default' },
  external_signal_not_attributed: { label: 'Solo segnale esterno', variant: 'outline' },
  unvalidated: { label: 'Non validato', variant: 'secondary' },
};

export const ValidatedCveTab: React.FC = () => {
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.user_type === 'admin';
  const { data: jobs = [], isLoading: jobsLoading } = useExternalScanJobs();
  const [filterJobId, setFilterJobId] = useState<string | undefined>();
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const { data: findings = [], isLoading: findingsLoading } = useExternalCveFindings(filterJobId);
  const triggerMut = useTriggerPentestScan();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [target, setTarget] = useState('');
  const [profile, setProfile] = useState<ScanProfile>('cve_web');
  const [authorized, setAuthorized] = useState(false);
  const [ownershipProof, setOwnershipProof] = useState('');
  const [selectedFinding, setSelectedFinding] = useState<ExternalCveFinding | null>(null);

  const filteredFindings = useMemo(() => {
    if (severityFilter === 'all') return findings;
    return findings.filter((f) => f.severity === severityFilter);
  }, [findings, severityFilter]);

  const summary = useMemo(() => {
    return {
      critical: findings.filter((f) => f.severity === 'critical').length,
      high: findings.filter((f) => f.severity === 'high').length,
      validated: findings.filter((f) => f.confidence === 'validated').length,
      not_attributed: findings.filter((f) => f.confidence === 'external_signal_not_attributed').length,
    };
  }, [findings]);

  const handleLaunch = async () => {
    if (!target.trim()) { toast.error('Inserisci un target'); return; }
    if (!authorized) { toast.error('Spunta l\'autorizzazione esplicita'); return; }
    if (profile === 'cve_network' && !ownershipProof.trim()) {
      toast.error('Prova di ownership richiesta per cve_network'); return;
    }
    try {
      await triggerMut.mutateAsync({
        target: target.trim(),
        profile,
        authorization_proof: ownershipProof.trim() || undefined,
      });
      toast.success('Scan avviato', { description: 'I risultati arriveranno via webhook.' });
      setSheetOpen(false);
      setTarget(''); setOwnershipProof(''); setAuthorized(false);
    } catch (e: any) {
      toast.error('Avvio fallito', { description: e?.message ?? 'Riprova' });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5" />
              CVE validati attivamente
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Validazione attiva automatica su domini e IP autorizzati: parte non appena un nuovo target viene aggiunto al monitoraggio
              (autorizzazione implicita dai T&amp;C accettati in fase di registrazione). Su shared hosting le CVE IP-level non vengono attribuite al dominio.
            </p>
          </div>
          {isAdmin && (
            <Badge variant="outline" className="gap-1.5 border-primary/40 text-primary bg-primary/5">
              <Activity className="w-3.5 h-3.5" />
              Auto-trigger attivo
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">

            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Critical</p>
              <p className="text-2xl font-bold text-destructive">{summary.critical}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">High</p>
              <p className="text-2xl font-bold text-red-500">{summary.high}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Validati</p>
              <p className="text-2xl font-bold">{summary.validated}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Non attribuiti</p>
              <p className="text-2xl font-bold text-muted-foreground">{summary.not_attributed}</p>
            </div>
          </div>

          {/* Jobs */}
          <div className="mb-4">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2"><Activity className="w-4 h-4" />Scan recenti</h3>
            {jobsLoading ? <div className="text-sm text-muted-foreground">Caricamento...</div> :
             jobs.length === 0 ? (
              <div className="text-sm text-muted-foreground p-4 border border-dashed rounded-lg">
                Nessuno scan attivo eseguito. La validazione parte automaticamente dal cron settimanale quando la scansione passiva è cieca, oppure può essere lanciata manualmente da admin.
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {jobs.map((j) => (
                  <button key={j.id} onClick={() => setFilterJobId(filterJobId === j.id ? undefined : j.id)}
                    className={`w-full text-left rounded-lg border p-2 hover:bg-muted/50 transition ${filterJobId === j.id ? 'border-primary bg-primary/5' : ''}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{j.target}</p>
                        <p className="text-xs text-muted-foreground">
                          {scanProfileLabel(j.scan_profile)} · {triggeredByLabel(j.triggered_by)} · {new Date(j.created_at).toLocaleString('it-IT')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-xs">{j.hosting_context}</Badge>
                        <Badge variant={j.status === 'completed' ? 'default' : j.status === 'failed' ? 'destructive' : 'secondary'}>
                          {j.status === 'running' && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                          {j.status}
                        </Badge>
                      </div>
                    </div>
                  </button>
                ))}
                {filterJobId && (
                  <Button variant="ghost" size="sm" onClick={() => setFilterJobId(undefined)}>Mostra tutti i finding</Button>
                )}
              </div>
            )}
          </div>

          {/* Findings */}
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold flex items-center gap-2"><FileSearch className="w-4 h-4" />Finding{filterJobId && ' (job selezionato)'}</h3>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte le severity</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="info">Info</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {findingsLoading ? <div className="text-sm text-muted-foreground">Caricamento finding...</div> :
           filteredFindings.length === 0 ? (
            <div className="text-sm text-muted-foreground p-4 border border-dashed rounded-lg text-center">
              Nessun finding {filterJobId ? 'per questo scan' : 'disponibile'}.
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Severity</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>CVE</TableHead>
                    <TableHead>CVSS</TableHead>
                    <TableHead>EPSS</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Attribuzione</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFindings.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell><Badge className={severityClass[f.severity]}>{f.severity}</Badge></TableCell>
                      <TableCell className="max-w-xs truncate text-sm">{f.name}</TableCell>
                      <TableCell className="text-xs font-mono">
                        {f.cve.slice(0, 2).join(', ')}
                        {f.cve.length > 2 && <span className="text-muted-foreground"> +{f.cve.length - 2}</span>}
                        {f.in_cisa_catalog && <Badge variant="destructive" className="ml-1 text-[10px]">KEV</Badge>}
                      </TableCell>
                      <TableCell className="text-xs">{f.cvssv3 ?? f.cvss ?? '-'}</TableCell>
                      <TableCell className="text-xs">{f.epss_score != null ? `${(f.epss_score * 100).toFixed(1)}%` : '-'}</TableCell>
                      <TableCell className="text-xs max-w-[180px] truncate">
                        {f.affected_url ?? f.ip ?? f.target}
                        {f.port && `:${f.port}`}
                      </TableCell>
                      <TableCell>
                        <Badge variant={confidenceLabel[f.confidence]?.variant ?? 'secondary'} className="text-[10px]">
                          {confidenceLabel[f.confidence]?.label ?? f.confidence}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => setSelectedFinding(f)}>
                          <ExternalLink className="w-3 h-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail sheet */}
      <Sheet open={!!selectedFinding} onOpenChange={(o) => !o && setSelectedFinding(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {selectedFinding && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Badge className={severityClass[selectedFinding.severity]}>{selectedFinding.severity}</Badge>
                  {selectedFinding.name}
                </SheetTitle>
                <SheetDescription>
                  {selectedFinding.cve.join(', ') || 'Nessun CVE associato'}
                  {selectedFinding.cwe && ` · ${selectedFinding.cwe}`}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4 py-4 text-sm">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded border p-2">
                    <p className="text-xs text-muted-foreground">CVSS v3</p>
                    <p className="font-semibold">{selectedFinding.cvssv3 ?? selectedFinding.cvss ?? '-'}</p>
                  </div>
                  <div className="rounded border p-2">
                    <p className="text-xs text-muted-foreground">EPSS</p>
                    <p className="font-semibold">{selectedFinding.epss_score != null ? `${(selectedFinding.epss_score * 100).toFixed(2)}%` : '-'}</p>
                  </div>
                  <div className="rounded border p-2">
                    <p className="text-xs text-muted-foreground">CISA KEV</p>
                    <p className="font-semibold">{selectedFinding.in_cisa_catalog ? 'Sì' : 'No'}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Target</p>
                  <p className="font-mono text-xs break-all">{selectedFinding.affected_url ?? selectedFinding.ip ?? selectedFinding.target}{selectedFinding.port && `:${selectedFinding.port}`}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Confidence</p>
                  <Badge variant={confidenceLabel[selectedFinding.confidence]?.variant ?? 'secondary'}>
                    {confidenceLabel[selectedFinding.confidence]?.label ?? selectedFinding.confidence}
                  </Badge>
                  <span className="text-xs text-muted-foreground ml-2">attribution: {selectedFinding.attribution_confidence}</span>
                </div>
                {selectedFinding.recommendation && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Remediation</p>
                    <p className="whitespace-pre-wrap text-sm">{selectedFinding.recommendation}</p>
                  </div>
                )}
                {selectedFinding.evidence && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Evidence</p>
                    <pre className="text-[10px] bg-muted p-2 rounded overflow-x-auto max-h-48">{JSON.stringify(selectedFinding.evidence, null, 2)}</pre>
                  </div>
                )}
                <details>
                  <summary className="text-xs cursor-pointer text-muted-foreground">Raw payload</summary>
                  <pre className="text-[10px] bg-muted p-2 rounded overflow-x-auto max-h-64 mt-2">{JSON.stringify(selectedFinding.raw_finding, null, 2)}</pre>
                </details>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};
