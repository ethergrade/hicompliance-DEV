// ─────────────────────────────────────────────────────────────────────────
// ANTEPRIMA "DarkRisk360 ricco" — pagina self-contained con SOLI dati mock.
// Nessuna chiamata a Supabase/backend, nessun login: serve per mostrare al
// team la versione più ricca della pagina (recuperata da PRODOTTO@a4145d1).
// Montata su una rotta nascosta e pubblica. Non impatta l'app reale.
// ─────────────────────────────────────────────────────────────────────────
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ShieldAlert, KeyRound, Globe, Gauge, AlertTriangle, Bell,
  Users, Server, TrendingUp, TrendingDown, Activity,
} from 'lucide-react';
import { DarkRiskSourcePieChart } from './components/DarkRiskSourcePieChart';
import { DarkRiskFiletypePieChart } from './components/DarkRiskFiletypePieChart';
import { DarkRiskCalendarHeatmap } from './components/DarkRiskCalendarHeatmap';
import { DarkRiskAssetBreakdown } from './components/DarkRiskAssetBreakdown';
import { DarkRiskCredentialLeaks, type CredentialHit } from './components/DarkRiskCredentialLeaks';

// ── MOCK DATA ──────────────────────────────────────────────────────────────
const RESULTS_BY_SOURCE: Record<string, number> = {
  'leaks.restricted': 342, 'leaks.logs': 289, 'web.public.com': 205,
  'web.public.it': 156, whois: 98, dns: 74, paste: 63, forum: 41, darkweb: 19,
};
const RESULTS_BY_FILETYPE: Record<string, number> = {
  html: 410, text: 268, pdf: 187, csv: 143, database: 98,
  email_body: 76, archive: 55, code: 30, image: 20,
};
const RESULTS_BY_ASSET = {
  'terenziboutique.com': {
    total: 612,
    by_source: { 'leaks.restricted': 210, 'leaks.logs': 168, 'web.public.com': 120, whois: 64, dns: 50 },
    by_filetype: { html: 230, text: 140, pdf: 110, csv: 82, database: 50 },
  },
  'cereriaterenzi.com': {
    total: 438,
    by_source: { 'leaks.logs': 121, 'web.public.it': 130, 'leaks.restricted': 92, paste: 55, forum: 40 },
    by_filetype: { html: 150, text: 98, pdf: 70, email_body: 66, archive: 54 },
  },
  '203.0.113.10': {
    total: 237,
    by_source: { dns: 84, whois: 71, 'web.public.com': 52, darkweb: 30 },
    by_filetype: { text: 90, code: 55, database: 48, image: 44 },
  },
};

function buildResultsByDay(): Record<string, number> {
  const out: Record<string, number> = {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 180; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const dow = d.getDay();
    const base = dow === 2 || dow === 4 ? 14 : dow === 0 || dow === 6 ? 2 : 6;
    const spike = i % 23 === 0 ? 22 : i % 11 === 0 ? 9 : 0;
    const val = base + spike + ((i * 7) % 5);
    if (val > 0 && i % 3 !== 0) out[key] = val;
  }
  return out;
}

const CREDENTIAL_HITS: CredentialHit[] = [
  { selector: 'admin@terenziboutique.com', clear: 'Terenzi2023!', asset: 'terenziboutique.com', bucket: 'leaks.restricted', conf: 'high' },
  { selector: 'info@terenziboutique.com', clear: 'Estate!2022', asset: 'terenziboutique.com', bucket: 'leaks.logs', conf: 'high' },
  { selector: 'shop@terenziboutique.com', clear: 'Wint3rShop', asset: 'terenziboutique.com', bucket: 'leaks.public.general', conf: 'medium' },
  { selector: 'amministrazione@cereriaterenzi.com', clear: 'Candele#2021', asset: 'cereriaterenzi.com', bucket: 'leaks.restricted', conf: 'high' },
  { selector: 'ordini@cereriaterenzi.com', clear: 'Cera2020!!', asset: 'cereriaterenzi.com', bucket: 'leaks.logs', conf: 'medium' },
  { selector: 'marco.rossi@cereriaterenzi.com', clear: 'Password1', asset: 'cereriaterenzi.com', bucket: 'leaks.private.general', conf: 'low' },
  { selector: 'soc@terenziboutique.com', clear: 'S0c!Secure', asset: 'terenziboutique.com', bucket: 'leaks.restricted', conf: 'high' },
].map((r, i) => ({
  id: `mock-cred-${i}`,
  selector_value: r.selector,
  asset_scope: r.asset,
  clear_value: r.clear,
  masked_value: r.clear.slice(0, 2) + '•'.repeat(Math.max(3, r.clear.length - 3)) + r.clear.slice(-1),
  source_bucket: r.bucket,
  tag: 'passwords',
  confidence: r.conf,
  created_at: new Date(Date.now() - i * 36e5 * 8).toISOString(),
  metadata: {},
}));

