import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useUserRoles } from '@/hooks/useUserRoles';
import {
  Users,
  Building2,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Search,
  UserPlus,
  TrendingUp,
  ListTodo,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────
type Priority = 'critical' | 'high' | 'medium' | 'low';

type RemTask = {
  id: string;
  task: string;
  category: string;
  priority: Priority;
  progress: number;
  start_date: string | null;
  end_date: string | null;
  assignee: string | null;
  source: string | null;
};

type OrgRow = {
  id: string;
  name: string;
  code: string;
  sales_owner_user_id: string | null;
};

type SalesUser = {
  id: string;
  email: string;
};

// ─── Helpers ────────────────────────────────────────────────────────────────────
const PRIORITY_COLOR: Record<Priority, string> = {
  critical: 'bg-red-600 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-yellow-500 text-black',
  low: 'bg-blue-500 text-white',
};
const PRIORITY_LABEL: Record<Priority, string> = {
  critical: 'Critica',
  high: 'Alta',
  medium: 'Media',
  low: 'Bassa',
};

function isOverdue(end_date: string | null, progress: number): boolean {
  if (!end_date || progress >= 100) return false;
  return new Date(end_date) < new Date();
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Sub-components ──────────────────────────────────────────────────────────────
function StatChip({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: number; color: string }) {
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${color}`}>
      <Icon className="w-3 h-3" />
      <span>{value}</span>
      <span className="opacity-70">{label}</span>
    </div>
  );
}

function RemediationTaskRow({ task }: { task: RemTask }) {
  const over = isOverdue(task.end_date, task.progress);
  return (
    <TableRow className={over ? 'bg-red-500/5' : ''}>
      <TableCell className="max-w-[260px]">
        <p className="text-sm font-medium truncate" title={task.task}>{task.task}</p>
        <p className="text-xs text-muted-foreground">{task.category || '—'}</p>
      </TableCell>
      <TableCell>
        <Badge className={`${PRIORITY_COLOR[task.priority] || 'bg-muted'} text-[10px]`}>
          {PRIORITY_LABEL[task.priority] || task.priority}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2 min-w-[100px]">
          <Progress value={task.progress} className="h-1.5 flex-1" />
          <span className="text-xs tabular-nums w-9 text-right">{task.progress}%</span>
        </div>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
        {fmtDate(task.start_date)} → {fmtDate(task.end_date)}
        {over && <span className="ml-1 text-red-400 font-semibold">scaduta</span>}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">{task.assignee || '—'}</TableCell>
    </TableRow>
  );
}

function ClientCard({
  org,
  tasks,
  salesUsers,
  onReassign,
}: {
  org: OrgRow;
  tasks: RemTask[];
  salesUsers: SalesUser[];
  onReassign: (orgId: string, userId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filterPriority, setFilterPriority] = useState<string>('all');

  const total = tasks.length;
  const completed = tasks.filter((t) => t.progress >= 100).length;
  const overdue = tasks.filter((t) => isOverdue(t.end_date, t.progress)).length;
  const critical = tasks.filter((t) => t.priority === 'critical').length;
  const high = tasks.filter((t) => t.priority === 'high').length;
  const avgProgress = total > 0
    ? Math.round(tasks.reduce((s, t) => s + t.progress, 0) / total)
    : 0;

  const filtered = filterPriority === 'all'
    ? tasks
    : tasks.filter((t) => t.priority === filterPriority);

  return (
    <Card className="border-border/70">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors rounded-t-lg pb-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                {open ? <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />}
                <div className="min-w-0">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-primary shrink-0" />
                    {org.name}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">{org.code}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {critical > 0 && <StatChip icon={AlertTriangle} label="critiche" value={critical} color="bg-red-500/15 text-red-300 border border-red-500/20" />}
                {high > 0 && <StatChip icon={AlertTriangle} label="alte" value={high} color="bg-orange-500/15 text-orange-300 border border-orange-500/20" />}
                {overdue > 0 && <StatChip icon={Clock} label="scadute" value={overdue} color="bg-red-500/15 text-red-400 border border-red-500/20" />}
                <StatChip icon={CheckCircle2} label={`/${total} completate`} value={completed} color="bg-green-500/10 text-green-300 border border-green-500/20" />
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs bg-muted/30 border border-border/40">
                  <TrendingUp className="w-3 h-3 text-primary" />
                  <span className="font-medium">{avgProgress}%</span>
                </div>
              </div>
            </div>

            {/* Assegna sales owner */}
            <div className="flex items-center gap-2 mt-2 ml-7" onClick={(e) => e.stopPropagation()}>
              <UserPlus className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <Select
                value={org.sales_owner_user_id || 'none'}
                onValueChange={(val) => onReassign(org.id, val === 'none' ? null : val)}
              >
                <SelectTrigger className="h-7 text-xs w-52 border-border/50">
                  <SelectValue placeholder="Assegna sales owner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Nessun sales owner —</SelectItem>
                  {salesUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0">
            {tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nessuna remediation pianificata per questo cliente.</p>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <ListTodo className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{total} task</span>
                  <Select value={filterPriority} onValueChange={setFilterPriority}>
                    <SelectTrigger className="h-7 text-xs w-36 ml-auto border-border/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tutte le priorità</SelectItem>
                      <SelectItem value="critical">Critiche</SelectItem>
                      <SelectItem value="high">Alte</SelectItem>
                      <SelectItem value="medium">Medie</SelectItem>
                      <SelectItem value="low">Basse</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="rounded-md border border-border/50 overflow-auto max-h-72">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Task</TableHead>
                        <TableHead className="text-xs">Priorità</TableHead>
                        <TableHead className="text-xs">Progresso</TableHead>
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs">Assegnato a</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((t) => (
                        <RemediationTaskRow key={t.id} task={t} />
                      ))}
                      {filtered.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-4">
                            Nessuna task con questa priorità.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────────
const AdminSalesDashboard: React.FC = () => {
  const { isSuperAdmin, isSales } = useUserRoles();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSales, setFilterSales] = useState<string>('all');

  // ── Fetch organizations with sales owner
  const { data: orgs = [], isLoading: orgsLoading } = useQuery({
    queryKey: ['admin-sales-orgs'],
    enabled: isSuperAdmin || isSales,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations' as any)
        .select('id, name, code, sales_owner_user_id')
        .order('name');
      if (error) throw error;
      return (data || []) as OrgRow[];
    },
    staleTime: 30_000,
  });

  // ── Fetch all sales users
  const { data: salesUsers = [] } = useQuery({
    queryKey: ['admin-sales-users'],
    enabled: isSuperAdmin || isSales,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles' as any)
        .select('user_id')
        .eq('role', 'sales');
      if (error) throw error;
      const ids = ((data || []) as any[]).map((r) => r.user_id).filter(Boolean);
      if (ids.length === 0) return [] as SalesUser[];
      // fetch emails via RPC or admin — fallback: use existing profile data
      const { data: profiles } = await supabase
        .from('profiles' as any)
        .select('id, email, full_name')
        .in('id', ids);
      if (profiles?.length) {
        return (profiles as any[]).map((p) => ({ id: p.id, email: p.email || p.full_name || p.id })) as SalesUser[];
      }
      // Fallback: just return ids
      return ids.map((id: string) => ({ id, email: id.slice(0, 8) + '...' })) as SalesUser[];
    },
    staleTime: 60_000,
  });

  // ── Fetch all remediation tasks (across clients)
  const { data: allTasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ['admin-sales-remediation-tasks'],
    enabled: isSuperAdmin || isSales,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('remediation_tasks' as any)
        .select('id, organization_id, task, category, priority, progress, start_date, end_date, assignee, source')
        .eq('is_deleted' as any, false)
        .order('priority')
        .limit(5000);
      if (error) throw error;
      return (data || []) as (RemTask & { organization_id: string })[];
    },
    staleTime: 30_000,
  });

  // ── Assign sales owner mutation
  const assignSalesMutation = useMutation({
    mutationFn: async ({ orgId, userId }: { orgId: string; userId: string | null }) => {
      const { error } = await supabase
        .from('organizations' as any)
        .update({ sales_owner_user_id: userId } as any)
        .eq('id', orgId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Sales owner aggiornato');
      queryClient.invalidateQueries({ queryKey: ['admin-sales-orgs'] });
    },
    onError: (err: any) => toast.error(`Errore: ${err.message}`),
  });

  // ── Build index: orgId → tasks
  const tasksByOrg = useMemo(() => {
    const map = new Map<string, RemTask[]>();
    for (const t of allTasks) {
      const arr = map.get(t.organization_id) || [];
      arr.push(t);
      map.set(t.organization_id, arr);
    }
    return map;
  }, [allTasks]);

  // ── Group orgs by sales owner
  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; orgs: OrgRow[] }>();
    const NO_OWNER = '__none__';

    for (const org of orgs) {
      const key = org.sales_owner_user_id || NO_OWNER;
      if (!map.has(key)) {
        const su = salesUsers.find((u) => u.id === key);
        map.set(key, {
          label: key === NO_OWNER ? 'Senza Sales Owner' : (su?.email || key.slice(0, 8)),
          orgs: [],
        });
      }
      map.get(key)!.orgs.push(org);
    }
    // Sort: no-owner last
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === NO_OWNER) return 1;
      if (b === NO_OWNER) return -1;
      return 0;
    });
  }, [orgs, salesUsers]);

  // ── Filter
  const query = searchQuery.toLowerCase().trim();
  const visibleGroups = grouped
    .filter(([key]) => filterSales === 'all' || key === filterSales)
    .map(([key, group]) => ({
      key,
      label: group.label,
      orgs: group.orgs.filter((o) =>
        !query || o.name.toLowerCase().includes(query) || o.code.toLowerCase().includes(query)
      ),
    }))
    .filter((g) => g.orgs.length > 0);

  // ── Global stats
  const totalOrgs = orgs.length;
  const totalTasks = allTasks.length;
  const totalCompleted = allTasks.filter((t) => t.progress >= 100).length;
  const totalOverdue = allTasks.filter((t) => isOverdue(t.end_date, t.progress)).length;
  const totalCritical = allTasks.filter((t) => t.priority === 'critical').length;

  if (!isSuperAdmin && !isSales) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Accesso non consentito.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            Dashboard Sales — Remediation Clienti
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Panoramica delle remediation pianificate per cliente, organizzata per sales owner.
          </p>
        </div>

        {/* KPI globali */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Clienti totali', value: totalOrgs, color: 'text-foreground' },
            { label: 'Task totali', value: totalTasks, color: 'text-foreground' },
            { label: 'Completate', value: totalCompleted, color: 'text-green-400' },
            { label: 'Scadute', value: totalOverdue, color: 'text-red-400' },
            { label: 'Critiche aperte', value: totalCritical, color: 'text-red-400' },
          ].map((stat) => (
            <Card key={stat.label} className="border-border/60">
              <CardContent className="pt-4 pb-3 text-center">
                <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filtri */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Cerca cliente..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          <Select value={filterSales} onValueChange={setFilterSales}>
            <SelectTrigger className="h-9 w-52">
              <SelectValue placeholder="Filtra per sales" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti i sales owner</SelectItem>
              <SelectItem value="__none__">Senza sales owner</SelectItem>
              {salesUsers.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.email}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant="secondary">{visibleGroups.reduce((s, g) => s + g.orgs.length, 0)} clienti visibili</Badge>
        </div>

        {/* Contenuto */}
        {(orgsLoading || tasksLoading) && (
          <p className="text-sm text-muted-foreground">Caricamento dati...</p>
        )}

        {!orgsLoading && !tasksLoading && visibleGroups.length === 0 && (
          <Card className="border-border/60">
            <CardContent className="py-12 text-center text-muted-foreground">
              Nessun cliente trovato con i filtri selezionati.
            </CardContent>
          </Card>
        )}

        {visibleGroups.map(({ key, label, orgs: groupOrgs }) => (
          <div key={key} className="space-y-3">
            {/* Header gruppo */}
            <div className="flex items-center gap-3">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold border ${
                key === '__none__'
                  ? 'border-muted text-muted-foreground bg-muted/20'
                  : 'border-primary/30 text-primary bg-primary/10'
              }`}>
                <Users className="w-4 h-4" />
                {label}
              </div>
              <Badge variant="outline">{groupOrgs.length} client{groupOrgs.length === 1 ? 'e' : 'i'}</Badge>
              {(() => {
                const groupTasks = groupOrgs.flatMap((o) => tasksByOrg.get(o.id) || []);
                const gcrit = groupTasks.filter((t) => t.priority === 'critical').length;
                const gover = groupTasks.filter((t) => isOverdue(t.end_date, t.progress)).length;
                return (
                  <>
                    {gcrit > 0 && <Badge className="bg-red-600 text-white text-[10px]">{gcrit} critiche</Badge>}
                    {gover > 0 && <Badge className="bg-red-500/20 text-red-300 border border-red-500/30 text-[10px]">{gover} scadute</Badge>}
                  </>
                );
              })()}
              <div className="flex-1 border-t border-border/40" />
            </div>

            {/* Clienti del gruppo */}
            {groupOrgs.map((org) => (
              <ClientCard
                key={org.id}
                org={org}
                tasks={tasksByOrg.get(org.id) || []}
                salesUsers={salesUsers}
                onReassign={(orgId, userId) => assignSalesMutation.mutate({ orgId, userId })}
              />
            ))}
          </div>
        ))}
      </div>
    </DashboardLayout>
  );
};

export default AdminSalesDashboard;
