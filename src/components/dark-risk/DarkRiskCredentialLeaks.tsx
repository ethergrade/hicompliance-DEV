import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertTriangle, Eye, EyeOff, Search, Copy, Check } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { bucketLabel } from '@/lib/darkrisk/bucketLegend';

interface CredentialHit {
  id: string;
  selector_value: string;
  asset_scope: string;
  clear_value: string | null;
  masked_value: string;
  source_bucket: string | null;
  tag: string;
  confidence: string;
  created_at: string;
  metadata: Record<string, unknown>;
}

interface Props {
  organizationId: string;
  limit?: number;
}

export function DarkRiskCredentialLeaks({ organizationId, limit = 100 }: Props) {
  const [showPasswords, setShowPasswords] = useState(false);
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const { data: hits = [], isLoading } = useQuery({
    queryKey: ['darkrisk-credential-leaks', organizationId, limit],
    enabled: Boolean(organizationId),
    staleTime: 3 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('darkrisk_dti_sensitive_hits')
        .select('id, selector_value, asset_scope, clear_value, masked_value, source_bucket, tag, confidence, created_at, metadata')
        .eq('organization_id', organizationId)
        .eq('tag', 'passwords')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data as CredentialHit[]) ?? [];
    },
  });

  const filtered = hits.filter((h) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (h.selector_value ?? '').toLowerCase().includes(q) ||
      (h.asset_scope ?? '').toLowerCase().includes(q) ||
      (h.source_bucket ?? '').toLowerCase().includes(q)
    );
  });

  const copyRow = async (email: string, pwd: string) => {
    await navigator.clipboard.writeText(`${email}:${pwd}`);
    setCopied(email);
    setTimeout(() => setCopied(null), 2000);
    toast({ title: 'Copiato', description: `${email}:${pwd}` });
  };

  if (isLoading) {
    return (
      <Card className="bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            Credenziali Esposte
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Caricamento...</div>
        </CardContent>
      </Card>
    );
  }

  if (!hits.length) return null;

  return (
    <Card className="bg-card border-destructive/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            Credenziali Esposte
            <Badge variant="destructive" className="text-xs">{hits.length}</Badge>
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => setShowPasswords((v) => !v)}
          >
            {showPasswords ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showPasswords ? 'Nascondi' : 'Mostra'} password
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtra per email, dominio o sorgente..."
            className="pl-8 h-8 text-xs"
          />
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Email</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Password</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden sm:table-cell">Dominio</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden md:table-cell">Sorgente</th>
                <th className="px-3 py-2 w-8" />
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 50).map((hit) => {
                const pwd = hit.clear_value ?? hit.masked_value;
                const isCopied = copied === hit.selector_value;
                return (
                  <tr key={hit.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 font-mono max-w-[180px]">
                      <span className="truncate block">{hit.selector_value || hit.asset_scope || '—'}</span>
                    </td>
                    <td className="px-3 py-2 font-mono">
                      {showPasswords ? (
                        <span className="text-destructive font-medium">{pwd}</span>
                      ) : (
                        <span className="text-muted-foreground tracking-widest">{'•'.repeat(Math.min(pwd?.length ?? 8, 12))}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 hidden sm:table-cell text-muted-foreground">
                      {hit.asset_scope || '—'}
                    </td>
                    <td className="px-3 py-2 hidden md:table-cell">
                      {hit.source_bucket && (
                        <Badge variant="outline" className="text-[10px] px-1.5">
                          {bucketLabel(hit.source_bucket)}
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => copyRow(hit.selector_value || hit.asset_scope, pwd)}
                        title="Copia email:password"
                      >
                        {isCopied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length > 50 && (
            <div className="text-xs text-muted-foreground text-center py-2 border-t border-border">
              Mostrate 50 di {filtered.length} credenziali. Usa il filtro per restringere i risultati.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
