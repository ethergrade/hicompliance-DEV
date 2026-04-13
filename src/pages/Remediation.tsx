import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { GanttChart, GanttTask } from '@/components/remediation/GanttChart';
import { format, addDays, differenceInDays, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { 
  AlertTriangle, Calendar, CheckCircle, Clock, FileText, TrendingUp, Users, Target,
  Wrench, BarChart3, CalendarDays, Plus, Calculator, Euro, Trash2, Settings
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useUserPreferences } from '@/hooks/useUserPreferences';

/* ─── Types ─── */
interface DbTask {
  id: string;
  task: string;
  category: string;
  start_date: string;
  end_date: string;
  progress: number;
  assignee: string | null;
  priority: string;
  color: string;
  budget: number | null;
  display_order: number | null;
  is_hidden: boolean | null;
  is_deleted: boolean | null;
  dependencies: string[] | null;
  organization_id: string | null;
}

/* ─── Demo seed data ─── */
const DEMO_TASKS = [
  { task: 'Implementazione IAM centralizzato', category: 'Gestione delle identità', start_date: '2026-01-15', end_date: '2026-03-01', progress: 65, assignee: 'IT Security Team', priority: 'critical', color: '#DC2626', budget: 16500 },
  { task: 'Audit accessi privilegiati', category: 'Gestione delle identità', start_date: '2026-01-20', end_date: '2026-02-15', progress: 100, assignee: 'Security Auditor', priority: 'critical', color: '#DC2626', budget: 8000 },
  { task: 'Implementazione SAST/DAST', category: 'Sviluppo software', start_date: '2026-02-01', end_date: '2026-04-01', progress: 40, assignee: 'DevSecOps Team', priority: 'high', color: '#EA580C', budget: 18000 },
  { task: 'Training sviluppatori Secure Coding', category: 'Sviluppo software', start_date: '2026-01-25', end_date: '2026-02-25', progress: 100, assignee: 'HR & Security', priority: 'high', color: '#EA580C', budget: 7500 },
  { task: 'Assessment fornitori critici', category: 'Gestione fornitori', start_date: '2026-02-15', end_date: '2026-03-15', progress: 80, assignee: 'Procurement Team', priority: 'medium', color: '#EAB308', budget: 4500 },
  { task: 'Implementazione procedure backup', category: 'Business Continuity', start_date: '2026-03-01', end_date: '2026-04-15', progress: 25, assignee: 'Operations Team', priority: 'high', color: '#EA580C', budget: 6000 },
  { task: 'Implementazione Incident Response Plan', category: 'Incident Management', start_date: '2026-02-10', end_date: '2026-03-20', progress: 50, assignee: 'IT Security Team', priority: 'high', color: '#EA580C', budget: 8000 },
  { task: 'Deployment MFA aziendale', category: 'Gestione delle identità', start_date: '2026-03-15', end_date: '2026-05-01', progress: 10, assignee: 'IT Security Team', priority: 'critical', color: '#DC2626', budget: 12000 },
  { task: 'Penetration Test infrastruttura', category: 'Network Security', start_date: '2026-04-01', end_date: '2026-05-15', progress: 0, assignee: 'Security Auditor', priority: 'high', color: '#EA580C', budget: 15000 },
  { task: 'Revisione policy crittografia', category: 'Crittografia', start_date: '2026-04-15', end_date: '2026-06-01', progress: 0, assignee: 'Compliance Team', priority: 'medium', color: '#EAB308', budget: 5000 },
  { task: 'Implementazione SIEM / SOC', category: 'Network Security', start_date: '2026-05-01', end_date: '2026-08-01', progress: 0, assignee: 'IT Security Team', priority: 'critical', color: '#DC2626', budget: 45000 },
  { task: 'Hardening server e endpoint', category: 'Manutenzione', start_date: '2026-05-15', end_date: '2026-07-15', progress: 0, assignee: 'Operations Team', priority: 'high', color: '#EA580C', budget: 9000 },
  { task: 'Awareness training dipendenti Q3', category: 'HR & Formazione', start_date: '2026-07-01', end_date: '2026-08-15', progress: 0, assignee: 'HR & Training', priority: 'medium', color: '#EAB308', budget: 6500 },
  { task: 'Disaster Recovery test annuale', category: 'Business Continuity', start_date: '2026-09-01', end_date: '2026-10-15', progress: 0, assignee: 'Operations Team', priority: 'high', color: '#EA580C', budget: 8000 },
  { task: 'Certificazione ISO 27001 — audit fase 1', category: 'Certificazioni', start_date: '2026-09-15', end_date: '2026-11-30', progress: 0, assignee: 'Compliance Team', priority: 'critical', color: '#DC2626', budget: 25000 },
  { task: 'Revisione contratti fornitori IT', category: 'Gestione fornitori', start_date: '2026-06-01', end_date: '2026-07-15', progress: 0, assignee: 'Procurement Team', priority: 'low', color: '#22C55E', budget: 3000 },
  { task: 'Tabletop exercise — simulazione incidente', category: 'Incident Management', start_date: '2026-10-01', end_date: '2026-11-01', progress: 0, assignee: 'IT Security Team', priority: 'high', color: '#EA580C', budget: 4000 },
  { task: 'NIS2 gap remediation finale', category: 'Governance', start_date: '2026-11-01', end_date: '2026-12-15', progress: 0, assignee: 'Compliance Team', priority: 'critical', color: '#DC2626', budget: 20000 },
];

const PRIORITY_DB_TO_IT: Record<string, string> = {
  critical: 'Critica', high: 'Alta', medium: 'Media', low: 'Bassa',
};
const PRIORITY_IT_TO_DB: Record<string, string> = {
  Critica: 'critical', Alta: 'high', Media: 'medium', Bassa: 'low',
  critica: 'critical', alta: 'high', media: 'medium', bassa: 'low',
};

const GANTT_START = new Date('2026-01-01');
const GANTT_END = new Date('2026-12-31');

/* ─── Component ─── */
const Remediation: React.FC = () => {
  const { organizationId: orgId } = useClientOrganization();

  const defaultPrefs = useMemo(() => ({ selectedTimeframe: '90days', defaultView: 'gantt' }), []);
  const { preferences, updatePreferences } = useUserPreferences({
    preferenceKey: 'remediation_filters',
    defaultPreferences: defaultPrefs,
  });

  const [selectedTimeframe, setSelectedTimeframeState] = useState('90days');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [tasks, setTasks] = useState<DbTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [editTaskData, setEditTaskData] = useState<any>(null);
  const [newRemediation, setNewRemediation] = useState({
    category: '', priority: '', description: '', estimatedDays: '',
    estimatedBudget: '', assignedTeam: '', complexity: 'medium', startDate: ''
  });

  useEffect(() => {
    if (preferences.selectedTimeframe) setSelectedTimeframeState(preferences.selectedTimeframe as string);
  }, [preferences.selectedTimeframe]);

  const setSelectedTimeframe = (value: string) => {
    setSelectedTimeframeState(value);
    updatePreferences({ selectedTimeframe: value });
  };

  /* ─── Get org ID helper ─── */
  const getOrgId = useCallback(async (): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from('users').select('organization_id').eq('auth_user_id', user.id).single();
    return data?.organization_id || null;
  }, []);

  /* ─── Load tasks from DB ─── */
  const loadTasks = useCallback(async () => {
    const orgId = await getOrgId();
    if (!orgId) { setLoading(false); return; }

    const { data, error } = await supabase
      .from('remediation_tasks')
      .select('*')
      .eq('organization_id', orgId)
      .order('display_order', { ascending: true });

    if (error) {
      console.error('Error loading tasks:', error);
      setLoading(false);
      return;
    }

    // Check if we need to seed: no tasks, or all tasks have dates before 2026 (old mock data)
    const needsSeed = !data || data.length === 0 || data.every(t => t.start_date < '2026-01-01');

    if (needsSeed) {
      // Delete old tasks if any
      if (data && data.length > 0) {
        await supabase.from('remediation_tasks').delete().eq('organization_id', orgId);
      }
      // Seed demo tasks
      const seedRows = DEMO_TASKS.map((t, i) => ({
        ...t,
        organization_id: orgId,
        display_order: i,
        is_hidden: false,
        is_deleted: false,
        dependencies: [],
      }));

      const { data: inserted, error: insertError } = await supabase
        .from('remediation_tasks')
        .insert(seedRows)
        .select();

      if (insertError) {
        console.error('Error seeding tasks:', insertError);
        toast({ title: 'Errore', description: 'Impossibile creare i task demo.', variant: 'destructive' });
      } else {
        setTasks(inserted || []);
      }
    } else {
      setTasks(data);
    }
    setLoading(false);
  }, [getOrgId]);

  useEffect(() => {
    loadTasks();

    const channel = supabase
      .channel('remediation-tasks-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'remediation_tasks' }, () => {
        loadTasks();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadTasks]);

  /* ─── Derived data ─── */
  const activeTasks = tasks.filter(t => !t.is_deleted);
  const deletedTasksList = tasks.filter(t => t.is_deleted);

  const ganttData: GanttTask[] = activeTasks.map(t => {
    const totalDays = differenceInDays(GANTT_END, GANTT_START);
    const daysFromStart = differenceInDays(parseISO(t.start_date), GANTT_START);
    const duration = differenceInDays(parseISO(t.end_date), parseISO(t.start_date));
    return {
      id: t.id,
      task: t.task,
      category: t.category,
      startDate: t.start_date,
      endDate: t.end_date,
      progress: t.progress,
      priority: PRIORITY_DB_TO_IT[t.priority] || 'Media',
      color: t.color,
      assignee: t.assignee || '',
      isHidden: t.is_hidden || false,
      budget: t.budget || 0,
      startOffset: (daysFromStart / totalDays) * 100,
      width: (duration / totalDays) * 100,
      duration,
    };
  });

  const totalBudget = ganttData.reduce((sum, t) => sum + (t.budget || 0), 0);

  /* ─── DB mutation helpers ─── */
  const updateTask = useCallback(async (taskId: string, updates: Record<string, any>) => {
    const orgId = await getOrgId();
    if (!orgId) return;
    const { error } = await supabase
      .from('remediation_tasks')
      .update(updates)
      .eq('id', taskId)
      .eq('organization_id', orgId);
    if (error) {
      console.error('Error updating task:', error);
      toast({ title: 'Errore', description: 'Impossibile salvare le modifiche.', variant: 'destructive' });
      throw error;
    }
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates } : t));
  }, [getOrgId]);

  /* ─── Handlers ─── */
  const handleDateChange = useCallback(async (taskId: string, startDate: string, endDate: string) => {
    await updateTask(taskId, { start_date: startDate, end_date: endDate });
    toast({ title: 'Date aggiornate', description: 'Le date sono state salvate.' });
  }, [updateTask]);

  const handleDeleteTask = useCallback(async (taskId: string) => {
    await updateTask(taskId, { is_deleted: true });
    toast({ title: 'Task eliminato', description: 'Il task è stato eliminato.' });
  }, [updateTask]);

  const handleRestoreTask = useCallback(async (taskId: string) => {
    await updateTask(taskId, { is_deleted: false });
    toast({ title: 'Task ripristinato', description: 'Il task è stato ripristinato.' });
  }, [updateTask]);

  const handleToggleVisibility = useCallback(async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    await updateTask(taskId, { is_hidden: !task.is_hidden });
  }, [tasks, updateTask]);

  const handleEditTask = useCallback((action: GanttTask) => {
    setEditingTask(action.id);
    setEditTaskData({
      task: action.task,
      category: action.category,
      assignee: action.assignee,
      priority: action.priority,
      progress: action.progress,
      budget: action.budget || 0,
      startDate: action.startDate,
      endDate: action.endDate,
    });
  }, []);

  const handleSaveEditedTask = useCallback(async () => {
    if (!editingTask || !editTaskData) return;
    try {
      await updateTask(editingTask, {
        task: editTaskData.task,
        category: editTaskData.category,
        assignee: editTaskData.assignee,
        priority: PRIORITY_IT_TO_DB[editTaskData.priority] || 'medium',
        progress: editTaskData.progress,
        budget: Number(editTaskData.budget) || 0,
        start_date: editTaskData.startDate,
        end_date: editTaskData.endDate,
      });
      toast({ title: 'Task aggiornato', description: 'Le modifiche sono state salvate.' });
      setEditingTask(null);
      setEditTaskData(null);
    } catch {
      // error already toasted in updateTask
    }
  }, [editingTask, editTaskData, updateTask]);

  const handleReorderTasks = useCallback(async (taskId: string, newIndex: number) => {
    const currentOrder = activeTasks.map(t => t.id);
    const currentIndex = currentOrder.indexOf(taskId);
    if (currentIndex === -1) return;
    currentOrder.splice(currentIndex, 1);
    currentOrder.splice(newIndex, 0, taskId);

    // Optimistic reorder
    setTasks(prev => {
      const taskMap = new Map(prev.map(t => [t.id, t]));
      const reordered = currentOrder.map((id, idx) => {
        const t = taskMap.get(id)!;
        return { ...t, display_order: idx };
      });
      const deleted = prev.filter(t => t.is_deleted);
      return [...reordered, ...deleted];
    });

    const orgId = await getOrgId();
    if (!orgId) return;
    for (let i = 0; i < currentOrder.length; i++) {
      await supabase.from('remediation_tasks').update({ display_order: i }).eq('id', currentOrder[i]).eq('organization_id', orgId);
    }
  }, [activeTasks, getOrgId]);

  /* ─── Create new task ─── */
  const calculateBudget = (days: number, complexity: string) => {
    const rates: Record<string, number> = { low: 300, medium: 500, high: 800 };
    return Math.round(days * (rates[complexity] || 500));
  };
  const calculateDays = (complexity: string, categoryType: string) => {
    const estimates: Record<string, Record<string, number>> = {
      identity_management: { low: 15, medium: 30, high: 45 },
      software_development: { low: 20, medium: 40, high: 60 },
      supplier_management: { low: 10, medium: 20, high: 30 },
      maintenance: { low: 12, medium: 25, high: 35 },
      governance: { low: 8, medium: 15, high: 25 },
    };
    return estimates[categoryType]?.[complexity] || 20;
  };

  const handleCreateRemediation = async () => {
    const orgId = await getOrgId();
    if (!orgId) {
      toast({ title: 'Errore', description: 'Devi essere autenticato.', variant: 'destructive' });
      return;
    }

    const estimatedDays = Number(newRemediation.estimatedDays) || calculateDays(newRemediation.complexity, newRemediation.category);
    const estimatedBudget = Number(newRemediation.estimatedBudget) || calculateBudget(estimatedDays, newRemediation.complexity);
    const startDate = newRemediation.startDate || format(new Date(), 'yyyy-MM-dd');
    const endDate = format(addDays(new Date(startDate), estimatedDays), 'yyyy-MM-dd');

    const priorityColors: Record<string, string> = { critica: '#DC2626', alta: '#EA580C', media: '#EAB308', bassa: '#22C55E' };

    const newTask = {
      organization_id: orgId,
      task: newRemediation.description,
      category: newRemediation.category,
      start_date: startDate,
      end_date: endDate,
      progress: 0,
      assignee: newRemediation.assignedTeam,
      priority: PRIORITY_IT_TO_DB[newRemediation.priority] || 'medium',
      color: priorityColors[newRemediation.priority] || '#3b82f6',
      display_order: activeTasks.length,
      is_hidden: false,
      is_deleted: false,
      dependencies: [],
      budget: estimatedBudget,
    };

    const { error } = await supabase.from('remediation_tasks').insert(newTask).select();
    if (error) {
      toast({ title: 'Errore', description: 'Impossibile creare la remediation.', variant: 'destructive' });
      return;
    }

    toast({ title: 'Remediation creata', description: 'Il task è stato salvato nel database.' });
    setNewRemediation({ category: '', priority: '', description: '', estimatedDays: '', estimatedBudget: '', assignedTeam: '', complexity: 'medium', startDate: '' });
    setIsCreateModalOpen(false);
    await loadTasks();
  };

  /* ─── Static data ─── */
  const criticalCategories = [
    { name: 'Gestione delle identità Gestione degli accessi', riskLevel: 'Alto', priority: 'Critica', completed: 5, total: 28, status: 'not_started', estimatedDays: 45, assignedTeam: 'IT Security', budget: '€16,500' },
    { name: 'Sviluppo software', riskLevel: 'Alto', priority: 'Alta', completed: 1, total: 23, status: 'planned_in_progress', estimatedDays: 60, assignedTeam: 'Development', budget: '€18,000' },
    { name: 'Gestione fornitori e acquisti', riskLevel: 'Medio', priority: 'Media', completed: 1, total: 19, status: 'planned_in_progress', estimatedDays: 30, assignedTeam: 'Procurement', budget: '€4,500' },
    { name: 'Manutenzione e miglioramento continuo', riskLevel: 'Medio', priority: 'Media', completed: 1, total: 17, status: 'planned_in_progress', estimatedDays: 35, assignedTeam: 'Operations', budget: '€4,500' },
  ];

  const getRiskColor = (level: string) => {
    switch (level) { case 'Alto': return 'text-red-500'; case 'Medio': return 'text-yellow-500'; case 'Basso': return 'text-green-500'; default: return 'text-gray-500'; }
  };
  const getPriorityColor = (priority: string) => {
    switch (priority) { case 'Critica': return 'destructive'; case 'Alta': return 'default'; case 'Media': return 'secondary'; default: return 'outline'; }
  };

  const actionableMetrics = {
    totalBudget: `€${totalBudget.toLocaleString('it-IT')}`,
    estimatedCompletion: '120 giorni',
    riskReduction: '65%',
    complianceImprovement: '60%',
    criticalIssues: 4,
    highPriorityActions: 7,
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Piano di Remediation</h1>
            <p className="text-muted-foreground">Azioni prioritarie per mitigare i rischi critici identificati nell'assessment</p>
          </div>
          <div className="flex space-x-2">
            <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
              <DialogTrigger asChild>
                <Button className="bg-green-600 hover:bg-green-700 text-white">
                  <Plus className="w-4 h-4 mr-2" />
                  Crea Remediation
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center">
                    <Calculator className="w-5 h-5 mr-2" />
                    Crea Nuova Remediation
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-6 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Categoria Assessment</Label>
                      <Select value={newRemediation.category} onValueChange={(v) => setNewRemediation(p => ({ ...p, category: v }))}>
                        <SelectTrigger><SelectValue placeholder="Seleziona categoria" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="identity_management">Gestione delle identità</SelectItem>
                          <SelectItem value="software_development">Sviluppo software</SelectItem>
                          <SelectItem value="supplier_management">Gestione fornitori</SelectItem>
                          <SelectItem value="maintenance">Manutenzione continua</SelectItem>
                          <SelectItem value="governance">Governance</SelectItem>
                          <SelectItem value="encryption">Crittografia</SelectItem>
                          <SelectItem value="incident_management">Gestione incidenti</SelectItem>
                          <SelectItem value="risk_management">Gestione del rischio</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Priorità</Label>
                      <Select value={newRemediation.priority} onValueChange={(v) => setNewRemediation(p => ({ ...p, priority: v }))}>
                        <SelectTrigger><SelectValue placeholder="Seleziona priorità" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="critica">Critica</SelectItem>
                          <SelectItem value="alta">Alta</SelectItem>
                          <SelectItem value="media">Media</SelectItem>
                          <SelectItem value="bassa">Bassa</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Descrizione Remediation</Label>
                    <Textarea value={newRemediation.description} onChange={(e) => setNewRemediation(p => ({ ...p, description: e.target.value }))} placeholder="Descrivi le azioni..." rows={3} />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Complessità</Label>
                      <Select value={newRemediation.complexity} onValueChange={(v) => setNewRemediation(p => ({ ...p, complexity: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Bassa (€300/gg)</SelectItem>
                          <SelectItem value="medium">Media (€500/gg)</SelectItem>
                          <SelectItem value="high">Alta (€800/gg)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Giorni Stimati</Label>
                      <Input type="number" value={newRemediation.estimatedDays} onChange={(e) => setNewRemediation(p => ({ ...p, estimatedDays: e.target.value }))} placeholder={`Auto: ${calculateDays(newRemediation.complexity, newRemediation.category)}`} />
                    </div>
                    <div className="space-y-2">
                      <Label>Budget Stimato (€)</Label>
                      <Input type="number" value={newRemediation.estimatedBudget} onChange={(e) => setNewRemediation(p => ({ ...p, estimatedBudget: e.target.value }))} placeholder={`Auto: €${calculateBudget(Number(newRemediation.estimatedDays) || calculateDays(newRemediation.complexity, newRemediation.category), newRemediation.complexity).toLocaleString()}`} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Team Assegnato</Label>
                    <Select value={newRemediation.assignedTeam} onValueChange={(v) => setNewRemediation(p => ({ ...p, assignedTeam: v }))}>
                      <SelectTrigger><SelectValue placeholder="Seleziona team" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="IT Security">IT Security Team</SelectItem>
                        <SelectItem value="Development">Development Team</SelectItem>
                        <SelectItem value="DevSecOps">DevSecOps Team</SelectItem>
                        <SelectItem value="Procurement">Procurement Team</SelectItem>
                        <SelectItem value="Operations">Operations Team</SelectItem>
                        <SelectItem value="Compliance">Compliance Team</SelectItem>
                        <SelectItem value="HR">HR & Training</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Data Inizio</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !newRemediation.startDate && "text-muted-foreground")}>
                          <Calendar className="mr-2 h-4 w-4" />
                          {newRemediation.startDate ? format(new Date(newRemediation.startDate), "PPP") : "Seleziona data (default: oggi)"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent mode="single" selected={newRemediation.startDate ? new Date(newRemediation.startDate) : undefined} onSelect={(date) => setNewRemediation(p => ({ ...p, startDate: date ? format(date, "yyyy-MM-dd") : "" }))} initialFocus />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <Card className="bg-muted/50">
                    <CardContent className="p-4">
                      <h4 className="font-medium mb-3 flex items-center"><Euro className="w-4 h-4 mr-2" />Stima Automatica</h4>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div><span className="text-muted-foreground">Giorni:</span><p className="font-medium">{newRemediation.estimatedDays || calculateDays(newRemediation.complexity, newRemediation.category)} giorni</p></div>
                        <div><span className="text-muted-foreground">Budget:</span><p className="font-medium">€{(Number(newRemediation.estimatedBudget) || calculateBudget(Number(newRemediation.estimatedDays) || calculateDays(newRemediation.complexity, newRemediation.category), newRemediation.complexity)).toLocaleString()}</p></div>
                        <div><span className="text-muted-foreground">Tariffa/gg:</span><p className="font-medium">€{newRemediation.complexity === 'low' ? '300' : newRemediation.complexity === 'high' ? '800' : '500'}</p></div>
                      </div>
                    </CardContent>
                  </Card>
                  <div className="flex justify-end space-x-2">
                    <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>Annulla</Button>
                    <Button onClick={handleCreateRemediation} className="bg-green-600 hover:bg-green-700">Crea Remediation</Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {/* Edit Task Dialog */}
            <Dialog open={editingTask !== null} onOpenChange={(open) => { if (!open) { setEditingTask(null); setEditTaskData(null); } }}>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center"><Settings className="w-5 h-5 mr-2" />Modifica Attività</DialogTitle>
                </DialogHeader>
                {editTaskData && (
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Descrizione Attività</Label>
                      <Textarea value={editTaskData.task} onChange={(e) => setEditTaskData((p: any) => ({ ...p, task: e.target.value }))} rows={3} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Categoria</Label>
                        <Select value={editTaskData.category} onValueChange={(v) => setEditTaskData((p: any) => ({ ...p, category: v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Gestione delle identità">Gestione delle identità</SelectItem>
                            <SelectItem value="Sviluppo software">Sviluppo software</SelectItem>
                            <SelectItem value="Gestione fornitori">Gestione fornitori</SelectItem>
                            <SelectItem value="Business Continuity">Business Continuity</SelectItem>
                            <SelectItem value="Incident Management">Incident Management</SelectItem>
                            <SelectItem value="Network Security">Network Security</SelectItem>
                            <SelectItem value="Crittografia">Crittografia</SelectItem>
                            <SelectItem value="Manutenzione">Manutenzione</SelectItem>
                            <SelectItem value="HR & Formazione">HR & Formazione</SelectItem>
                            <SelectItem value="Certificazioni">Certificazioni</SelectItem>
                            <SelectItem value="Governance">Governance</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Priorità</Label>
                        <Select value={editTaskData.priority} onValueChange={(v) => setEditTaskData((p: any) => ({ ...p, priority: v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Critica">Critica</SelectItem>
                            <SelectItem value="Alta">Alta</SelectItem>
                            <SelectItem value="Media">Media</SelectItem>
                            <SelectItem value="Bassa">Bassa</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Team Assegnato</Label>
                        <Select value={editTaskData.assignee} onValueChange={(v) => setEditTaskData((p: any) => ({ ...p, assignee: v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="IT Security Team">IT Security Team</SelectItem>
                            <SelectItem value="Security Auditor">Security Auditor</SelectItem>
                            <SelectItem value="DevSecOps Team">DevSecOps Team</SelectItem>
                            <SelectItem value="HR & Security">HR & Security</SelectItem>
                            <SelectItem value="Procurement Team">Procurement Team</SelectItem>
                            <SelectItem value="Operations Team">Operations Team</SelectItem>
                            <SelectItem value="Compliance Team">Compliance Team</SelectItem>
                            <SelectItem value="HR & Training">HR & Training</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Progresso (%)</Label>
                        <Input type="number" min="0" max="100" value={editTaskData.progress} onChange={(e) => setEditTaskData((p: any) => ({ ...p, progress: Number(e.target.value) }))} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Budget Allocato (€)</Label>
                      <Input type="number" min="0" step="100" value={editTaskData.budget || 0} onChange={(e) => setEditTaskData((p: any) => ({ ...p, budget: Number(e.target.value) }))} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Data Inizio</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !editTaskData.startDate && "text-muted-foreground")}>
                              <Calendar className="mr-2 h-4 w-4" />
                              {editTaskData.startDate ? format(new Date(editTaskData.startDate), "PPP") : "Seleziona data"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <CalendarComponent mode="single" selected={editTaskData.startDate ? new Date(editTaskData.startDate) : undefined} onSelect={(date) => setEditTaskData((p: any) => ({ ...p, startDate: date ? format(date, "yyyy-MM-dd") : "" }))} initialFocus />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="space-y-2">
                        <Label>Data Fine</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !editTaskData.endDate && "text-muted-foreground")}>
                              <Calendar className="mr-2 h-4 w-4" />
                              {editTaskData.endDate ? format(new Date(editTaskData.endDate), "PPP") : "Seleziona data"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <CalendarComponent mode="single" selected={editTaskData.endDate ? new Date(editTaskData.endDate) : undefined} onSelect={(date) => setEditTaskData((p: any) => ({ ...p, endDate: date ? format(date, "yyyy-MM-dd") : "" }))} initialFocus />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                    <div className="flex justify-end space-x-2 pt-4">
                      <Button variant="outline" onClick={() => { setEditingTask(null); setEditTaskData(null); }}>Annulla</Button>
                      <Button onClick={handleSaveEditedTask} className="bg-primary">Salva Modifiche</Button>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>

            <Button variant="outline"><FileText className="w-4 h-4 mr-2" />Esporta Piano</Button>
            <Button className="bg-primary text-primary-foreground"><CalendarDays className="w-4 h-4 mr-2" />Pianifica Revisione</Button>
          </div>
        </div>

        {/* Executive Summary Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <Card className="border-border"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Budget Totale</p><p className="text-xl font-bold text-foreground">{actionableMetrics.totalBudget}</p></div><Target className="w-6 h-6 text-primary" /></div></CardContent></Card>
          <Card className="border-border"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Tempo Stimato</p><p className="text-xl font-bold text-foreground">{actionableMetrics.estimatedCompletion}</p></div><Clock className="w-6 h-6 text-yellow-500" /></div></CardContent></Card>
          <Card className="border-border"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Riduzione Rischio</p><p className="text-xl font-bold text-green-500">{actionableMetrics.riskReduction}</p></div><TrendingUp className="w-6 h-6 text-green-500" /></div></CardContent></Card>
          <Card className="border-border"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Miglioramento Compliance</p><p className="text-xl font-bold text-blue-500">{actionableMetrics.complianceImprovement}</p></div><CheckCircle className="w-6 h-6 text-blue-500" /></div></CardContent></Card>
          <Card className="border-border"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Criticità</p><p className="text-xl font-bold text-red-500">{actionableMetrics.criticalIssues}</p></div><AlertTriangle className="w-6 h-6 text-red-500" /></div></CardContent></Card>
          <Card className="border-border"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Azioni Prioritarie</p><p className="text-xl font-bold text-orange-500">{actionableMetrics.highPriorityActions}</p></div><Wrench className="w-6 h-6 text-orange-500" /></div></CardContent></Card>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Panoramica Remediation</TabsTrigger>
            <TabsTrigger value="gantt">GANTT Operativo</TabsTrigger>
            <TabsTrigger value="deleted" className="relative">
              Azioni Eliminate
              {deletedTasksList.length > 0 && (
                <Badge variant="destructive" className="ml-2 h-5 px-1.5 text-xs">{deletedTasksList.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="metrics">Metriche & KPI</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="flex items-center"><AlertTriangle className="w-5 h-5 mr-2 text-red-500" />Aree che Richiedono Remediation Immediata</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {criticalCategories.map((category, index) => (
                    <div key={index} className="flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors">
                      <div className="flex items-center space-x-4">
                        <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/20"><AlertTriangle className="w-5 h-5 text-red-500" /></div>
                        <div className="flex-1">
                          <h4 className="font-medium">{category.name}</h4>
                          <p className="text-sm text-muted-foreground">Completamento: {category.completed}/{category.total} ({Math.round((category.completed/category.total)*100)}%)</p>
                          <div className="mt-2"><Progress value={(category.completed/category.total)*100} className="h-1.5 w-64" /></div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4 text-right">
                        <div>
                          <div className={`text-sm font-medium ${getRiskColor(category.riskLevel)}`}>Rischio: {category.riskLevel}</div>
                          <div className="text-xs text-muted-foreground">Team: {category.assignedTeam}</div>
                          <div className="text-xs text-muted-foreground">Budget: {category.budget}</div>
                          <div className="text-xs text-muted-foreground">Stima: {category.estimatedDays} giorni</div>
                        </div>
                        <Badge variant={getPriorityColor(category.priority) as any}>{category.priority}</Badge>
                        <Button variant="outline" size="sm"><Wrench className="w-4 h-4 mr-1" />Pianifica</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="gantt" className="space-y-6">
            {loading ? (
              <Card><CardContent className="p-12 text-center"><p className="text-muted-foreground">Caricamento task...</p></CardContent></Card>
            ) : (
              <GanttChart
                tasks={ganttData}
                ganttStartDate={GANTT_START}
                ganttEndDate={GANTT_END}
                onDateChange={handleDateChange}
                onEditTask={handleEditTask}
                onToggleVisibility={handleToggleVisibility}
                onDeleteTask={handleDeleteTask}
                onReorderTasks={handleReorderTasks}
              />
            )}
          </TabsContent>

          <TabsContent value="deleted" className="space-y-6">
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="flex items-center"><Trash2 className="w-5 h-5 mr-2 text-destructive" />Azioni Eliminate - Storico Remediation</CardTitle>
              </CardHeader>
              <CardContent>
                {deletedTasksList.length === 0 ? (
                  <div className="text-center py-12">
                    <Trash2 className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
                    <p className="text-muted-foreground">Nessuna azione eliminata</p>
                    <p className="text-sm text-muted-foreground/70 mt-2">Le azioni eliminate appariranno qui e potranno essere ripristinate</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {deletedTasksList.map(t => (
                      <div key={t.id} className="flex items-center justify-between p-4 bg-destructive/5 rounded-lg border border-destructive/20 hover:bg-destructive/10 transition-colors">
                        <div className="flex items-center space-x-4 flex-1">
                          <div className="p-2 rounded-lg bg-destructive/10"><Trash2 className="w-5 h-5 text-destructive" /></div>
                          <div className="flex-1">
                            <h4 className="font-medium text-foreground line-through">{t.task}</h4>
                            <div className="flex items-center space-x-3 mt-1">
                              <span className="text-sm text-muted-foreground">Categoria: {t.category}</span>
                              <span className="text-sm text-muted-foreground">•</span>
                              <span className="text-sm text-muted-foreground">Team: {t.assignee}</span>
                              <span className="text-sm text-muted-foreground">•</span>
                              <Badge variant={t.priority === 'critical' ? 'destructive' : t.priority === 'high' ? 'default' : 'secondary'} className="opacity-60">
                                {PRIORITY_DB_TO_IT[t.priority] || t.priority}
                              </Badge>
                            </div>
                            <div className="flex items-center space-x-3 mt-2 text-xs text-muted-foreground">
                              <span>Date: {format(parseISO(t.start_date), 'dd/MM/yyyy')} - {format(parseISO(t.end_date), 'dd/MM/yyyy')}</span>
                              <span>•</span>
                              <span>Budget: €{(t.budget || 0).toLocaleString()}</span>
                              <span>•</span>
                              <span>Progress: {t.progress}%</span>
                            </div>
                          </div>
                        </div>
                        <Button onClick={() => handleRestoreTask(t.id)} variant="outline" size="sm" className="border-primary/30 hover:bg-primary hover:text-primary-foreground">
                          <CheckCircle className="w-4 h-4 mr-2" />Ripristina
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="metrics" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="border-border">
                <CardHeader><CardTitle className="flex items-center text-blue-600"><BarChart3 className="w-5 h-5 mr-2" />Metriche IT</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between"><span className="text-sm">Vulnerabilità Critiche</span><span className="font-bold text-red-500">12</span></div>
                  <div className="flex justify-between"><span className="text-sm">Patch Missing</span><span className="font-bold text-yellow-500">23</span></div>
                  <div className="flex justify-between"><span className="text-sm">Sistemi Non Conformi</span><span className="font-bold text-orange-500">8</span></div>
                  <div className="flex justify-between"><span className="text-sm">Tempo Medio Remediation</span><span className="font-bold">15 giorni</span></div>
                </CardContent>
              </Card>
              <Card className="border-border">
                <CardHeader><CardTitle className="flex items-center text-green-600"><CheckCircle className="w-5 h-5 mr-2" />Metriche Compliance</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between"><span className="text-sm">Conformità NIS2</span><span className="font-bold text-yellow-500">68%</span></div>
                  <div className="flex justify-between"><span className="text-sm">Gap Identificati</span><span className="font-bold text-red-500">45</span></div>
                  <div className="flex justify-between"><span className="text-sm">Controlli Implementati</span><span className="font-bold text-green-500">127</span></div>
                  <div className="flex justify-between"><span className="text-sm">Audit Readiness</span><span className="font-bold text-yellow-500">72%</span></div>
                </CardContent>
              </Card>
              <Card className="border-border">
                <CardHeader><CardTitle className="flex items-center text-purple-600"><Users className="w-5 h-5 mr-2" />Metriche Direzione</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between"><span className="text-sm">ROI Sicurezza</span><span className="font-bold text-green-500">3.2x</span></div>
                  <div className="flex justify-between"><span className="text-sm">Rischio Residuo</span><span className="font-bold text-yellow-500">Medio</span></div>
                  <div className="flex justify-between"><span className="text-sm">Costi Evitati</span><span className="font-bold text-green-500">€65K</span></div>
                  <div className="flex justify-between"><span className="text-sm">Business Continuity</span><span className="font-bold text-green-500">94%</span></div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Remediation;
