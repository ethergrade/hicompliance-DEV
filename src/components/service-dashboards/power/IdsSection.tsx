import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Radar, Zap, GitMerge, ShieldAlert } from 'lucide-react';
import { buildIds, IdsProduct, IdsSeverity, IdsEvent, IdsStorm, IdsCorrelation } from '@/data/idsDemo';
import { PowerTable, PowerColumn } from './PowerTable';
import { cn } from '@/lib/utils';

const sevCls: Record<IdsSeverity, string> = {
  Critical: 'bg-destructive/15 text-destructive border-destructive/30',
  High: 'bg-[hsl(var(--cyber-orange)/0.15)] text-[hsl(var(--cyber-orange))] border-[hsl(var(--cyber-orange)/0.3)]',
  Medium: 'bg-secondary text-secondary-foreground',
  Low: 'bg-muted text-muted-foreground',
};
const Sev = ({ s }: { s: IdsSeverity }) => <Badge variant="outline" className={cn('font-medium', sevCls[s])}>{s}</Badge>;
const mono = 'font-mono text-xs';

const eventCols: PowerColumn<IdsEvent>[] = [
  { key: 'id', label: 'ID', className: mono },
  { key: 'timestamp', label: 'Data/Ora', className: mono },
  { key: 'sid', label: 'SID', className: mono },
  { key: 'signature', label: 'Firma' },
  { key: 'stage', label: 'Fase' },
  { key: 'source', label: 'Sorgente', className: mono },
  { key: 'destination', label: 'Destinazione', className: mono },
  { key: 'port', label: 'Porta', className: mono },
  { key: 'severity', label: 'Severità', render: r => <Sev s={r.severity} /> },
  { key: 'action', label: 'Azione' },
  { key: 'stormId', label: 'Storm', render: r => r.stormId ? <Badge variant="outline">{r.stormId}</Badge> : <span className="text-muted-foreground">–</span> },
];
const stormCols: PowerColumn<IdsStorm>[] = [
  { key: 'id', label: 'ID', className: mono },
  { key: 'type', label: 'Tipo' },
  { key: 'source', label: 'Sorgente', className: mono },
  { key: 'start', label: 'Inizio', className: mono },
  { key: 'end', label: 'Fine', className: mono },
  { key: 'events', label: 'Eventi' },
  { key: 'targets', label: 'Target' },
  { key: 'peakPerMin', label: 'Picco/min' },
  { key: 'severity', label: 'Severità', render: r => <Sev s={r.severity} /> },
  { key: 'action', label: 'Stato' },
];
const corCols: PowerColumn<IdsCorrelation>[] = [
  { key: 'id', label: 'ID', className: mono },
  { key: 'rule', label: 'Regola' },
  { key: 'kind', label: 'Tipo', render: r => <Badge variant={r.kind === 'Behaviour' ? 'default' : 'outline'}>{r.kind}</Badge> },
  { key: 'entity', label: 'Entità', className: mono },
  { key: 'description', label: 'Descrizione' },
  { key: 'stages', label: 'Fasi' },
  { key: 'events', label: 'Eventi' },
  { key: 'confidence', label: 'Confidenza', render: r => `${r.confidence}%` },
  { key: 'severity', label: 'Severità', render: r => <Sev s={r.severity} /> },
];

export const IdsSection: React.FC<{ product: IdsProduct; id: string }> = ({ product, id }) => {
  const { events, storms, correlations } = useMemo(() => buildIds(product), [product]);
  const blocked = events.filter(e => e.action === 'Bloccato').length;
  const inStorm = events.filter(e => e.stormId).length;
  const kpi = [
    { label: 'Eventi IDS/IPS', value: events.length, icon: Radar },
    { label: 'Bloccati (IPS)', value: blocked, icon: ShieldAlert },
    { label: 'Storm rilevati', value: `${storms.length} (${inStorm} eventi)`, icon: Zap },
    { label: 'Correlazioni', value: correlations.length, icon: GitMerge },
  ];
  return (
    <Card id={id} className="border-border scroll-mt-28">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Radar className="h-5 w-5 text-primary" /> IDS/IPS – attacchi di rete</CardTitle>
        <p className="text-sm text-muted-foreground">Storm = 15 o più eventi dalla stessa sorgente in 5 minuti. Correlazioni a pattern (stessa firma su molti target o da molte sorgenti) e a comportamento (catena di fasi d'attacco).</p>
      </CardHeader>
      <CardContent className="space-y-4 min-w-0">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {kpi.map(k => (
            <div key={k.label} className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><k.icon className="h-4 w-4" />{k.label}</div>
              <div className="text-xl font-bold mt-1">{k.value}</div>
            </div>
          ))}
        </div>
        <Tabs defaultValue="storm">
          <TabsList>
            <TabsTrigger value="storm">Storm ({storms.length})</TabsTrigger>
            <TabsTrigger value="cor">Correlazioni ({correlations.length})</TabsTrigger>
            <TabsTrigger value="ev">Eventi ({events.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="storm"><PowerTable rows={storms} columns={stormCols} rowKey={r => r.id} /></TabsContent>
          <TabsContent value="cor"><PowerTable rows={correlations} columns={corCols} rowKey={r => r.id} /></TabsContent>
          <TabsContent value="ev"><PowerTable rows={events} columns={eventCols} rowKey={r => r.id} /></TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
