import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { classify, sizeClass, sizeReason, type WizardAnswers, type ClassificationResult } from '@/lib/nis2Acn/classify';
import { NIS2_RULES_VERSION } from '@/lib/nis2Acn/catalog';

const db = supabase as any;

type Opt = { v: string; l: string };
const C00: Opt[] = [{ v: 'essenziale', l: 'Sì, come soggetto essenziale' }, { v: 'importante', l: 'Sì, come soggetto importante' }, { v: 'no', l: 'No / non ancora registrati' }, { v: 'non_so', l: 'Non so' }];
const C02: Opt[] = [{ v: 'si', l: 'Sì' }, { v: 'servizi_in_IT', l: 'No, ma offre servizi in Italia' }, { v: 'no', l: 'No' }];
const C03: Opt[] = [
  { v: 'no', l: 'No' }, { v: 'centrale', l: 'Amministrazione centrale' }, { v: 'regione', l: 'Regione / Provincia autonoma' },
  { v: 'citta_metropolitana', l: 'Città metropolitana' }, { v: 'comune_100k', l: 'Comune > 100.000 abitanti' },
  { v: 'comune_capoluogo', l: 'Comune capoluogo di regione' }, { v: 'asl', l: 'Azienda sanitaria locale' },
  { v: 'altro_allegato_iii', l: 'Altro ente pubblico Allegato III (regolazione, servizi economici/assistenziali, ricerca, IZS)' },
  { v: 'altra_pa', l: 'Altra PA' },
];
const C04: Opt[] = [
  { v: 'telco', l: 'Reti pubbliche / servizi di comunicazione elettronica accessibili al pubblico' },
  { v: 'fiduciari_qualificati', l: 'Servizi fiduciari qualificati' }, { v: 'fiduciari_non_qualificati', l: 'Servizi fiduciari non qualificati' },
  { v: 'TLD', l: 'Gestore di registro TLD' }, { v: 'DNS', l: 'Fornitore di servizi DNS' },
  { v: 'registrar', l: 'Registrar di nomi di dominio' }, { v: 'CER', l: 'Soggetto critico (D.Lgs. 134/2025, CER)' },
];
const C05: Opt[] = [
  { v: 'I', l: 'Allegato I · Energia, trasporti, banche, mercati finanziari, sanità, acqua potabile e reflue, infrastrutture digitali (cloud, data center, CDN, IXP), MSP/MSSP, spazio' },
  { v: 'II', l: 'Allegato II · Poste e corrieri, rifiuti, chimica, alimenti, fabbricazione (dispositivi medici, elettronica, macchinari, autoveicoli), servizi digitali (marketplace, motori di ricerca, social), ricerca' },
  { v: 'IV', l: 'Allegato IV · Trasporto pubblico locale, istruzione con ricerca, interesse culturale, in house/partecipate (solo se designati da ACN)' },
];
const C09: Opt[] = [
  { v: 'a', l: 'a) Influenzate in modo dominante le sue decisioni sulle misure cyber' },
  { v: 'b', l: 'b) Gestite sistemi da cui dipende la fornitura dei suoi servizi' },
  { v: 'c', l: 'c) Svolgete operazioni di sicurezza per suo conto' },
  { v: 'd', l: 'd) Gli fornite servizi TIC o di sicurezza, anche gestiti' },
];

const STATO_LABEL: Record<string, string> = { in_ambito: 'In ambito', fuori_ambito: 'Fuori ambito', da_verificare: 'Da verificare' };

function Q({ id, title, help, source, children }: { id: string; title: string; help: string; source: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 border-b border-border pb-4">
      <div className="flex items-start gap-2">
        <Badge variant="outline">{id}</Badge>
        <div className="min-w-0">
          <p className="font-medium">{title}</p>
          <p className="text-sm text-muted-foreground">{help}</p>
          <p className="text-xs text-muted-foreground">Fonte: {source}</p>
        </div>
      </div>
      <div className="pl-12">{children}</div>
    </div>
  );
}

function Radio({ opts, value, onChange }: { opts: Opt[]; value?: string; onChange: (v: string) => void }) {
  return (
    <RadioGroup value={value ?? ''} onValueChange={onChange} className="space-y-1">
      {opts.map((o) => (
        <label key={o.v} className="flex items-center gap-2 text-sm cursor-pointer"><RadioGroupItem value={o.v} />{o.l}</label>
      ))}
    </RadioGroup>
  );
}

function Multi({ opts, value, onChange }: { opts: Opt[]; value?: string[]; onChange: (v: string[]) => void }) {
  const cur = value ?? [];
  return (
    <div className="space-y-1">
      {opts.map((o) => (
        <label key={o.v} className="flex items-start gap-2 text-sm cursor-pointer">
          <Checkbox checked={cur.includes(o.v)} onCheckedChange={(c) => onChange(c ? [...cur, o.v] : cur.filter((x) => x !== o.v))} className="mt-0.5" />
          <span>{o.l}</span>
        </label>
      ))}
    </div>
  );
}

