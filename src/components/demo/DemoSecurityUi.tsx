import React, { useMemo, useState } from "react";
import { Activity, AlertTriangle, ArrowDownRight, DatabaseZap, Eye, Globe2, KeyRound, Network, Radar, Search, Server, ShieldCheck, ShieldAlert } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DARKRISK_DEMO, SURFACE_DEMO } from "@/data/innovatechSecurityDemo";

type Tone = "good" | "warn" | "bad" | "info";
const toneMap: Record<Tone, string> = {
  good: "border-cyber-green/30 bg-cyber-green/10 text-cyber-green",
  warn: "border-cyber-orange/30 bg-cyber-orange/10 text-cyber-orange",
  bad: "border-cyber-red/30 bg-cyber-red/10 text-cyber-red",
  info: "border-primary/30 bg-primary/10 text-primary",
};
const severityTone = (value: string): Tone => value === "Critico" ? "bad" : value === "Alto" || value === "Medio" ? "warn" : value === "Basso" ? "good" : "info";

const Metric = ({ label, value, detail, icon: Icon, tone = "info" }: { label: string; value: string | number; detail: string; icon: React.ElementType; tone?: Tone }) => (
  <Card className="border-border">
    <CardContent className="p-5">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className={`rounded-md border p-2 ${toneMap[tone]}`}><Icon className="h-4 w-4" /></div>
        <Badge variant="outline" className={toneMap[tone]}>{detail}</Badge>
      </div>
      <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </CardContent>
  </Card>
);

function usePage<T>(rows: T[], perPage = 7) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  const safePage = Math.min(page, pages - 1);
  return { rows: rows.slice(safePage * perPage, safePage * perPage + perPage), page: safePage, pages, setPage, total: rows.length };
}

const Pager = ({ state }: { state: ReturnType<typeof usePage<unknown>> }) => state.pages <= 1 ? null : (
  <div className="flex items-center justify-between border-t border-border pt-4">
    <span className="text-xs text-muted-foreground">Pagina {state.page + 1} di {state.pages} · {state.total} risultati</span>
    <div className="flex gap-2">
      <Button size="sm" variant="outline" disabled={state.page === 0} onClick={() => state.setPage(state.page - 1)}>Precedenti</Button>
      <Button size="sm" variant="outline" disabled={state.page === state.pages - 1} onClick={() => state.setPage(state.page + 1)}>Successivi</Button>
    </div>
  </div>
);

const Trend = ({ values, tone = "info" }: { values: number[]; tone?: Tone }) => (
  <div className="flex h-32 items-end gap-3" aria-label="Andamento rischio ultime sette rilevazioni">
    {values.map((value, index) => (
      <div key={index} className="flex flex-1 flex-col items-center gap-2">
        <span className="text-xs font-medium">{value}</span>
        <div className="flex h-20 w-full items-end rounded-sm bg-muted">
          <div className={`w-full rounded-sm border ${toneMap[tone]}`} style={{ height: `${value}%` }} />
        </div>
        <span className="text-[10px] text-muted-foreground">S{index + 1}</span>
      </div>
    ))}
  </div>
);

