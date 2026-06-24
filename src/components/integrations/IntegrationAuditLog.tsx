import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, isAfter, isBefore, startOfDay, endOfDay } from 'date-fns';
import { it } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { History, Plus, Pencil, Trash2, User, Download, CalendarIcon, Filter, X, Save, ChevronLeft, ChevronRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { useUserRoles } from '@/hooks/useUserRoles';
import { integrationsApi, type IntegrationAuditLogResource } from '@/lib/api/integrations';

type SeverityFilter = never;

type AuditLog = IntegrationAuditLogResource;

interface IntegrationAuditLogProps {
  organizationId: string | null;
  groupId?: string | null;
}

const PAGE_SIZE_OPTIONS = [25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;

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
    const date = format(new Date(log.created_at), 'dd/MM/yyyy HH:mm', { locale: it });
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
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';')),
  ].join('\n');

  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
};

export const IntegrationAuditLog: React.FC<IntegrationAuditLogProps> = ({ organizationId, groupId }) => {
  const { toast } = useToast();
  const { isAdmin, isSales } = useUserRoles();
  const canManage = isAdmin || isSales;

  const { preferences, updatePreferences, isSaving } = useUserPreferences({
    preferenceKey: 'audit_log_filters',
    defaultPreferences: {
      auditLogActionFilter: 'all',
      auditLogDateFrom: undefined,
      auditLogDateTo: undefined,
      itemsPerPage: DEFAULT_PAGE_SIZE,
    },
    groupId,
  });

  const [actionFilter, setActionFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  useEffect(() => {
    if (preferences) {
      setActionFilter(preferences.auditLogActionFilter || 'all');
      setDateFrom(preferences.auditLogDateFrom ? new Date(preferences.auditLogDateFrom) : undefined);
      setDateTo(preferences.auditLogDateTo ? new Date(preferences.auditLogDateTo) : undefined);
      setPageSize(preferences.itemsPerPage || DEFAULT_PAGE_SIZE);
    }
  }, [preferences]);

  const { data: allLogs = [], isLoading } = useQuery({
    queryKey: ['integration-audit-logs', organizationId, groupId],
    queryFn: async () => {
      if (!organizationId) return [];
      return integrationsApi.auditLogs(organizationId, { per_page: 200 }, groupId);
    },
    enabled: !!organizationId,
  });

  const filteredLogs = useMemo(() => {
    return allLogs.filter(log => {
      if (actionFilter !== 'all' && log.action !== actionFilter) return false;
      const logDate = new Date(log.created_at);
      if (dateFrom && isBefore(logDate, startOfDay(dateFrom))) return false;
      if (dateTo && isAfter(logDate, endOfDay(dateTo))) return false;
      return true;
    });
  }, [allLogs, actionFilter, dateFrom, dateTo]);

  const totalCount = filteredLogs.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const paginatedLogs = useMemo(() => {
    const from = (currentPage - 1) * pageSize;
    return filteredLogs.slice(from, from + pageSize);
  }, [filteredLogs, currentPage, pageSize]);
  const hasActiveFilters = actionFilter !== 'all' || dateFrom || dateTo;

  const handleActionFilterChange = (value: string) => {
    setActionFilter(value);
    setCurrentPage(1);
    if (canManage) updatePreferences({ auditLogActionFilter: value });
  };

  const handleDateFromChange = (date: Date | undefined) => {
    setDateFrom(date);
    setCurrentPage(1);
    if (canManage) updatePreferences({ auditLogDateFrom: date?.toISOString() });
  };

  const handleDateToChange = (date: Date | undefined) => {
    setDateTo(date);
    setCurrentPage(1);
    if (canManage) updatePreferences({ auditLogDateTo: date?.toISOString() });
  };

  const handlePageSizeChange = (value: string) => {
    const newSize = parseInt(value, 10);
    setPageSize(newSize);
    setCurrentPage(1);
    if (canManage) updatePreferences({ itemsPerPage: newSize });
  };

  const clearFilters = () => {
    setActionFilter('all');
    setDateFrom(undefined);
    setDateTo(undefined);
    setCurrentPage(1);
    if (canManage) {
      updatePreferences({
        auditLogActionFilter: 'all',
        auditLogDateFrom: undefined,
        auditLogDateTo: undefined,
      });
    }
  };

  const handleExport = () => {
    if (filteredLogs.length === 0) {
      toast({
        title: 'Nessun dato',
        description: 'Non ci sono log da esportare con i filtri correnti',
        variant: 'destructive',
      });
      return;
    }

    const filename = `audit-log-integrazioni-${format(new Date(), 'yyyy-MM-dd-HHmm')}.csv`;
    exportToCSV(filteredLogs, filename);
    toast({ title: 'Export completato', description: `File ${filename} scaricato con successo` });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" /> Audit Log Integrazioni
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExport} disabled={filteredLogs.length === 0}>
              <Download className="h-4 w-4 mr-2" /> Export CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={actionFilter} onValueChange={handleActionFilterChange}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filtra per azione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte le azioni</SelectItem>
                  <SelectItem value="created">Creata</SelectItem>
                  <SelectItem value="updated">Modificata</SelectItem>
                  <SelectItem value="deleted">Eliminata</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn('justify-start text-left font-normal', !dateFrom && 'text-muted-foreground')}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateFrom ? format(dateFrom, 'dd/MM/yyyy') : 'Data da'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateFrom} onSelect={handleDateFromChange} />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn('justify-start text-left font-normal', !dateTo && 'text-muted-foreground')}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateTo ? format(dateTo, 'dd/MM/yyyy') : 'Data a'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateTo} onSelect={handleDateToChange} />
              </PopoverContent>
            </Popover>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4 mr-1" /> Pulisci filtri
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Righe:</span>
            <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
              <SelectTrigger className="w-[90px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map(size => (
                  <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isSaving && <Save className="h-4 w-4 text-muted-foreground animate-pulse" />}
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        ) : paginatedLogs.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            Nessun log disponibile per i filtri correnti.
          </div>
        ) : (
          <>
            <ScrollArea className="h-[420px] pr-4">
              <div className="space-y-3">
                {paginatedLogs.map((log) => (
                  <div key={log.id} className="rounded-lg border p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-2 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={getActionColor(log.action)}>
                            <ActionIcon action={log.action} />
                            <span className="ml-1">{getActionLabel(log.action)}</span>
                          </Badge>
                          <span className="font-medium">{log.service_name}</span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {format(new Date(log.created_at), 'dd/MM/yyyy HH:mm', { locale: it })}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <User className="h-4 w-4" /> {log.changed_by_email || 'Sistema'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <p className="text-sm text-muted-foreground">
                {totalCount} log totali · Pagina {currentPage} di {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
