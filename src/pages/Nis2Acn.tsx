import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useClientContext } from '@/contexts/ClientContext';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Nis2ClassificationWizard } from '@/components/nis2/Nis2ClassificationWizard';
import { Nis2AcnAssessment, Nis2GapList } from '@/components/nis2/Nis2AcnAssessment';
import { nis2Deadlines, type ClassificationResult, type WizardAnswers } from '@/lib/nis2Acn/classify';
import type { Nis2Profile } from '@/lib/nis2Acn/catalog';

export default function Nis2Acn() {
  const navigate = useNavigate();
  const { selectedOrganization } = useClientContext();
  const orgId = selectedOrganization?.id;
  const year = new Date().getFullYear();
  const [result, setResult] = useState<(ClassificationResult & { answers: WizardAnswers }) | null>(null);
  const [override, setOverride] = useState<Nis2Profile | 'auto'>('auto');
  const profile: Nis2Profile = override === 'auto' ? result?.profilo_assessment ?? 'base' : override;

  const applyToProfile = async (t: 'essenziale' | 'importante' | null) => {
    if (!orgId) return;
    const { error } = await supabase.from('organization_profiles').upsert(
      { organization_id: orgId, nis2_classification: t === 'essenziale' ? 'essential' : t === 'importante' ? 'important' : 'none' } as any,
      { onConflict: 'organization_id' },
    );
    if (error) toast.error('Aggiornamento profilo non riuscito'); else toast.success('Classificazione NIS2 applicata al profilo');
  };

  const deadlines = nis2Deadlines(year, result?.answers.C01, result?.answers.pecDate);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <DashboardLayout>
      <div className="space-y-4 p-4 md:p-6 min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/assessment')}><ArrowLeft className="w-4 h-4 mr-1" />Assessment</Button>
          <h1 className="text-2xl font-bold">Percorso NIS2 ACN</h1>
          {selectedOrganization && <Badge variant="outline">{selectedOrganization.name}</Badge>}
        </div>
        <p className="text-sm text-muted-foreground max-w-3xl">Classificazione D.Lgs. 138/2024, scadenze e assessment requisito per requisito sulle misure di base ACN. È separato dall'assessment HiCompliance: punteggi e report esistenti non cambiano.</p>
        {!orgId ? <p>Seleziona un cliente.</p> : (
          <Tabs defaultValue="classificazione">
            <TabsList>
              <TabsTrigger value="classificazione">1 · Classificazione</TabsTrigger>
              <TabsTrigger value="calendario">2 · Calendario</TabsTrigger>
              <TabsTrigger value="assessment">3 · Assessment ACN</TabsTrigger>
              <TabsTrigger value="piano">4 · Piano di adeguamento</TabsTrigger>
            </TabsList>
            <TabsContent value="classificazione">
              <Nis2ClassificationWizard orgId={orgId} year={year} onResult={setResult} onApplyToProfile={applyToProfile} />
            </TabsContent>
            <TabsContent value="calendario">
              <Card>
                <CardHeader><CardTitle>Adempimenti {year}</CardTitle></CardHeader>
                <CardContent className="divide-y">
                  {deadlines.map((d) => (
                    <div key={d.label} className="py-2 flex items-center gap-3 text-sm">
                      <span className="w-28 shrink-0 font-mono">{d.date.split('-').reverse().join('/')}</span>
                      <span className="flex-1 min-w-0">{d.label}</span>
                      <Badge variant={d.date < today ? 'destructive' : 'outline'}>{d.date < today ? (d.kind === 'inserimento' ? 'Scaduto' : 'Passato') : 'In arrivo'}</Badge>
                    </div>
                  ))}
                  <p className="pt-3 text-xs text-muted-foreground">Ogni modifica delle informazioni comunicate ad ACN va notificata entro 14 giorni (art. 7 c.7). Per i soggetti inseriti dal 2027 le date seguono le determinazioni ACN.</p>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="assessment" className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <span>Catalogo:</span>
                <Select value={override} onValueChange={(v) => setOverride(v as any)}>
                  <SelectTrigger className="w-72"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Dalla classificazione ({result?.profilo_assessment ?? 'base'})</SelectItem>
                    <SelectItem value="ess">Essenziali · 43 misure, 116 requisiti</SelectItem>
                    <SelectItem value="imp">Importanti · 37 misure, 87 requisiti</SelectItem>
                    <SelectItem value="base">Base volontario · 20 misure</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Nis2AcnAssessment orgId={orgId} profile={profile} />
            </TabsContent>
            <TabsContent value="piano">
              <Nis2GapList orgId={orgId} profile={profile} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}