export function DemoSurfaceScan360() {
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState("Tutte");
  const findings = useMemo(() => SURFACE_DEMO.findings.filter(row => (severity === "Tutte" || row[2] === severity) && row.join(" ").toLowerCase().includes(query.toLowerCase())), [query, severity]);
  const assets = usePage(SURFACE_DEMO.assets, 8);
  const ports = usePage(SURFACE_DEMO.ports, 6);
  const findingPage = usePage(findings, 7);

  return <DashboardLayout><div className="space-y-6">
    <header className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div><div className="mb-2 flex gap-2"><Badge className={toneMap.warn}>DEMO</Badge><Badge variant="outline">Ultima scansione: oggi, 08:42</Badge></div><h1 className="text-3xl font-bold">SurfaceScan360</h1><p className="mt-1 text-sm text-muted-foreground">Inventario e rischio della superficie digitale esterna.</p></div>
      <div className="flex gap-2"><Button variant="outline"><Eye className="mr-2 h-4 w-4" />Report</Button><Button><Radar className="mr-2 h-4 w-4" />Nuova scansione</Button></div>
    </header>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <Metric label="Asset rilevati" value={SURFACE_DEMO.metrics.assets} detail="+7" icon={Globe2} />
      <Metric label="Sottodomini" value={SURFACE_DEMO.metrics.subdomains} detail="3 profondi" icon={Network} tone="good" />
      <Metric label="Porte esposte" value={SURFACE_DEMO.metrics.openPorts} detail="6 sensibili" icon={Server} tone="warn" />
      <Metric label="Finding aperti" value={SURFACE_DEMO.metrics.findings} detail="3 critici" icon={AlertTriangle} tone="bad" />
      <Metric label="Health Score" value={`${SURFACE_DEMO.metrics.riskScore}%`} detail="attenzione" icon={ShieldAlert} tone="warn" />
    </div>
    <div className="grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
      <Card><CardHeader><CardTitle className="text-base">Andamento esposizione</CardTitle></CardHeader><CardContent><Trend values={SURFACE_DEMO.trend} tone="warn" /></CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">Copertura perimetro</CardTitle></CardHeader><CardContent className="space-y-4"><div className="flex justify-between text-sm"><span>Asset verificati</span><strong>46 / 48</strong></div><Progress value={96} /><div className="grid grid-cols-3 gap-3 text-center"><div><p className="text-2xl font-semibold">3</p><p className="text-xs text-muted-foreground">Domini</p></div><div><p className="text-2xl font-semibold">31</p><p className="text-xs text-muted-foreground">Sottodomini</p></div><div><p className="text-2xl font-semibold">14</p><p className="text-xs text-muted-foreground">IP</p></div></div></CardContent></Card>
    </div>
    <Tabs defaultValue="findings" className="space-y-4">
      <TabsList className="h-auto w-full justify-start overflow-x-auto"><TabsTrigger value="findings">Finding</TabsTrigger><TabsTrigger value="assets">Asset e sottodomini</TabsTrigger><TabsTrigger value="ports">Porte aperte</TabsTrigger><TabsTrigger value="evidence">Evidenze</TabsTrigger></TabsList>
      <TabsContent value="findings"><Card><CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle>Finding per asset</CardTitle><p className="mt-1 text-sm text-muted-foreground">Rilevazioni raggruppate sull’asset effettivamente interessato.</p></div><div className="flex min-w-0 gap-2"><div className="relative min-w-0"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Cerca asset o finding" className="pl-9" /></div><div className="flex gap-1">{["Tutte","Critico","Alto","Medio"].map(v => <Button key={v} size="sm" variant={severity === v ? "default" : "outline"} onClick={() => setSeverity(v)}>{v}</Button>)}</div></div></CardHeader><CardContent className="space-y-4"><div className="overflow-x-auto"><Table className="min-w-[900px]"><TableHeader><TableRow><TableHead>Finding</TableHead><TableHead>Asset</TableHead><TableHead>Severità</TableHead><TableHead>Stato</TableHead><TableHead>Indicazione</TableHead></TableRow></TableHeader><TableBody>{findingPage.rows.map((r, i) => <TableRow key={i}><TableCell className="font-medium">{r[0]}</TableCell><TableCell className="font-mono text-xs">{r[1]}</TableCell><TableCell><Badge variant="outline" className={toneMap[severityTone(r[2])]}>{r[2]}</Badge></TableCell><TableCell>{r[3]}</TableCell><TableCell className="max-w-xs text-muted-foreground">{r[4]}</TableCell></TableRow>)}</TableBody></Table></div><Pager state={findingPage} /></CardContent></Card></TabsContent>
      <TabsContent value="assets"><Card><CardHeader><CardTitle>Perimetro osservato</CardTitle></CardHeader><CardContent className="space-y-4"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Asset</TableHead><TableHead>Tipo</TableHead><TableHead>IP</TableHead><TableHead>Stato</TableHead><TableHead>Servizi</TableHead></TableRow></TableHeader><TableBody>{assets.rows.map((r,i) => <TableRow key={i}><TableCell className="font-mono text-xs">{r[0]}</TableCell><TableCell>{r[1]}</TableCell><TableCell className="font-mono text-xs">{r[2]}</TableCell><TableCell><Badge variant="outline" className={r[3] === "Attivo" || r[3] === "Monitorato" ? toneMap.good : toneMap.warn}>{r[3]}</Badge></TableCell><TableCell>{r[4]}</TableCell></TableRow>)}</TableBody></Table></div><Pager state={assets} /></CardContent></Card></TabsContent>
      <TabsContent value="ports"><Card><CardHeader><CardTitle>Porte e servizi raggiungibili</CardTitle></CardHeader><CardContent className="space-y-4"><Table><TableHeader><TableRow><TableHead>Asset</TableHead><TableHead>IP</TableHead><TableHead>Porta</TableHead><TableHead>Protocollo</TableHead><TableHead>Rischio</TableHead></TableRow></TableHeader><TableBody>{ports.rows.map((r,i)=><TableRow key={i}><TableCell>{r[0]}</TableCell><TableCell className="font-mono text-xs">{r[1]}</TableCell><TableCell>{r[2]}</TableCell><TableCell>{r[3]}</TableCell><TableCell><Badge variant="outline" className={toneMap[severityTone(r[4])]}>{r[4]}</Badge></TableCell></TableRow>)}</TableBody></Table><Pager state={ports} /></CardContent></Card></TabsContent>
      <TabsContent value="evidence"><div className="grid gap-4 md:grid-cols-3">{[["Risoluzione dominio","31 sottodomini associati a indirizzi verificati",Globe2],["Controlli web","12 endpoint rispondono con configurazione misurabile",Eye],["Validazione esposizioni","27 porte confermate su 14 indirizzi",ShieldCheck]].map(([t,d,I]) => <Card key={String(t)}><CardContent className="p-5"><I className="mb-4 h-5 w-5 text-primary"/><p className="font-medium">{String(t)}</p><p className="mt-2 text-sm text-muted-foreground">{String(d)}</p></CardContent></Card>)}</div></TabsContent>
    </Tabs>
  </div></DashboardLayout>;
}