interface Props {
  orgId: string;
  year: number;
  onResult: (r: ClassificationResult & { answers: WizardAnswers }) => void;
  onApplyToProfile?: (tipologia: 'essenziale' | 'importante' | null) => void;
}

export function Nis2ClassificationWizard({ orgId, year, onResult, onApplyToProfile }: Props) {
  const [a, setA] = useState<WizardAnswers>({});
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const timer = useRef<number>();
  const result = useMemo(() => classify(a), [a]);

  useEffect(() => {
    setLoaded(false);
    db.from('nis2_classifications').select('answers').eq('organization_id', orgId).eq('year', year).maybeSingle()
      .then(({ data }: any) => { setA((data?.answers as WizardAnswers) ?? {}); setLoaded(true); });
  }, [orgId, year]);

  useEffect(() => { if (loaded) onResult({ ...result, answers: a }); }, [result, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch: Partial<WizardAnswers>) => {
    setA((prev) => {
      const next = { ...prev, ...patch };
      window.clearTimeout(timer.current);
      setSaveState('saving');
      timer.current = window.setTimeout(async () => {
        const r = classify(next);
        const { data: u } = await supabase.auth.getUser();
        const { error } = await db.from('nis2_classifications').upsert({
          organization_id: orgId, year, answers: next, ...r, motivi: r.motivi, rules_version: NIS2_RULES_VERSION, created_by: u.user?.id,
        }, { onConflict: 'organization_id,year' });
        if (error) { toast.error('Salvataggio classificazione non riuscito'); setSaveState('idle'); } else setSaveState('saved');
      }, 1500);
      return next;
    });
  };

  if (!loaded) return <p className="text-sm text-muted-foreground">Caricamento…</p>;
  const pec = a.C00 === 'essenziale' || a.C00 === 'importante';
  const size = a.C06;
  const num = (v: string) => Number(v.replace(/\./g, '').replace(',', '.')) || 0;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2 min-w-0">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Classificazione NIS2 {year}</CardTitle>
          <span className="text-xs text-muted-foreground">{saveState === 'saving' ? 'Salvataggio…' : saveState === 'saved' ? 'Salvato' : ''}</span>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Autovalutazione preparatoria: la qualifica la decide ACN con la registrazione annuale. Se avete la PEC di ACN, quella prevale sempre.</p>
          <Q id="C00" title="Avete ricevuto da ACN la PEC di inserimento o permanenza nell'elenco dei soggetti NIS?" help="La PEC arriva da no-reply@pec.acn.gov.it entro il 14 aprile." source="Vademecum NIS 2026 §2, §3.1">
            <Radio opts={C00} value={a.C00} onChange={(v) => set({ C00: v as any })} />
          </Q>
          {pec && (
            <Q id="C01" title="In che anno è arrivata la prima comunicazione di inserimento?" help="Determina le scadenze. Per il 2025 indicate la data esatta della PEC (termini a 9 e 18 mesi)." source="Art. 42 D.Lgs. 138/2024">
              <div className="flex gap-2 flex-wrap">
                <Input type="number" className="w-28" value={a.C01 ?? ''} onChange={(e) => set({ C01: Number(e.target.value) || undefined })} placeholder="Anno" />
                {a.C01 === 2025 && <Input type="date" className="w-44" value={(a as any).pecDate ?? ''} onChange={(e) => set({ pecDate: e.target.value } as any)} />}
              </div>
            </Q>
          )}
          {!pec && (
            <>
              <Q id="C02" title="L'organizzazione è stabilita in Italia?" help="Sede legale o, per i servizi digitali, stabilimento principale nell'UE in Italia." source="D.Lgs. 138/2024 (giurisdizione)">
                <Radio opts={C02} value={a.C02} onChange={(v) => set({ C02: v as any })} />
              </Q>
              {a.C02 !== 'no' && (
                <>
                  <Q id="C03" title="È una pubblica amministrazione?" help="Le PA dell'Allegato III sono in ambito per tipologia." source="Art. 3 c.6-7, Allegato III">
                    <Radio opts={C03} value={a.C03} onChange={(v) => set({ C03: v })} />
                  </Q>
                  <Q id="C04" title="Svolgete una di queste attività, qualunque sia la vostra dimensione?" help="Basta una voce per essere in ambito a prescindere dalla dimensione." source="Art. 3 c.5">
                    <Multi opts={C04} value={a.C04} onChange={(v) => set({ C04: v })} />
                  </Q>
                  <Q id="C05" title="In quali settori opera l'organizzazione (anche come attività secondaria)?" help="Ragionate sull'attività effettiva, non solo sul codice ATECO." source="Art. 3 c.2, Allegati I, II, IV">
                    <Multi opts={C05} value={a.C05} onChange={(v) => set({ C05: v })} />
                  </Q>
                  <Q id="C06" title="Dati dimensionali dell'ultimo esercizio (dati di gruppo)" help="Sommate le imprese associate pro quota e le collegate al 100%." source="Racc. 2003/361/CE">
                    <div className="grid grid-cols-3 gap-2 max-w-lg">
                      <div><Label className="text-xs">ULA</Label><Input inputMode="numeric" value={size?.ula ?? ''} onChange={(e) => set({ C06: { ...(size ?? { ula: 0, fatturato: 0, bilancio: 0 }), ula: num(e.target.value) } })} /></div>
                      <div><Label className="text-xs">Fatturato €</Label><Input inputMode="numeric" value={size?.fatturato ?? ''} onChange={(e) => set({ C06: { ...(size ?? { ula: 0, fatturato: 0, bilancio: 0 }), fatturato: num(e.target.value) } })} /></div>
                      <div><Label className="text-xs">Totale bilancio €</Label><Input inputMode="numeric" value={size?.bilancio ?? ''} onChange={(e) => set({ C06: { ...(size ?? { ula: 0, fatturato: 0, bilancio: 0 }), bilancio: num(e.target.value) } })} /></div>
                    </div>
                    {size && <p className="text-sm mt-2">Classe: <strong>{sizeClass(size)}</strong> ({sizeReason(size)})</p>}
                  </Q>
                  <Q id="C07" title="I vostri sistemi e servizi sono indipendenti da quelli del gruppo?" help="Se la soglia è superata solo per i dati di gruppo e i sistemi sono indipendenti, si può chiedere la clausola di salvaguardia." source="Art. 3 c.4; DPCM 221/2024">
                    <Radio opts={[{ v: 'indipendenti', l: 'Sì, pienamente indipendenti' }, { v: 'condivisi', l: 'No, condividiamo sistemi o servizi' }, { v: 'na', l: 'Non applicabile (impresa autonoma)' }]} value={a.C07} onChange={(v) => set({ C07: v as any })} />
                    {a.C07 === 'indipendenti' && (
                      <div className="grid grid-cols-3 gap-2 max-w-lg mt-2">
                        {(['ula', 'fatturato', 'bilancio'] as const).map((k) => (
                          <div key={k}><Label className="text-xs">{k === 'ula' ? 'ULA solo propri' : k === 'fatturato' ? 'Fatturato solo propri' : 'Bilancio solo propri'}</Label>
                            <Input inputMode="numeric" value={size?.soloPropri?.[k] ?? ''} onChange={(e) => set({ C06: { ...(size ?? { ula: 0, fatturato: 0, bilancio: 0 }), soloPropri: { ...(size?.soloPropri ?? { ula: 0, fatturato: 0, bilancio: 0 }), [k]: num(e.target.value) } } })} /></div>
                        ))}
                      </div>
                    )}
                  </Q>
                  <Q id="C09" title="Siete collegati a un soggetto NIS e vale almeno una di queste condizioni?" help="In questo caso siete in ambito a prescindere dalla dimensione." source="Art. 3 c.10 (da verificare)">
                    <Multi opts={C09} value={a.C09} onChange={(v) => set({ C09: v })} />
                  </Q>
                </>
              )}
            </>
          )}
          <Q id="C08" title="Siete un'entità finanziaria soggetta a DORA (Reg. UE 2022/2554)?" help="Con DORA misure e notifiche seguono DORA; il catalogo ACN resta un'adozione volontaria." source="Art. 3 c.14-15">
            <Radio opts={[{ v: 'si', l: 'Sì' }, { v: 'no', l: 'No' }]} value={a.C08 === undefined ? undefined : a.C08 ? 'si' : 'no'} onChange={(v) => set({ C08: v === 'si' })} />
          </Q>
          <p className="text-xs text-muted-foreground">Ruoli (C11): gestiteli in Rubrica contatti / Governance IRP. Attività e servizi (C12): gestiteli in BIA.</p>
        </CardContent>
      </Card>
      <Card className="h-fit lg:sticky lg:top-4">
        <CardHeader><CardTitle>Esito</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex gap-2 flex-wrap">
            <Badge>{STATO_LABEL[result.stato]}</Badge>
            {result.tipologia && <Badge variant="secondary">Soggetto {result.tipologia}</Badge>}
            {result.regime && result.regime !== 'ordinario' && <Badge variant="outline">Regime {result.regime}</Badge>}
          </div>
          <p>Profilo assessment: <strong>{result.profilo_assessment === 'ess' ? 'Essenziali (116 requisiti)' : result.profilo_assessment === 'imp' ? 'Importanti (87 requisiti)' : 'Base volontario (20 misure)'}</strong></p>
          <ul className="list-disc pl-4 space-y-1 text-muted-foreground">{result.motivi.map((m) => <li key={m}>{m}</li>)}</ul>
          <p className="text-xs text-muted-foreground">Regole versione {NIS2_RULES_VERSION} · fonte: {result.fonte}</p>
          {onApplyToProfile && result.stato !== 'da_verificare' && (
            <Button size="sm" variant="outline" onClick={() => onApplyToProfile(result.tipologia)}>Applica al profilo organizzazione</Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