type Sev = 'critical' | 'high' | 'medium' | 'low' | 'info';
const KPIS: Array<{ key: string; title: string; value: string; delta: number | null; icon: React.ReactNode; tone: string }> = [
  { key: 'threats', title: 'Minacce attive', value: '82', delta: 5, icon: <ShieldAlert className="h-4 w-4" />, tone: 'text-red-400' },
  { key: 'creds', title: 'Credential leaks', value: '47', delta: 12, icon: <KeyRound className="h-4 w-4" />, tone: 'text-orange-400' },
  { key: 'domains', title: 'Domini monitorati', value: '6', delta: 1, icon: <Globe className="h-4 w-4" />, tone: 'text-blue-400' },
  { key: 'risk', title: 'Risk score', value: '72 · Alto', delta: 6, icon: <Gauge className="h-4 w-4" />, tone: 'text-amber-400' },
  { key: 'critical', title: 'Critical findings', value: '18', delta: 2, icon: <AlertTriangle className="h-4 w-4" />, tone: 'text-red-400' },
  { key: 'alerts', title: 'Nuovi alert', value: '9', delta: 3, icon: <Bell className="h-4 w-4" />, tone: 'text-purple-400' },
  { key: 'identities', title: 'Identità impattate', value: '23', delta: 7, icon: <Users className="h-4 w-4" />, tone: 'text-cyan-400' },
  { key: 'services', title: 'Servizi esposti', value: '14', delta: -2, icon: <Server className="h-4 w-4" />, tone: 'text-emerald-400' },
];

const THREAT_GROUPS: Array<{ category: string; count: number; severity: Sev; description: string; trend: number }> = [
  { category: 'Credential Exposure', count: 47, severity: 'critical', description: 'Password e credenziali esposte in leak recenti', trend: 12 },
  { category: 'Domain Threat Intel', count: 34, severity: 'high', description: 'Segnali WHOIS/DNS e domini sospetti correlati', trend: 3 },
  { category: 'Dark Web Mentions', count: 19, severity: 'high', description: 'Menzioni asset su forum e marketplace dark web', trend: 6 },
  { category: 'Data Leak Files', count: 88, severity: 'medium', description: 'File (PDF/CSV/DB) con dati riconducibili agli asset', trend: -5 },
  { category: 'Paste / Public Dumps', count: 41, severity: 'medium', description: 'Contenuti su paste site pubblici', trend: 2 },
];

const COVERAGE = [
  { control: 'Credential Leaks', status: 'completed', source: 'IntelX' },
  { control: 'WHOIS / Registrant', status: 'completed', source: 'WHOIS' },
  { control: 'DNS / Reverse DNS', status: 'completed', source: 'DNS' },
  { control: 'Dark Web Monitoring', status: 'partial', source: 'DarkWeb' },
  { control: 'Paste Sites', status: 'completed', source: 'Paste' },
  { control: 'Forum Intelligence', status: 'partial', source: 'Forum' },
  { control: 'Phonebook / Selectors', status: 'completed', source: 'IntelX' },
  { control: 'Surface Exposure', status: 'completed', source: 'SurfaceScan' },
  { control: 'Social Footprint', status: 'not_run', source: 'Social' },
] as const;

const RECENT_ALERTS: Array<{ severity: Sev; title: string; asset: string; time: string }> = [
  { severity: 'critical', title: 'Credenziali admin@terenziboutique.com in leak "restricted"', asset: 'terenziboutique.com', time: 'oggi' },
  { severity: 'high', title: 'Nuovo dump con 128 record collegati a cereriaterenzi.com', asset: 'cereriaterenzi.com', time: '1 g fa' },
  { severity: 'high', title: 'Menzione asset su forum dark web', asset: 'terenziboutique.com', time: '2 g fa' },
  { severity: 'medium', title: 'Variazione record WHOIS registrant', asset: '203.0.113.10', time: '3 g fa' },
  { severity: 'medium', title: 'Paste pubblico con indirizzi email aziendali', asset: 'cereriaterenzi.com', time: '4 g fa' },
];

