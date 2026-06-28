import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Trash2, Plus, Target, RefreshCw } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

type TargetType = 'domain' | 'email' | 'ip' | 'cidr';

interface ManualTarget {
  id: string;
  target_type: TargetType;
  value: string;
  normalized_value: string;
  label: string | null;
  enabled: boolean;
  created_at: string;
}

function normalizeInput(value: string): string {
  return value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
}

function detectType(value: string): TargetType {
  if (/^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(value)) return 'email';
  if (/^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/.test(value)) return value.includes('/') ? 'cidr' : 'ip';
  return 'domain';
}

function expandedSelectors(value: string, type: TargetType): string[] {
  if (type !== 'domain') return [value];
  const apex = value.startsWith('www.') ? value.slice(4) : value;
  const result = new Set<string>([value]);
  if (apex !== value) result.add(apex);
  result.add(`@${apex}`);
  return Array.from(result);
}

interface Props {
  organizationId: string;
}

export function DarkRiskManualTargetManager({ organizationId }: Props) {
  const queryClient = useQueryClient();
  const [inputValue, setInputValue] = useState('');

  const { data: targets = [], isLoading } = useQuery({
    queryKey: ['darkrisk360-manual-targets', organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('darkrisk360_manual_targets')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as ManualTarget[]) ?? [];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (raw: string) => {
      const normalized = normalizeInput(raw);
      if (!normalized) throw new Error('Valore non valido');
      const type = detectType(normalized);
      const { error } = await (supabase as any)
        .from('darkrisk360_manual_targets')
        .insert({
          organization_id: organizationId,
          target_type: type,
          value: normalized,
          normalized_value: normalized,
          enabled: true,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      setInputValue('');
      queryClient.invalidateQueries({ queryKey: ['darkrisk360-manual-targets', organizationId] });
      toast({ title: 'Target aggiunto', description: 'Il target è stato aggiunto correttamente.' });
    },
    onError: (err: Error) => {
      toast({ title: 'Errore', description: err.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('darkrisk360_manual_targets')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['darkrisk360-manual-targets', organizationId] });
      toast({ title: 'Target rimosso' });
    },
    onError: (err: Error) => {
      toast({ title: 'Errore', description: err.message, variant: 'destructive' });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await (supabase as any)
        .from('darkrisk360_manual_targets')
        .update({ enabled })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['darkrisk360-manual-targets', organizationId] });
    },
  });

  const handleAdd = () => {
    if (!inputValue.trim()) return;
    addMutation.mutate(inputValue);
  };

  const typeColors: Record<TargetType, string> = {
    domain: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    email:  'bg-purple-500/10 text-purple-500 border-purple-500/20',
    ip:     'bg-orange-500/10 text-orange-500 border-orange-500/20',
    cidr:   'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  };

  return (
    <Card className="bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Target className="h-4 w-4" />
          Target di Monitoraggio
        </CardTitle>
        <CardDescription className="text-xs">
          Aggiungi domini, email o IP da monitorare. Per i domini viene generata automaticamente
          la ricerca sul dominio bare autorizzato.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Input */}
        <div className="flex gap-2">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="es. cereriaterenzi.it oppure 192.168.1.1"
            className="flex-1 text-sm"
          />
          <Button
            size="sm"
            onClick={handleAdd}
            disabled={addMutation.isPending || !inputValue.trim()}
          >
            {addMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
        </div>

        {/* Target list */}
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Caricamento...</div>
        ) : targets.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-4">
            Nessun target configurato. Aggiungi un dominio per iniziare il monitoraggio.
          </div>
        ) : (
          <div className="space-y-2">
            {targets.map((t) => {
              const selectors = expandedSelectors(t.normalized_value, t.target_type);
              return (
                <div
                  key={t.id}
                  className={`flex items-center justify-between p-2 rounded-md border text-sm ${t.enabled ? 'border-border bg-muted/30' : 'border-border/50 bg-muted/10 opacity-50'}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="outline" className={`text-xs shrink-0 ${typeColors[t.target_type]}`}>
                      {t.target_type}
                    </Badge>
                    <div className="min-w-0">
                      <div className="font-mono text-xs truncate">{t.value}</div>
                      {selectors.length > 1 && (
                        <div className="text-xs text-muted-foreground truncate">
                          queries: {selectors.join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => toggleMutation.mutate({ id: t.id, enabled: !t.enabled })}
                      title={t.enabled ? 'Disabilita' : 'Abilita'}
                    >
                      <span className={`h-2 w-2 rounded-full ${t.enabled ? 'bg-green-500' : 'bg-gray-400'}`} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => deleteMutation.mutate(t.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
