import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { History, Plus, Pencil, Trash2, User } from 'lucide-react';

interface AuditLog {
  id: string;
  integration_id: string | null;
  organization_id: string | null;
  action: 'created' | 'updated' | 'deleted';
  service_name: string;
  changed_by: string | null;
  changed_by_email: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
}

interface IntegrationAuditLogProps {
  organizationId: string | null;
}

const ActionIcon: React.FC<{ action: string }> = ({ action }) => {
  switch (action) {
    case 'created':
      return <Plus className="w-3.5 h-3.5" />;
    case 'updated':
      return <Pencil className="w-3.5 h-3.5" />;
    case 'deleted':
      return <Trash2 className="w-3.5 h-3.5" />;
    default:
      return null;
  }
};

const getActionColor = (action: string) => {
  switch (action) {
    case 'created':
      return 'bg-green-500/10 text-green-500 border-green-500/30';
    case 'updated':
      return 'bg-blue-500/10 text-blue-500 border-blue-500/30';
    case 'deleted':
      return 'bg-red-500/10 text-red-500 border-red-500/30';
    default:
      return 'bg-muted text-muted-foreground';
  }
};

const getActionLabel = (action: string) => {
  switch (action) {
    case 'created':
      return 'Creata';
    case 'updated':
      return 'Modificata';
    case 'deleted':
      return 'Eliminata';
    default:
      return action;
  }
};

export const IntegrationAuditLog: React.FC<IntegrationAuditLogProps> = ({ organizationId }) => {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['integration-audit-logs', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      
      const { data, error } = await supabase
        .from('integration_audit_logs')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data as AuditLog[];
    },
    enabled: !!organizationId,
  });

  if (isLoading) {
    return (
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            Storico Modifiche
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <History className="w-5 h-5 text-primary" />
          Storico Modifiche
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Ultime {logs.length} modifiche alle integrazioni
        </p>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-3">
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <History className="w-10 h-10 mb-3 opacity-50" />
              <p className="text-sm">Nessuna modifica registrata</p>
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="p-3 rounded-lg border border-border bg-card/50 hover:bg-card transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <Badge 
                        variant="outline" 
                        className={`shrink-0 ${getActionColor(log.action)}`}
                      >
                        <ActionIcon action={log.action} />
                        <span className="ml-1">{getActionLabel(log.action)}</span>
                      </Badge>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">
                          {log.service_name}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                          <User className="w-3 h-3" />
                          <span className="truncate">
                            {log.changed_by_email || 'Sistema'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(log.created_at), "d MMM yyyy, HH:mm", { locale: it })}
                    </span>
                  </div>
                  
                  {/* Show changes for updates */}
                  {log.action === 'updated' && log.old_values && log.new_values && (
                    <div className="mt-2 pt-2 border-t border-border/50 text-xs">
                      {log.old_values.is_active !== log.new_values.is_active && (
                        <p className="text-muted-foreground">
                          Stato: {log.old_values.is_active ? 'Attivo' : 'Inattivo'} → {log.new_values.is_active ? 'Attivo' : 'Inattivo'}
                        </p>
                      )}
                      {log.old_values.api_url !== log.new_values.api_url && (
                        <p className="text-muted-foreground truncate">
                          URL API modificato
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