// ── HELPERS ──────────────────────────────────────────────────────────────
const SEV_CLASS: Record<Sev, string> = {
  critical: 'bg-red-500/15 text-red-400 border-red-500/30',
  high: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  medium: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  low: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  info: 'bg-muted text-muted-foreground border-border',
};
const STATUS_CLASS: Record<string, string> = {
  completed: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  partial: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  not_run: 'bg-muted text-muted-foreground border-border',
};
function Delta({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  const up = delta >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs ${up ? 'text-red-400' : 'text-emerald-400'}`}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? '+' : ''}{delta}
    </span>
  );
}

// ── PAGE ─────────────────────────────────────────────────────────────────
export default function DarkRiskRichPreview() {
  const resultsByDay = React.useMemo(buildResultsByDay, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Banner anteprima */}
      <div className="w-full bg-amber-500/10 border-b border-amber-500/30 px-6 py-2 text-center text-xs text-amber-300">
        ⚠️ ANTEPRIMA con dati fittizi — versione "ricca" di DarkRisk360 recuperata da PRODOTTO@a4145d1. Nessun dato reale.
      </div>

      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-3xl font-bold">DarkRisk360</h1>
              <Badge variant="outline">Estesa</Badge>
              <Badge className="bg-primary/15 text-primary border-primary/30">DTI attivo</Badge>
            </div>
            <p className="text-muted-foreground">
              Monitoraggio minacce, esposizione digitale e Domain Threat Intelligence
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Activity className="h-4 w-4 text-emerald-400" />
            Ultima scansione: oggi · 1.287 record
          </div>
        </div>

        {/* KPI grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {KPIS.map((k) => (
            <Card key={k.key} className="bg-card">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{k.title}</span>
                  <span className={k.tone}>{k.icon}</span>
                </div>
                <div className="mt-2 flex items-end justify-between">
                  <span className="text-2xl font-bold">{k.value}</span>
                  <Delta delta={k.delta} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Credential leaks */}
        <DarkRiskCredentialLeaks hits={CREDENTIAL_HITS} />

        {/* Pie charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DarkRiskSourcePieChart data={RESULTS_BY_SOURCE} />
          <DarkRiskFiletypePieChart data={RESULTS_BY_FILETYPE} />
        </div>

        {/* Calendar heatmap */}
        <DarkRiskCalendarHeatmap data={resultsByDay} />

        {/* Asset breakdown */}
        <DarkRiskAssetBreakdown data={RESULTS_BY_ASSET} />

        {/* Threat groups + Coverage */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="bg-card">
            <CardHeader className="pb-3"><CardTitle className="text-sm">Gruppi di minaccia</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {THREAT_GROUPS.map((g) => (
                <div key={g.category} className="flex items-start justify-between gap-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{g.category}</span>
                      <Badge variant="outline" className={`text-[10px] ${SEV_CLASS[g.severity]}`}>{g.severity}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{g.description}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-lg font-bold">{g.count}</div>
                    <Delta delta={g.trend} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-card">
            <CardHeader className="pb-3"><CardTitle className="text-sm">Coverage controlli</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {COVERAGE.map((c) => (
                <div key={c.control} className="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm truncate">{c.control}</p>
                    <p className="text-[11px] text-muted-foreground">{c.source}</p>
                  </div>
                  <Badge variant="outline" className={`text-[10px] ${STATUS_CLASS[c.status]}`}>
                    {c.status === 'completed' ? 'ok' : c.status === 'partial' ? 'parziale' : 'non eseguito'}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Recent alerts */}
        <Card className="bg-card">
          <CardHeader className="pb-3"><CardTitle className="text-sm">Alert recenti</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {RECENT_ALERTS.map((a, i) => (
              <div key={i} className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant="outline" className={`text-[10px] ${SEV_CLASS[a.severity]}`}>{a.severity}</Badge>
                  <span className="text-sm truncate">{a.title}</span>
                </div>
                <div className="text-xs text-muted-foreground shrink-0">{a.asset} · {a.time}</div>
              </div>
            ))}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground pt-4">
          Anteprima statica a scopo dimostrativo · DarkRisk360 (versione ricca) · dati mock
        </p>
      </div>
    </div>
  );
}