export function DemoDarkRisk360() {
  const [query, setQuery] = useState("");
  const findings = useMemo(() => DARKRISK_DEMO.findings.filter(row => row.join(" ").toLowerCase().includes(query.toLowerCase())), [query]);
  const findingPage = usePage(findings, 7);
  const assetPage = usePage(DARKRISK_DEMO.assets, 5);
  return <DashboardLayout><div className="space-y-6">
    <header className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between"><div><div className="mb-2 flex gap-2"><Badge className={toneMap.bad}>RISCHIO ALTO</Badge><Badge variant="outline">Monitoraggio settimanale</Badge></div><h1 className="text-3xl font-bold">DarkRisk360</h1><p className="mt-1 text-sm text-muted-foreground">Esposizione digitale, identità coinvolte e segnali di rischio aggregati.</p></div><Button variant="outline"><Activity className="mr-2 h-4 w-4" />Aggiorna vista</Button></header>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><Metric label="Indice di rischio" value={`${DARKRISK_DEMO.metrics.risk}/100`} detail="-5 punti" icon={Radar} tone="warn"/><Metric label="Evidenze attive" value={DARKRISK_DEMO.metrics.findings} detail="12 nuove" icon={DatabaseZap} tone="warn"/><Metric label="Criticità" value={DARKRISK_DEMO.metrics.critical} detail="immediate" icon={ShieldAlert} tone="bad"/><Metric label="Identità coinvolte" value={DARKRISK_DEMO.metrics.identities} detail="5 prioritarie" icon={KeyRound} tone="warn"/><Metric label="Target monitorati" value={DARKRISK_DEMO.metrics.targets} detail="copertura 100%" icon={Globe2} tone="good"/></div>
    <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]"><Card><CardHeader><CardTitle className="flex items-center justify-between text-base">Rischio nelle ultime 7 settimane <span className="flex items-center text-sm text-cyber-green"><ArrowDownRight className="mr-1 h-4 w-4"/>-16 punti</span></CardTitle></CardHeader><CardContent><Trend values={DARKRISK_DEMO.trend} tone="warn"/></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Distribuzione severità</CardTitle></CardHeader><CardContent className="space-y-3">{Object.entries(DARKRISK_DEMO.severity).map(([label,value]) => <div key={label}><div className="mb-1 flex justify-between text-sm"><span>{label}</span><strong>{value}</strong></div><Progress value={value / 37 * 100} indicatorClassName={label === "Critico" ? "bg-cyber-red" : label === "Alto" || label === "Medio" ? "bg-cyber-orange" : "bg-cyber-green"}/></div>)}</CardContent></Card></div>
    <Tabs defaultValue="findings" className="space-y-4"><TabsList className="h-auto w-full justify-start overflow-x-auto"><TabsTrigger value="findings">Evidenze</TabsTrigger><TabsTrigger value="assets">Asset e identità</TabsTrigger><TabsTrigger value="coverage">Copertura</TabsTrigger></TabsList>
      <TabsContent value="findings"><Card><CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle>Evidenze prioritarie</CardTitle><p className="mt-1 text-sm text-muted-foreground">Dati dimostrativi anonimizzati e ordinati per impatto.</p></div><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"/><Input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cerca evidenza o asset" className="pl-9"/></div></CardHeader><CardContent className="space-y-4"><div className="overflow-x-auto"><Table className="min-w-[840px]"><TableHeader><TableRow><TableHead>Evidenza</TableHead><TableHead>Asset</TableHead><TableHead>Severità</TableHead><TableHead>Stato</TableHead><TableHead>Rilevata</TableHead></TableRow></TableHeader><TableBody>{findingPage.rows.map((r,i)=><TableRow key={i}><TableCell className="font-medium">{r[0]}</TableCell><TableCell className="font-mono text-xs">{r[1]}</TableCell><TableCell><Badge variant="outline" className={toneMap[severityTone(r[2])]}>{r[2]}</Badge></TableCell><TableCell>{r[3]}</TableCell><TableCell>{r[4]}</TableCell></TableRow>)}</TableBody></Table></div><Pager state={findingPage}/></CardContent></Card></TabsContent>
      <TabsContent value="assets"><Card><CardHeader><CardTitle>Perimetro monitorato</CardTitle></CardHeader><CardContent className="space-y-4"><Table><TableHeader><TableRow><TableHead>Target</TableHead><TableHead>Tipo</TableHead><TableHead>Evidenze</TableHead><TableHead>Rischio</TableHead><TableHead>Ultimo controllo</TableHead></TableRow></TableHeader><TableBody>{assetPage.rows.map((r,i)=><TableRow key={i}><TableCell className="font-mono text-xs">{r[0]}</TableCell><TableCell>{r[1]}</TableCell><TableCell>{r[2]}</TableCell><TableCell><Badge variant="outline" className={toneMap[severityTone(r[3])]}>{r[3]}</Badge></TableCell><TableCell>{r[4]}</TableCell></TableRow>)}</TableBody></Table><Pager state={assetPage}/></CardContent></Card></TabsContent>
      <TabsContent value="coverage"><div className="grid gap-4 md:grid-cols-3">{[["Esposizione identità",92,"16 identità correlate"],["Archivi e documenti",84,"11 raccolte rilevanti"],["Infrastruttura pubblica",100,"8 target verificati"]].map(([label,value,detail])=><Card key={String(label)}><CardContent className="p-5"><div className="mb-3 flex items-center justify-between"><span className="font-medium">{label}</span><Badge variant="outline" className={toneMap.good}>{value}%</Badge></div><Progress value={Number(value)}/><p className="mt-3 text-xs text-muted-foreground">{detail}</p></CardContent></Card>)}</div></TabsContent>
    </Tabs>
  </div></DashboardLayout>;
}