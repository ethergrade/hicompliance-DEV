import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { assessmentApi } from '@/lib/api';
import { tenantServicesApi } from '@/lib/api/tenant-services';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { Loader2, CheckCircle, AlertCircle, Play, Save } from 'lucide-react';

/**
 * Assessment + Gantt Test Page
 * Pure frontend testing utility for verifying:
 * - Assessment creation
 * - Gantt data loading
 * - Tenant service filtering
 */

interface TestResult {
  name: string;
  status: 'pending' | 'running' | 'success' | 'error';
  message?: string;
  data?: unknown;
}

export default function AssessmentGanttTest() {
  const { organizationId, groupId, selectedOrganization } = useClientOrganization();
  const [results, setResults] = useState<TestResult[]>([
    { name: 'Organization Context', status: 'pending' },
    { name: 'Tenant Services API', status: 'pending' },
    { name: 'Assessment List', status: 'pending' },
    { name: 'Assessment Create', status: 'pending' },
    { name: 'Gantt Data Format', status: 'pending' },
  ]);
  const [isRunning, setIsRunning] = useState(false);
  const [ganttJson, setGanttJson] = useState<string>('');

  const updateResult = (index: number, update: Partial<TestResult>) => {
    setResults(prev => prev.map((r, i) => i === index ? { ...r, ...update } : r));
  };

  const runAllTests = async () => {
    if (!organizationId || !groupId) {
      toast({ title: 'Errore', description: 'Seleziona un cliente prima di testare', variant: 'destructive' });
      return;
    }

    setIsRunning(true);
    setResults(prev => prev.map(r => ({ ...r, status: 'pending' })));

    // Test 1: Organization Context
    updateResult(0, { status: 'running' });
    try {
      if (!organizationId || !groupId) throw new Error('Missing org or group');
      updateResult(0, { 
        status: 'success', 
        message: `Org: ${organizationId.slice(0, 8)}... Group: ${groupId.slice(0, 8)}...` 
      });
    } catch (e) {
      updateResult(0, { status: 'error', message: String(e) });
      setIsRunning(false);
      return;
    }

    // Test 2: Tenant Services API
    updateResult(1, { status: 'running' });
    try {
      const services = await tenantServicesApi.listByOrganization(organizationId, groupId);
      const orgServices = services.filter(s => s.tenant_id === organizationId);
      updateResult(1, { 
        status: 'success', 
        message: `${orgServices.length} services for this org (${services.length} total in group)`,
        data: orgServices.map(s => s.service_type)
      });
    } catch (e) {
      updateResult(1, { status: 'error', message: String(e) });
    }

    // Test 3: Assessment List
    updateResult(2, { status: 'running' });
    let assessmentId: string | null = null;
    try {
      const list = await assessmentApi.list(groupId);
      assessmentId = list[0]?.id || null;
      updateResult(2, { 
        status: 'success', 
        message: `${list.length} assessments found`,
        data: list.map(a => ({ id: a.id.slice(0, 8), tenant_id: a.tenant_id?.slice(0, 8) }))
      });
    } catch (e) {
      updateResult(2, { status: 'error', message: String(e) });
    }

    // Test 4: Assessment Create (or use existing)
    updateResult(3, { status: 'running' });
    try {
      if (!assessmentId) {
        const created = await assessmentApi.create({ tenant_id: organizationId }, groupId);
        assessmentId = created.id;
        updateResult(3, { status: 'success', message: 'Created new assessment', data: { id: created.id.slice(0, 8) } });
      } else {
        updateResult(3, { status: 'success', message: 'Using existing assessment', data: { id: assessmentId.slice(0, 8) } });
      }
    } catch (e) {
      updateResult(3, { status: 'error', message: String(e) });
    }

    // Test 5: Gantt Data Format
    updateResult(4, { status: 'running' });
    try {
      if (assessmentId) {
        const assessment = await assessmentApi.get(assessmentId, groupId);
        const ganttData = assessment.gantt_data || [];
        setGanttJson(JSON.stringify(ganttData, null, 2));
        updateResult(4, { 
          status: 'success', 
          message: `${ganttData.length} Gantt items`,
          data: ganttData.slice(0, 3)
        });
      } else {
        updateResult(4, { status: 'error', message: 'No assessment available' });
      }
    } catch (e) {
      updateResult(4, { status: 'error', message: String(e) });
    }

    setIsRunning(false);
    toast({ title: 'Test completato', description: 'Verifica i risultati qui sotto' });
  };

  const saveGanttJson = async () => {
    if (!organizationId || !groupId) return;
    try {
      const list = await assessmentApi.list(groupId);
      const assessment = list[0];
      if (assessment) {
        const parsed = JSON.parse(ganttJson);
        await assessmentApi.updateGantt(assessment.id, { gantt_data: parsed }, groupId);
        toast({ title: 'Salvato', description: 'Gantt data aggiornata' });
      }
    } catch (e) {
      toast({ title: 'Errore', description: String(e), variant: 'destructive' });
    }
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Assessment + Gantt Test Suite</h1>
          <Button 
            onClick={runAllTests} 
            disabled={isRunning || !organizationId}
            className="gap-2"
          >
            {isRunning && <Loader2 className="w-4 h-4 animate-spin" />}
            <Play className="w-4 h-4" />
            {isRunning ? 'Testing...' : 'Run All Tests'}
          </Button>
        </div>

        {!organizationId && (
          <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
            <CardContent className="flex items-center gap-3 py-4">
              <AlertCircle className="w-5 h-5 text-amber-600" />
              <p className="text-amber-800 dark:text-amber-200">
                Seleziona un cliente dall&apos;header per iniziare i test
              </p>
            </CardContent>
          </Card>
        )}

        {selectedOrganization && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">Organizzazione selezionata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">{selectedOrganization.name}</span>
                <Badge variant="secondary">{selectedOrganization.id.slice(0, 8)}...</Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                Group: {selectedOrganization.group_id?.slice(0, 8)}...
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4">
          {results.map((result, i) => (
            <Card key={result.name} className={
              result.status === 'error' ? 'border-red-200 bg-red-50/50' :
              result.status === 'success' ? 'border-green-200 bg-green-50/50' :
              result.status === 'running' ? 'border-blue-200 bg-blue-50/50' : ''
            }>
              <CardContent className="flex items-start gap-4 py-4">
                <div className="mt-0.5">
                  {result.status === 'success' && <CheckCircle className="w-5 h-5 text-green-600" />}
                  {result.status === 'error' && <AlertCircle className="w-5 h-5 text-red-600" />}
                  {result.status === 'running' && <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />}
                  {result.status === 'pending' && <div className="w-5 h-5 rounded-full border-2 border-muted" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{result.name}</div>
                  {result.message && (
                    <div className="text-sm text-muted-foreground mt-1">{result.message}</div>
                  )}
                  {result.data && (
                    <pre className="text-xs bg-muted/50 rounded p-2 mt-2 overflow-auto max-h-32">
                      {JSON.stringify(result.data, null, 2)}
                    </pre>
                  )}
                </div>
                <Badge variant={
                  result.status === 'success' ? 'default' :
                  result.status === 'error' ? 'destructive' :
                  result.status === 'running' ? 'secondary' : 'outline'
                }>
                  {result.status}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>

        {ganttJson && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Gantt Data Editor</CardTitle>
              <Button size="sm" onClick={saveGanttJson} className="gap-2">
                <Save className="w-4 h-4" />
                Salva
              </Button>
            </CardHeader>
            <CardContent>
              <Textarea
                value={ganttJson}
                onChange={(e) => setGanttJson(e.target.value)}
                className="font-mono text-xs min-h-[300px]"
                spellCheck={false}
              />
              <p className="text-sm text-muted-foreground mt-2">
                Modifica direttamente i dati Gantt in formato JSON. Usa con cautela.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
