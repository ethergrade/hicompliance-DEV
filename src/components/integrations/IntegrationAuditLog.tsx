import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, isAfter, isBefore, startOfDay, endOfDay } from 'date-fns';
import { it } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { History, Plus, Pencil, Trash2, User, Download, CalendarIcon, Filter, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

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

const exportToCSV = (logs: AuditLog[], filename: string) => {
  const headers = ['Data', 'Azione', 'Servizio', 'Utente', 'Dettagli'];
  
  const rows = logs.map(log => {
    const date = format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: it });
    const action = getActionLabel(log.action);
    const service = log.service_name;
    const user = log.changed_by_email || 'Sistema';
    
    let details = '';
    if (log.action === 'updated' && log.old_values && log.new_values) {
      const changes: string[] = [];
      if (log.old_values.is_active !== log.new_values.is_active) {
        changes.push(`Stato: ${log.old_values.is_active ? 'Attivo' : 'Inattivo'} → ${log.new_values.is_active ? 'Attivo' : 'Inattivo'}`);
      }
      if (log.old_values.api_url !== log.new_values.api_url) {
        changes.push('URL API modificato');
      }
      details = changes.join('; ');
    }
    
    return [date, action, service, user, details];
  });

  const csvContent = [
    headers.join(';'),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
  ].join('\n');

  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
};

export const IntegrationAuditLog: React.FC<IntegrationAuditLogProps> = ({ organizationId }) => {
  const { toast } = useToast();
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['integration-audit-logs', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      
      const { data, error } = await supabase
        .from('integration_audit_logs')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (error) throw error;
      return data as AuditLog[];
    },
    enabled: !!organizationId,
  });

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      // Filter by action
      if (actionFilter !== 'all' && log.action !== actionFilter) {
        return false;
      }
      
      // Filter by date range
      const logDate = new Date(log.created_at);
      if (dateFrom && isBefore(logDate, startOfDay(dateFrom))) {
        return false;
      }
      if (dateTo && isAfter(logDate, endOfDay(dateTo))) {
        return false;
      }
      
      return true;
    });
  }, [logs, actionFilter, dateFrom, dateTo]);

  const hasActiveFilters = actionFilter !== 'all' || dateFrom || dateTo;

  const clearFilters = () => {
    setActionFilter('all');
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  const handleExport = () => {
    if (filteredLogs.length === 0) {
      toast({
        title: 'Nessun dato',
        description: 'Non ci sono log da esportare',
        variant: 'destructive',
      });
      return;
    }
    
    const filename = `audit_integrazioni_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.csv`;
    exportToCSV(filteredLogs, filename);
    
    toast({
      title: 'Esportazione completata',
      description: `File ${filename} scaricato (${filteredLogs.length} record)`,
    });
  };

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
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <History className="w-5 h-5 text-primary" />
              Storico Modifiche
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {filteredLogs.length} di {logs.length} modifiche
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={filteredLogs.length === 0}
            className="gap-2"
          >
            <Download className="w-4 h-4" />
            Esporta CSV
          </Button>
        </div>
        
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-border">
          <Filter className="w-4 h-4 text-muted-foreground" />
          
          {/* Action Filter */}
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue placeholder="Tipo azione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le azioni</SelectItem>
              <SelectItem value="created">Creata</SelectItem>
              <SelectItem value="updated">Modificata</SelectItem>
              <SelectItem value="deleted">Eliminata</SelectItem>
            </SelectContent>
          </Select>
          
          {/* Date From */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-8 text-xs gap-1.5",
                  !dateFrom && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="w-3.5 h-3.5" />
                {dateFrom ? format(dateFrom, "dd/MM/yyyy", { locale: it }) : "Da"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dateFrom}
                onSelect={setDateFrom}
                initialFocus
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
          
          {/* Date To */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-8 text-xs gap-1.5",
                  !dateTo && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="w-3.5 h-3.5" />
                {dateTo ? format(dateTo, "dd/MM/yyyy", { locale: it }) : "A"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dateTo}
                onSelect={setDateTo}
                initialFocus
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
          
          {/* Clear Filters */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
              Cancella filtri
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[350px] pr-3">
          {filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <History className="w-10 h-10 mb-3 opacity-50" />
              <p className="text-sm">
                {logs.length === 0 
                  ? 'Nessuna modifica registrata' 
                  : 'Nessun risultato con i filtri selezionati'}
              </p>
              {hasActiveFilters && (
                <Button
                  variant="link"
                  size="sm"
                  onClick={clearFilters}
                  className="mt-2"
                >
                  Cancella filtri
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredLogs.map((log) => (
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
