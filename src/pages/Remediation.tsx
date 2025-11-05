import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
import { format, addDays, differenceInDays, parseISO } from 'date-fns';
import { 
  AlertTriangle,
  Calendar,
  CheckCircle,
  Clock,
  FileText,
  TrendingUp,
  Users,
  Target,
  Wrench,
  BarChart3,
  CalendarDays,
  Plus,
  Calculator,
  Euro,
  Eye,
  EyeOff,
  Trash2,
  MoreHorizontal,
  Settings
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const Remediation: React.FC = () => {
  const [selectedTimeframe, setSelectedTimeframe] = useState('90days');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [draggedTask, setDraggedTask] = useState<number | null>(null);
  const [draggedOver, setDraggedOver] = useState<number | null>(null);
  const [taskOrder, setTaskOrder] = useState<number[]>([1, 2, 3, 4, 5, 6, 7]);
  const [resizingTask, setResizingTask] = useState<{ id: number, side: 'left' | 'right' } | null>(null);
  const [taskDates, setTaskDates] = useState<Record<number, { startDate: string, endDate: string }>>({});
  const [hiddenTasks, setHiddenTasks] = useState<Set<number>>(new Set());
  const [deletedTasks, setDeletedTasks] = useState<Set<number>>(new Set());
  const [editingTaskTitle, setEditingTaskTitle] = useState<number | null>(null);
  const [editingTask, setEditingTask] = useState<number | null>(null);
  const [editTaskData, setEditTaskData] = useState<any>(null);
  const [taskBudgets, setTaskBudgets] = useState<Record<number, number>>({});
  const [allTasksData, setAllTasksData] = useState<Record<number, any>>({});
  const [newRemediation, setNewRemediation] = useState({
    category: '',
    priority: '',
    description: '',
    estimatedDays: '',
    estimatedBudget: '',
    assignedTeam: '',
    complexity: 'medium'
  });

  // Funzione per convertire ID mock a UUID per il database
  const getUUIDForMockId = async (mockId: number) => {
    const mockUUIDs: Record<number, string> = {
      1: '89862a35-1eec-4489-889b-5781e6e78dd4',
      2: '27afa77b-05a1-4ae3-8bdf-ea39f84135b2',
      3: 'c3f8b7d2-4e1a-4c9b-8f7e-2d5a6b8c9e0f',
      4: 'f1e2d3c4-b5a6-9c8d-7e6f-0a1b2c3d4e5f',
      5: '8a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d',
      6: '7f8e9d0c-1b2a-3c4d-5e6f-7a8b9c0d1e2f',
      7: '6e7d8c9b-0a1f-2e3d-4c5b-6a7f8e9d0c1b'
    };
    return mockUUIDs[mockId] || crypto.randomUUID();
  };
  const loadAllTaskData = async () => {
    try {
      // Prima ottieni l'organization_id dell'utente corrente
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('Utente non autenticato');
        return;
      }

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('organization_id')
        .eq('auth_user_id', user.id)
        .single();

      if (userError) {
        console.error('Errore nel recupero dei dati utente:', userError);
        return;
      }

      const organizationId = userData?.organization_id;
      if (!organizationId) {
        console.log('Organization ID non trovato per l\'utente');
        return;
      }

      // Carica tutti i task esistenti per questa organizzazione

      const { data: tasks, error } = await supabase
        .from('remediation_tasks')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_deleted', false)
        .order('display_order', { ascending: true });

      if (error) throw error;

      if (tasks && tasks.length > 0) {
        // Crea una mappatura UUID -> mockId sequenziale
        const reverseMapping: Record<string, number> = {};
        tasks.forEach((task, index) => {
          reverseMapping[task.id] = index + 1;
        });

        console.log('Task caricati dal database:', tasks.length);

        // Popola l'ordine dei task
        const orderedIds = tasks
          .map(task => reverseMapping[task.id])
          .filter(id => id !== undefined)
          .sort((a, b) => {
            const taskA = tasks.find(t => reverseMapping[t.id] === a);
            const taskB = tasks.find(t => reverseMapping[t.id] === b);
            return (taskA?.display_order || 0) - (taskB?.display_order || 0);
          });

        console.log('Task ordinati:', orderedIds);
        setTaskOrder(orderedIds);

        // Popola TUTTI i dati dei task dal database
        const allDataMap: Record<number, any> = {};
        const datesMap: Record<number, { startDate: string, endDate: string }> = {};
        const budgetMap: Record<number, number> = {};
        const hidden = new Set<number>();
        const deleted = new Set<number>();

        // Mappatura priorità database -> italiana
        const priorityDisplayMapping: Record<string, string> = {
          'critical': 'Critica',
          'high': 'Alta',
          'medium': 'Media',
          'low': 'Bassa'
        };

        tasks.forEach(task => {
          const mockId = reverseMapping[task.id];
          if (mockId) {
            // Salva tutti i dati del task
            allDataMap[mockId] = {
              id: mockId,
              task: task.task,
              category: task.category,
              startDate: task.start_date,
              endDate: task.end_date,
              progress: task.progress,
              assignee: task.assignee,
              priority: priorityDisplayMapping[task.priority] || 'Media',
              color: task.color,
              budget: task.budget ? Number(task.budget) : 0,
              dependencies: task.dependencies || []
            };

            datesMap[mockId] = {
              startDate: task.start_date,
              endDate: task.end_date
            };

            budgetMap[mockId] = task.budget ? Number(task.budget) : 0;

            if (task.is_hidden) {
              hidden.add(mockId);
            }

            if (task.is_deleted) {
              deleted.add(mockId);
            }
          }
        });

        setAllTasksData(allDataMap);
        setTaskDates(datesMap);
        setTaskBudgets(budgetMap);
        setHiddenTasks(hidden);
        setDeletedTasks(deleted);

        console.log('Dati caricati dal database:', {
          tasks: tasks.length,
          allData: Object.keys(allDataMap).length,
          dates: Object.keys(datesMap).length,
          budgets: Object.keys(budgetMap).length,
          hidden: hidden.size,
          deleted: deleted.size
        });
      }
    } catch (error) {
      console.error('Errore nel caricamento dei dati:', error);
      toast({
        title: "Errore",
        description: "Impossibile caricare i dati dei task dal database.",
        variant: "destructive"
      });
    }
  };

  // Carica TUTTI i dati dei task dal database all'avvio
  useEffect(() => {
    loadAllTaskData();
  }, []);


  // Categorie critiche che necessitano remediation (status: not_started o planned_in_progress)
  const criticalCategories = [
    { 
      name: 'Gestione delle identità Gestione degli accessi', 
      riskLevel: 'Alto',
      priority: 'Critica',
      completed: 5,
      total: 28,
      status: 'not_started',
      estimatedDays: 45,
      assignedTeam: 'IT Security',
      budget: '€16,500'
    },
    { 
      name: 'Sviluppo software', 
      riskLevel: 'Alto',
      priority: 'Alta',
      completed: 1,
      total: 23,
      status: 'planned_in_progress',
      estimatedDays: 60,
      assignedTeam: 'Development',
      budget: '€18,000'
    },
    { 
      name: 'Gestione fornitori e acquisti', 
      riskLevel: 'Medio',
      priority: 'Media',
      completed: 1,
      total: 19,
      status: 'planned_in_progress',
      estimatedDays: 30,
      assignedTeam: 'Procurement',
      budget: '€4,500'
    },
    { 
      name: 'Manutenzione e miglioramento continuo', 
      riskLevel: 'Medio',
      priority: 'Media',
      completed: 1,
      total: 17,
      status: 'planned_in_progress',
      estimatedDays: 35,
      assignedTeam: 'Operations',
      budget: '€4,500'
    }
  ];

  // Azioni GANTT con date più realistiche
  const ganttActions = [
    {
      id: 1,
      task: 'Implementazione IAM centralizzato',
      category: 'Gestione delle identità',
      startDate: '2025-01-15',
      endDate: '2025-03-01',
      progress: 0,
      assignee: 'IT Security Team',
      priority: 'Critica',
      dependencies: [],
      color: '#DC2626',
      budget: 16500
    },
    {
      id: 2,
      task: 'Audit accessi privilegiati',
      category: 'Gestione delle identità',
      startDate: '2025-01-20',
      endDate: '2025-02-15',
      progress: 0,
      assignee: 'Security Auditor',
      priority: 'Critica',
      dependencies: [],
      color: '#DC2626',
      budget: 8000
    },
    {
      id: 3,
      task: 'Implementazione SAST/DAST',
      category: 'Sviluppo software',
      startDate: '2025-02-01',
      endDate: '2025-04-01',
      progress: 15,
      assignee: 'DevSecOps Team',
      priority: 'Alta',
      dependencies: [],
      color: '#EA580C',
      budget: 18000
    },
    {
      id: 4,
      task: 'Training sviluppatori Secure Coding',
      category: 'Sviluppo software',
      startDate: '2025-01-25',
      endDate: '2025-02-25',
      progress: 0,
      assignee: 'HR & Security',
      priority: 'Alta',
      dependencies: [],
      color: '#EA580C',
      budget: 7500
    },
    {
      id: 5,
      task: 'Assessment fornitori critici',
      category: 'Gestione fornitori',
      startDate: '2025-02-15',
      endDate: '2025-03-15',
      progress: 0,
      assignee: 'Procurement Team',
      priority: 'Media',
      dependencies: [],
      color: '#EAB308',
      budget: 4500
    },
    {
      id: 6,
      task: 'Implementazione procedure backup',
      category: 'Business Continuity',
      startDate: '2025-03-01',
      endDate: '2025-04-15',
      progress: 0,
      assignee: 'Operations Team',
      priority: 'Alta',
      dependencies: [],
      color: '#EA580C',
      budget: 6000
    },
    {
      id: 7,
      task: 'Implementazione Incident Remediation Plan',
      category: 'Incident Management',
      startDate: '2025-02-10',
      endDate: '2025-03-20',
      progress: 0,
      assignee: 'IT Security Team',
      priority: 'Alta',
      dependencies: [],
      color: '#EA580C',
      budget: 8000
    }
  ];

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'Alto': return 'text-red-500';
      case 'Medio': return 'text-yellow-500';
      case 'Basso': return 'text-green-500';
      default: return 'text-gray-500';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'Critica': return 'destructive';
      case 'Alta': return 'default';
      case 'Media': return 'secondary';
      default: return 'outline';
    }
  };

  const getProgressColor = (progress: number) => {
    if (progress >= 70) return 'bg-green-500';
    if (progress >= 40) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  // Calcolo automatico budget basato su complessità e giorni
  const calculateBudget = (days: number, complexity: string) => {
    const baseDayRate = {
      low: 300,      // €300/giorno per attività semplici
      medium: 500,   // €500/giorno per attività medie
      high: 800      // €800/giorno per attività complesse
    };
    return Math.round(days * baseDayRate[complexity as keyof typeof baseDayRate]);
  };

  const calculateDays = (complexity: string, categoryType: string) => {
    // Stima giorni basata su tipo categoria e complessità
    const baseEstimates = {
      'identity_management': { low: 15, medium: 30, high: 45 },
      'software_development': { low: 20, medium: 40, high: 60 },
      'supplier_management': { low: 10, medium: 20, high: 30 },
      'maintenance': { low: 12, medium: 25, high: 35 },
      'governance': { low: 8, medium: 15, high: 25 }
    };
    return baseEstimates[categoryType as keyof typeof baseEstimates]?.[complexity as keyof typeof baseEstimates['identity_management']] || 20;
  };

  const handleCreateRemediation = async () => {
    console.log('=== INIZIO CREAZIONE REMEDIATION ===');
    console.log('Dati remediation:', newRemediation);
    
    const estimatedDays = newRemediation.estimatedDays || calculateDays(newRemediation.complexity, newRemediation.category);
    const estimatedBudget = newRemediation.estimatedBudget || calculateBudget(Number(estimatedDays), newRemediation.complexity);
    
    try {
      // Ottieni l'organization_id dell'utente corrente
      const { data: { user } } = await supabase.auth.getUser();
      console.log('Utente autenticato:', user?.id);
      
      if (!user) {
        toast({
          title: "Errore",
          description: "Devi essere autenticato per creare una remediation.",
          variant: "destructive"
        });
        return;
      }

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('organization_id')
        .eq('auth_user_id', user.id)
        .single();

      console.log('Dati utente:', userData, 'Errore:', userError);

      if (userError || !userData?.organization_id) {
        toast({
          title: "Errore",
          description: "Impossibile trovare l'organizzazione dell'utente.",
          variant: "destructive"
        });
        return;
      }

      // Calcola la data di inizio (oggi) e la data di fine basata sui giorni stimati
      const startDate = format(new Date(), 'yyyy-MM-dd');
      const endDate = format(addDays(new Date(), Number(estimatedDays)), 'yyyy-MM-dd');

      // Mappatura priorità italiana -> inglese per il database
      const priorityMapping: Record<string, string> = {
        'critica': 'critical',
        'alta': 'high',
        'media': 'medium',
        'bassa': 'low'
      };

      // Determina il colore in base alla priorità
      const priorityColors: Record<string, string> = {
        'critica': '#DC2626',
        'alta': '#EA580C',
        'media': '#EAB308',
        'bassa': '#22C55E'
      };

      const dbPriority = priorityMapping[newRemediation.priority] || 'medium';

      const newTask = {
        organization_id: userData.organization_id,
        task: newRemediation.description,
        category: newRemediation.category,
        start_date: startDate,
        end_date: endDate,
        progress: 0,
        assignee: newRemediation.assignedTeam,
        priority: dbPriority,
        color: priorityColors[newRemediation.priority] || '#3b82f6',
        display_order: taskOrder.length, // Metti il nuovo task alla fine
        is_hidden: false,
        is_deleted: false,
        dependencies: [],
        budget: Number(estimatedBudget) || 0
      };

      console.log('Task da inserire:', newTask);

      const { data: insertedData, error: insertError } = await supabase
        .from('remediation_tasks')
        .insert(newTask)
        .select();

      console.log('Risultato insert:', { insertedData, insertError });

      if (insertError) {
        console.error('Errore insert:', insertError);
        throw insertError;
      }

      console.log('Task inserito con successo:', insertedData);

      toast({
        title: "Remediation creata",
        description: "Il nuovo task di remediation è stato salvato nel database.",
      });

      // Reset form
      setNewRemediation({
        category: '',
        priority: '',
        description: '',
        estimatedDays: '',
        estimatedBudget: '',
        assignedTeam: '',
        complexity: 'medium'
      });
      setIsCreateModalOpen(false);

      // Ricarica i dati dal database senza refresh della pagina
      await loadAllTaskData();
    } catch (error) {
      console.error('Errore nella creazione della remediation:', error);
      toast({
        title: "Errore",
        description: "Impossibile creare la remediation.",
        variant: "destructive"
      });
    }
  };

  // Funzioni per il Gantt Chart con drag & drop
  const handleDragStart = (taskId: number) => {
    setDraggedTask(taskId);
  };

  const handleDragOver = (e: React.DragEvent, taskId: number) => {
    e.preventDefault();
    setDraggedOver(taskId);
  };

  const handleDrop = (e: React.DragEvent, targetTaskId: number) => {
    e.preventDefault();
    if (draggedTask && draggedTask !== targetTaskId) {
      const newOrder = [...taskOrder];
      const draggedIndex = newOrder.indexOf(draggedTask);
      const targetIndex = newOrder.indexOf(targetTaskId);
      
      // Rimuovi il task dalla posizione originale
      newOrder.splice(draggedIndex, 1);
      // Inserisci nella nuova posizione
      newOrder.splice(targetIndex, 0, draggedTask);
      
      setTaskOrder(newOrder);
      
      // Salva il nuovo ordine nel database
      saveTaskOrder(newOrder);
      
      // Ricalcola le date per evitare sovrapposizioni
      recalculateDates(newOrder);
    }
    setDraggedTask(null);
    setDraggedOver(null);
  };

  // Funzioni per il resize delle barre
  const handleResizeStart = (e: React.MouseEvent, taskId: number, side: 'left' | 'right') => {
    e.stopPropagation();
    setResizingTask({ id: taskId, side });
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const ganttContainer = document.querySelector('.gantt-timeline') as HTMLElement;
      if (!ganttContainer) return;
      
      const containerRect = ganttContainer.getBoundingClientRect();
      const relativeX = moveEvent.clientX - containerRect.left;
      const percentage = Math.max(0, Math.min(100, (relativeX / containerRect.width) * 100));
      
      // Converti percentuale in data
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-05-01');
      const totalDays = differenceInDays(endDate, startDate);
      const targetDays = Math.round((percentage / 100) * totalDays);
      const targetDate = format(addDays(startDate, targetDays), 'yyyy-MM-dd');
      
      setTaskDates(prev => {
        const currentDates = prev[taskId];
        let newDates = prev;
        
        if (side === 'left') {
          // Non permettere che la data di inizio superi quella di fine
          const endDateObj = parseISO(currentDates.endDate);
          const newStartDateObj = parseISO(targetDate);
          if (newStartDateObj < endDateObj) {
            newDates = {
              ...prev,
              [taskId]: { ...currentDates, startDate: targetDate }
            };
            // Salva le nuove date nel database
            saveTaskDates(taskId, targetDate, currentDates.endDate);
          }
        } else {
          // Non permettere che la data di fine sia prima di quella di inizio
          const startDateObj = parseISO(currentDates.startDate);
          const newEndDateObj = parseISO(targetDate);
          if (newEndDateObj > startDateObj) {
            newDates = {
              ...prev,
              [taskId]: { ...currentDates, endDate: targetDate }
            };
            // Salva le nuove date nel database
            saveTaskDates(taskId, currentDates.startDate, targetDate);
          }
        }
        return newDates;
      });
    };
    
    const handleMouseUp = () => {
      setResizingTask(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const recalculateDates = (order: number[]) => {
    // Logica per riallocare le date quando i task si sovrappongono
    console.log('Recalculating dates for order:', order);
  };

  // Funzioni per il salvataggio nel database
  const saveTaskOrder = async (newOrder: number[]) => {
    try {
      // Ottieni l'organization_id dell'utente corrente
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userData } = await supabase
        .from('users')
        .select('organization_id')
        .eq('auth_user_id', user.id)
        .single();

      if (!userData?.organization_id) return;

      // Converte gli ID mock a UUID per il salvataggio nel database
      const updates = await Promise.all(newOrder.map(async (taskId, index) => ({
        id: await getUUIDForMockId(taskId),
        display_order: index
      })));

      for (const update of updates) {
        const { error } = await supabase
          .from('remediation_tasks')
          .update({ display_order: update.display_order })
          .eq('id', update.id)
          .eq('organization_id', userData.organization_id);
        
        if (error) throw error;
      }

      toast({
        title: "Ordine salvato",
        description: "L'ordine dei task è stato aggiornato nel database."
      });
    } catch (error) {
      console.error('Errore nel salvataggio dell\'ordine:', error);
      toast({
        title: "Errore",
        description: "Impossibile salvare l'ordine dei task.",
        variant: "destructive"
      });
    }
  };

  const saveTaskDates = async (taskId: number, startDate: string, endDate: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userData } = await supabase
        .from('users')
        .select('organization_id')
        .eq('auth_user_id', user.id)
        .single();

      if (!userData?.organization_id) return;

      const uuid = await getUUIDForMockId(taskId);
      const { error } = await supabase
        .from('remediation_tasks')
        .update({ 
          start_date: startDate,
          end_date: endDate
        })
        .eq('id', uuid)
        .eq('organization_id', userData.organization_id);
      
      if (error) throw error;

      toast({
        title: "Date aggiornate",
        description: "Le date del task sono state salvate nel database."
      });
    } catch (error) {
      console.error('Errore nel salvataggio delle date:', error);
      toast({
        title: "Errore",
        description: "Impossibile salvare le date del task.",
        variant: "destructive"
      });
    }
  };

  const saveTaskVisibility = async (taskId: number, isHidden: boolean) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userData } = await supabase
        .from('users')
        .select('organization_id')
        .eq('auth_user_id', user.id)
        .single();

      if (!userData?.organization_id) return;

      const uuid = await getUUIDForMockId(taskId);
      const { error } = await supabase
        .from('remediation_tasks')
        .update({ is_hidden: isHidden })
        .eq('id', uuid)
        .eq('organization_id', userData.organization_id);
      
      if (error) throw error;

      toast({
        title: isHidden ? "Task nascosto" : "Task mostrato",
        description: `Lo stato di visibilità è stato salvato nel database.`
      });
    } catch (error) {
      console.error('Errore nel salvataggio della visibilità:', error);
      toast({
        title: "Errore",
        description: "Impossibile salvare lo stato di visibilità.",
        variant: "destructive"
      });
    }
  };

  const saveTaskDeletion = async (taskId: number, isDeleted: boolean) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userData } = await supabase
        .from('users')
        .select('organization_id')
        .eq('auth_user_id', user.id)
        .single();

      if (!userData?.organization_id) return;

      const uuid = await getUUIDForMockId(taskId);
      const { error } = await supabase
        .from('remediation_tasks')
        .update({ is_deleted: isDeleted })
        .eq('id', uuid)
        .eq('organization_id', userData.organization_id);
      
      if (error) throw error;

      toast({
        title: isDeleted ? "Task eliminato" : "Task ripristinato",
        description: `Il task è stato ${isDeleted ? 'eliminato' : 'ripristinato'} nel database.`
      });
    } catch (error) {
      console.error('Errore nel salvataggio dell\'eliminazione:', error);
      toast({
        title: "Errore",
        description: "Impossibile salvare lo stato di eliminazione.",
        variant: "destructive"
      });
    }
  };

  const saveTaskProgress = async (taskId: number, progress: number) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userData } = await supabase
        .from('users')
        .select('organization_id')
        .eq('auth_user_id', user.id)
        .single();

      if (!userData?.organization_id) return;

      const uuid = await getUUIDForMockId(taskId);
      const { error } = await supabase
        .from('remediation_tasks')
        .update({ progress })
        .eq('id', uuid)
        .eq('organization_id', userData.organization_id);
      
      if (error) throw error;

      toast({
        title: "Progress aggiornato",
        description: "Il progresso del task è stato salvato nel database."
      });
    } catch (error) {
      console.error('Errore nel salvataggio del progress:', error);
      toast({
        title: "Errore",
        description: "Impossibile salvare il progresso del task.",
        variant: "destructive"
      });
    }
  };

  const saveTaskAssignee = async (taskId: number, assignee: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userData } = await supabase
        .from('users')
        .select('organization_id')
        .eq('auth_user_id', user.id)
        .single();

      if (!userData?.organization_id) return;

      const uuid = await getUUIDForMockId(taskId);
      const { error } = await supabase
        .from('remediation_tasks')
        .update({ assignee })
        .eq('id', uuid)
        .eq('organization_id', userData.organization_id);
      
      if (error) throw error;

      toast({
        title: "Assegnatario aggiornato",
        description: "L'assegnatario del task è stato salvato nel database."
      });
    } catch (error) {
      console.error('Errore nel salvataggio dell\'assegnatario:', error);
      toast({
        title: "Errore",
        description: "Impossibile salvare l'assegnatario del task.",
        variant: "destructive"
      });
    }
  };

  const saveTaskTitle = async (taskId: number, newTitle: string) => {
    try {
      // Valida l'input
      const trimmedTitle = newTitle.trim();
      if (!trimmedTitle) {
        toast({
          title: "Errore",
          description: "Il titolo non può essere vuoto.",
          variant: "destructive"
        });
        return false;
      }

      if (trimmedTitle.length > 500) {
        toast({
          title: "Errore",
          description: "Il titolo è troppo lungo (massimo 500 caratteri).",
          variant: "destructive"
        });
        return false;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { data: userData } = await supabase
        .from('users')
        .select('organization_id')
        .eq('auth_user_id', user.id)
        .single();

      if (!userData?.organization_id) return false;

      const uuid = await getUUIDForMockId(taskId);
      const { error } = await supabase
        .from('remediation_tasks')
        .update({ task: trimmedTitle })
        .eq('id', uuid)
        .eq('organization_id', userData.organization_id);
      
      if (error) throw error;

      toast({
        title: "Titolo aggiornato",
        description: "Il titolo del task è stato salvato nel database."
      });
      
      return true;
    } catch (error) {
      console.error('Errore nel salvataggio del titolo:', error);
      toast({
        title: "Errore",
        description: "Impossibile salvare il titolo del task.",
        variant: "destructive"
      });
      return false;
    }
  };

  const handleToggleVisibility = (taskId: number) => {
    setHiddenTasks(prev => {
      const newSet = new Set(prev);
      const isHidden = !newSet.has(taskId);
      
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      
      // Salva nel database
      saveTaskVisibility(taskId, isHidden);
      
      return newSet;
    });
  };

  const handleDeleteTask = (taskId: number) => {
    setDeletedTasks(prev => new Set([...prev, taskId]));
    // Rimuovi anche dai task nascosti se era presente
    setHiddenTasks(prev => {
      const newSet = new Set(prev);
      newSet.delete(taskId);
      return newSet;
    });
    // Rimuovi dall'ordine dei task
    setTaskOrder(prev => prev.filter(id => id !== taskId));
    
    // Salva nel database
    saveTaskDeletion(taskId, true);
  };

  const handleRestoreTask = (taskId: number) => {
    setDeletedTasks(prev => {
      const newSet = new Set(prev);
      newSet.delete(taskId);
      return newSet;
    });
    // Riaggiungilo all'ordine se non c'è già
    setTaskOrder(prev => {
      if (!prev.includes(taskId)) {
        const newOrder = [...prev, taskId];
        // Salva il nuovo ordine nel database
        saveTaskOrder(newOrder);
        return newOrder;
      }
      return prev;
    });
    
    // Salva nel database
    saveTaskDeletion(taskId, false);
  };

  const handleEditTask = (action: any) => {
    setEditingTask(action.id);
    setEditTaskData({
      task: action.task,
      category: action.category,
      assignee: action.assignee,
      priority: action.priority,
      progress: action.progress,
      budget: action.budget || 0
    });
  };

  const handleSaveEditedTask = async () => {
    if (!editingTask || !editTaskData) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userData } = await supabase
        .from('users')
        .select('organization_id')
        .eq('auth_user_id', user.id)
        .single();

      if (!userData?.organization_id) return;

      // Mappatura priorità italiana -> inglese
      const priorityMapping: Record<string, string> = {
        'Critica': 'critical',
        'Alta': 'high',
        'Media': 'medium',
        'Bassa': 'low',
        'critica': 'critical',
        'alta': 'high',
        'media': 'medium',
        'bassa': 'low'
      };

      const uuid = await getUUIDForMockId(editingTask);
      
      const { error } = await supabase
        .from('remediation_tasks')
        .update({
          task: editTaskData.task,
          category: editTaskData.category,
          assignee: editTaskData.assignee,
          priority: priorityMapping[editTaskData.priority] || 'medium',
          progress: editTaskData.progress,
          budget: Number(editTaskData.budget) || 0
        })
        .eq('id', uuid)
        .eq('organization_id', userData.organization_id);

      if (error) throw error;

      toast({
        title: "Task aggiornato",
        description: "Le modifiche sono state salvate con successo."
      });

      // Aggiorna i budget locali immediatamente
      const newBudget = Number(editTaskData.budget) || 0;
      setTaskBudgets(prev => ({
        ...prev,
        [editingTask]: newBudget
      }));

      setEditingTask(null);
      setEditTaskData(null);
    } catch (error) {
      console.error('Errore nel salvataggio delle modifiche:', error);
      toast({
        title: "Errore",
        description: "Impossibile salvare le modifiche.",
        variant: "destructive"
      });
    }
  };

  const getGanttData = () => {
    const startDate = new Date('2025-01-01');
    const endDate = new Date('2025-05-01');
    const totalDays = differenceInDays(endDate, startDate);
    
    // Filtra i task eliminati e ordina secondo l'ordine corrente
    const orderedActions = taskOrder
      .filter(id => !deletedTasks.has(id))
      .map(id => {
        // Prova prima a trovare il task nei dati dal database
        const dbTask = allTasksData[id];
        if (dbTask) {
          return {
            ...dbTask,
            isHidden: hiddenTasks.has(id)
          };
        }
        
        // Fallback sui dati mock se il task non è nel DB
        const baseAction = ganttActions.find(action => action.id === id);
        if (!baseAction) {
          console.warn('Task non trovato:', id);
          return null;
        }
        
        const dates = taskDates[id] || { startDate: baseAction.startDate, endDate: baseAction.endDate };
        const budget = taskBudgets[id] !== undefined ? taskBudgets[id] : baseAction.budget;
        
        return {
          ...baseAction,
          startDate: dates.startDate,
          endDate: dates.endDate,
          isHidden: hiddenTasks.has(id),
          budget: budget
        };
      })
      .filter(action => action !== null);

    return orderedActions.map(action => {
      const actionStart = parseISO(action.startDate);
      const actionEnd = parseISO(action.endDate);
      const daysFromStart = differenceInDays(actionStart, startDate);
      const duration = differenceInDays(actionEnd, actionStart);
      
      return {
        ...action,
        startOffset: (daysFromStart / totalDays) * 100,
        width: (duration / totalDays) * 100,
        progressWidth: ((duration * action.progress) / 100 / totalDays) * 100,
        duration: duration
      };
    });
  };

  const ganttData = getGanttData();

  // Calcola il budget totale sommando tutti i budget delle attività attive
  const totalBudget = ganttData
    .filter(action => !action.isHidden)
    .reduce((sum, action) => sum + (action.budget || 0), 0);

  // Generiamo le settimane per l'header del Gantt
  const generateWeeks = () => {
    const weeks = [];
    const startDate = new Date('2025-01-01');
    const endDate = new Date('2025-05-01');
    let currentDate = startDate;
    
    while (currentDate < endDate) {
      weeks.push({
        label: format(currentDate, 'dd/MM'),
        date: new Date(currentDate)
      });
      currentDate = addDays(currentDate, 7);
    }
    return weeks;
  };

  const weeks = generateWeeks();
  const actionableMetrics = {
    totalBudget: `€${totalBudget.toLocaleString('it-IT')}`,
    estimatedCompletion: '120 giorni',
    riskReduction: '65%',
    complianceImprovement: '60%',
    criticalIssues: 4,
    highPriorityActions: 7
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Piano di Remediation</h1>
            <p className="text-muted-foreground">
              Azioni prioritarie per mitigare i rischi critici identificati nell'assessment
            </p>
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
                      <Label htmlFor="category">Categoria Assessment</Label>
                      <Select value={newRemediation.category} onValueChange={(value) => 
                        setNewRemediation(prev => ({ ...prev, category: value }))
                      }>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleziona categoria" />
                        </SelectTrigger>
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
                      <Label htmlFor="priority">Priorità</Label>
                      <Select value={newRemediation.priority} onValueChange={(value) => 
                        setNewRemediation(prev => ({ ...prev, priority: value }))
                      }>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleziona priorità" />
                        </SelectTrigger>
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
                    <Label htmlFor="description">Descrizione Remediation</Label>
                    <Textarea
                      id="description"
                      value={newRemediation.description}
                      onChange={(e) => setNewRemediation(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Descrivi le azioni da intraprendere per la remediation..."
                      rows={3}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="complexity">Complessità</Label>
                      <Select value={newRemediation.complexity} onValueChange={(value) => 
                        setNewRemediation(prev => ({ ...prev, complexity: value }))
                      }>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Bassa (€300/gg)</SelectItem>
                          <SelectItem value="medium">Media (€500/gg)</SelectItem>
                          <SelectItem value="high">Alta (€800/gg)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="estimatedDays">Giorni Stimati</Label>
                      <Input
                        id="estimatedDays"
                        type="number"
                        value={newRemediation.estimatedDays}
                        onChange={(e) => setNewRemediation(prev => ({ ...prev, estimatedDays: e.target.value }))}
                        placeholder={`Auto: ${calculateDays(newRemediation.complexity, newRemediation.category)}`}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="estimatedBudget">Budget Stimato (€)</Label>
                      <Input
                        id="estimatedBudget"
                        type="number"
                        value={newRemediation.estimatedBudget}
                        onChange={(e) => setNewRemediation(prev => ({ ...prev, estimatedBudget: e.target.value }))}
                        placeholder={`Auto: €${calculateBudget(
                          Number(newRemediation.estimatedDays) || calculateDays(newRemediation.complexity, newRemediation.category), 
                          newRemediation.complexity
                        ).toLocaleString()}`}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="assignedTeam">Team Assegnato</Label>
                    <Select value={newRemediation.assignedTeam} onValueChange={(value) => 
                      setNewRemediation(prev => ({ ...prev, assignedTeam: value }))
                    }>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona team" />
                      </SelectTrigger>
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

                  {/* Anteprima calcoli */}
                  <Card className="bg-muted/50">
                    <CardContent className="p-4">
                      <h4 className="font-medium mb-3 flex items-center">
                        <Euro className="w-4 h-4 mr-2" />
                        Stima Automatica
                      </h4>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Giorni:</span>
                          <p className="font-medium">
                            {newRemediation.estimatedDays || calculateDays(newRemediation.complexity, newRemediation.category)} giorni
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Budget:</span>
                          <p className="font-medium">
                            €{(Number(newRemediation.estimatedBudget) || calculateBudget(
                              Number(newRemediation.estimatedDays) || calculateDays(newRemediation.complexity, newRemediation.category), 
                              newRemediation.complexity
                            )).toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Tariffa/gg:</span>
                          <p className="font-medium">
                            €{newRemediation.complexity === 'low' ? '300' : newRemediation.complexity === 'high' ? '800' : '500'}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="flex justify-end space-x-2">
                    <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
                      Annulla
                    </Button>
                    <Button onClick={handleCreateRemediation} className="bg-green-600 hover:bg-green-700">
                      Crea Remediation
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            
            {/* Dialog di modifica attività */}
            <Dialog open={editingTask !== null} onOpenChange={(open) => {
              if (!open) {
                setEditingTask(null);
                setEditTaskData(null);
              }
            }}>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center">
                    <Settings className="w-5 h-5 mr-2" />
                    Modifica Attività
                  </DialogTitle>
                </DialogHeader>
                
                {editTaskData && (
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-task">Descrizione Attività</Label>
                      <Textarea
                        id="edit-task"
                        value={editTaskData.task}
                        onChange={(e) => setEditTaskData(prev => ({ ...prev, task: e.target.value }))}
                        placeholder="Descrizione dell'attività"
                        rows={3}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="edit-category">Categoria</Label>
                        <Select 
                          value={editTaskData.category} 
                          onValueChange={(value) => setEditTaskData(prev => ({ ...prev, category: value }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Seleziona categoria" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Gestione delle identità">Gestione delle identità</SelectItem>
                            <SelectItem value="Sviluppo software">Sviluppo software</SelectItem>
                            <SelectItem value="Gestione fornitori">Gestione fornitori</SelectItem>
                            <SelectItem value="Business Continuity">Business Continuity</SelectItem>
                            <SelectItem value="Incident Response">Incident Response</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="edit-priority">Priorità</Label>
                        <Select 
                          value={editTaskData.priority} 
                          onValueChange={(value) => setEditTaskData(prev => ({ ...prev, priority: value }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Seleziona priorità" />
                          </SelectTrigger>
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
                        <Label htmlFor="edit-assignee">Team Assegnato</Label>
                        <Select 
                          value={editTaskData.assignee} 
                          onValueChange={(value) => setEditTaskData(prev => ({ ...prev, assignee: value }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Seleziona team" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="IT Security Team">IT Security Team</SelectItem>
                            <SelectItem value="Security Auditor">Security Auditor</SelectItem>
                            <SelectItem value="DevSecOps Team">DevSecOps Team</SelectItem>
                            <SelectItem value="HR & Security">HR & Security</SelectItem>
                            <SelectItem value="Procurement Team">Procurement Team</SelectItem>
                            <SelectItem value="Operations Team">Operations Team</SelectItem>
                            <SelectItem value="Compliance Team">Compliance Team</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="edit-progress">Progresso (%)</Label>
                        <Input
                          id="edit-progress"
                          type="number"
                          min="0"
                          max="100"
                          value={editTaskData.progress}
                          onChange={(e) => setEditTaskData(prev => ({ ...prev, progress: Number(e.target.value) }))}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="edit-budget">Budget Allocato (€)</Label>
                      <Input
                        id="edit-budget"
                        type="number"
                        min="0"
                        step="100"
                        value={editTaskData.budget || 0}
                        onChange={(e) => setEditTaskData(prev => ({ ...prev, budget: Number(e.target.value) }))}
                        placeholder="Budget in euro"
                      />
                    </div>

                    <div className="flex justify-end space-x-2 pt-4">
                      <Button 
                        variant="outline" 
                        onClick={() => {
                          setEditingTask(null);
                          setEditTaskData(null);
                        }}
                      >
                        Annulla
                      </Button>
                      <Button onClick={handleSaveEditedTask} className="bg-primary">
                        Salva Modifiche
                      </Button>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>
            
            <Button variant="outline">
              <FileText className="w-4 h-4 mr-2" />
              Esporta Piano
            </Button>
            <Button className="bg-primary text-primary-foreground">
              <CalendarDays className="w-4 h-4 mr-2" />
              Pianifica Revisione
            </Button>
          </div>
        </div>

        {/* Metriche Executive Summary */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Budget Totale</p>
                  <p className="text-xl font-bold text-foreground">{actionableMetrics.totalBudget}</p>
                </div>
                <Target className="w-6 h-6 text-primary" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Tempo Stimato</p>
                  <p className="text-xl font-bold text-foreground">{actionableMetrics.estimatedCompletion}</p>
                </div>
                <Clock className="w-6 h-6 text-yellow-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Riduzione Rischio</p>
                  <p className="text-xl font-bold text-green-500">{actionableMetrics.riskReduction}</p>
                </div>
                <TrendingUp className="w-6 h-6 text-green-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Miglioramento Compliance</p>
                  <p className="text-xl font-bold text-blue-500">{actionableMetrics.complianceImprovement}</p>
                </div>
                <CheckCircle className="w-6 h-6 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Criticità</p>
                  <p className="text-xl font-bold text-red-500">{actionableMetrics.criticalIssues}</p>
                </div>
                <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Azioni Prioritarie</p>
                  <p className="text-xl font-bold text-orange-500">{actionableMetrics.highPriorityActions}</p>
                </div>
                <Wrench className="w-6 h-6 text-orange-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Panoramica Remediation</TabsTrigger>
            <TabsTrigger value="gantt">GANTT Operativo</TabsTrigger>
            <TabsTrigger value="metrics">Metriche & KPI</TabsTrigger>
          </TabsList>
          
          <TabsContent value="overview" className="space-y-6">
            {/* Aree Critiche */}
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <AlertTriangle className="w-5 h-5 mr-2 text-red-500" />
                  Aree che Richiedono Remediation Immediata
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {criticalCategories.map((category, index) => (
                    <div key={index} className="flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors">
                      <div className="flex items-center space-x-4">
                        <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/20">
                          <AlertTriangle className="w-5 h-5 text-red-500" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium">{category.name}</h4>
                          <p className="text-sm text-muted-foreground">
                            Completamento: {category.completed}/{category.total} ({Math.round((category.completed/category.total)*100)}%)
                          </p>
                          <div className="mt-2">
                            <Progress 
                              value={(category.completed/category.total)*100} 
                              className="h-1.5 w-64" 
                            />
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4 text-right">
                        <div>
                          <div className={`text-sm font-medium ${getRiskColor(category.riskLevel)}`}>
                            Rischio: {category.riskLevel}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Team: {category.assignedTeam}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Budget: {category.budget}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Stima: {category.estimatedDays} giorni
                          </div>
                        </div>
                        <Badge variant={getPriorityColor(category.priority) as any}>
                          {category.priority}
                        </Badge>
                        <Button variant="outline" size="sm">
                          <Wrench className="w-4 h-4 mr-1" />
                          Pianifica
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="gantt" className="space-y-6">
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Calendar className="w-5 h-5 mr-2 text-primary" />
                  GANTT Operativo - Timeline Remediation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  {/* Header timeline */}
                  <div className="mb-4">
                    <div className="flex">
                      <div className="w-64 flex-shrink-0"></div>
                      <div className="flex-1 flex border-b border-border">
                        {weeks.map((week, index) => (
                          <div 
                            key={index} 
                            className="flex-1 text-center text-xs text-muted-foreground py-2 border-r border-border/50"
                          >
                            {week.label}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Gantt bars con drag & drop */}
                  <div className="space-y-3">
                    {ganttData.map((action) => (
                      <div 
                        key={action.id} 
                        className={`flex items-center transition-all duration-200 rounded-lg p-2 cursor-move
                          ${draggedTask === action.id ? 'opacity-50 scale-95' : ''}
                          ${draggedOver === action.id ? 'bg-primary/10 border-l-4 border-primary' : ''}
                          ${action.isHidden ? 'opacity-30 bg-muted/10' : ''}
                          hover:bg-muted/30
                        `}
                        draggable={!action.isHidden}
                        onDragStart={() => !action.isHidden && handleDragStart(action.id)}
                        onDragOver={(e) => !action.isHidden && handleDragOver(e, action.id)}
                        onDrop={(e) => !action.isHidden && handleDrop(e, action.id)}
                        onDragEnd={() => {
                          setDraggedTask(null);
                          setDraggedOver(null);
                        }}
                      >
                        {/* Task info */}
                        <div className="w-64 flex-shrink-0 pr-4">
                          <div className="flex items-center space-x-2">
                            <div 
                              contentEditable={!action.isHidden}
                              suppressContentEditableWarning
                              onBlur={(e) => {
                                const newTitle = e.currentTarget.textContent || '';
                                if (newTitle !== action.task) {
                                  saveTaskTitle(action.id, newTitle);
                                }
                                setEditingTaskTitle(null);
                              }}
                              onFocus={() => setEditingTaskTitle(action.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  e.currentTarget.blur();
                                }
                              }}
                              className={`text-sm font-medium outline-none ${
                                action.isHidden 
                                  ? 'text-muted-foreground line-through cursor-not-allowed' 
                                  : 'text-foreground cursor-text hover:bg-muted/30 px-1 rounded'
                              } ${editingTaskTitle === action.id ? 'bg-muted/50' : ''}`}
                            >
                              {action.task}
                            </div>
                            {action.isHidden && (
                              <Badge variant="outline" className="text-xs">
                                <EyeOff className="w-3 h-3 mr-1" />
                                Nascosto
                              </Badge>
                            )}
                          </div>
                          <div className={`text-xs ${action.isHidden ? 'text-muted-foreground/50' : 'text-muted-foreground'}`}>
                            {action.assignee}
                          </div>
                          <div className="flex items-center space-x-2 mt-1">
                            <Badge 
                              variant={action.priority === 'Critica' ? 'destructive' : 
                                      action.priority === 'Alta' ? 'default' : 'secondary'} 
                              className={`text-xs ${action.isHidden ? 'opacity-50' : ''}`}
                            >
                              {action.priority}
                            </Badge>
                            <span className={`text-xs ${action.isHidden ? 'text-muted-foreground/50' : 'text-muted-foreground'}`}>
                              {action.progress}%
                            </span>
                          </div>
                        </div>

                        {/* Controlli azione */}
                        <div className="flex items-center space-x-1 mr-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditTask(action)}
                            title="Modifica attività"
                            className="h-6 w-6 p-0 hover:bg-primary/10 hover:text-primary"
                          >
                            <Settings className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleVisibility(action.id)}
                            title={action.isHidden ? "Mostra azione" : "Nascondi azione"}
                            className="h-6 w-6 p-0 hover:bg-muted"
                          >
                            {action.isHidden ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteTask(action.id)}
                            title="Elimina azione"
                            className="h-6 w-6 p-0 hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>

                        {/* Gantt timeline */}
                        <div className="flex-1 relative h-8 bg-muted/20 rounded gantt-timeline">
                          {/* Task bar con handle di resize */}
                          <div
                            className="absolute h-6 top-1 rounded-sm flex items-center group transition-all duration-200"
                            style={{
                              left: `${action.startOffset}%`,
                              width: `${action.width}%`,
                              backgroundColor: action.isHidden ? '#9CA3AF40' : action.color + '40',
                              border: `2px solid ${action.isHidden ? '#9CA3AF' : action.color}`,
                              transform: draggedTask === action.id ? 'scale(0.95)' : 'scale(1)',
                              zIndex: resizingTask?.id === action.id ? 10 : 1,
                              opacity: action.isHidden ? 0.5 : 1
                            }}
                          >
                            {/* Handle sinistra per resize start date */}
                            {!action.isHidden && (
                              <div
                                className="absolute left-0 top-0 w-2 h-full bg-primary/80 rounded-l-sm cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary"
                                onMouseDown={(e) => handleResizeStart(e, action.id, 'left')}
                                title="Trascina per modificare data inizio"
                              />
                            )}
                            
                            {/* Progress bar */}
                            <div
                              className="h-full rounded-sm transition-all duration-200 pointer-events-none"
                              style={{
                                width: `${action.progress}%`,
                                backgroundColor: action.isHidden ? '#9CA3AF' : action.color,
                                minWidth: action.progress > 0 ? '4px' : '0'
                              }}
                            />
                            
                            {/* Handle destra per resize end date */}
                            {!action.isHidden && (
                              <div
                                className="absolute right-0 top-0 w-2 h-full bg-primary/80 rounded-r-sm cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary"
                                onMouseDown={(e) => handleResizeStart(e, action.id, 'right')}
                                title="Trascina per modificare data fine"
                              />
                            )}
                          </div>
                          
                          {/* Tooltip info con durata aggiornata */}
                          <div className="absolute top-8 left-0 text-xs text-muted-foreground whitespace-nowrap">
                            {format(parseISO(action.startDate), 'dd/MM')} - {format(parseISO(action.endDate), 'dd/MM')}
                            <span className="text-primary ml-2">
                              ({action.duration} giorni)
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Tasks eliminati - sezione di ripristino */}
                  {deletedTasks.size > 0 && (
                    <div className="mt-6 pt-4 border-t border-border">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-medium text-muted-foreground">Azioni Eliminate</h4>
                      </div>
                      <div className="space-y-2">
                        {Array.from(deletedTasks).map(taskId => {
                          const deletedAction = ganttActions.find(action => action.id === taskId);
                          return deletedAction ? (
                            <div key={taskId} className="flex items-center justify-between p-2 bg-muted/30 rounded-lg border border-dashed">
                              <div className="flex items-center space-x-2">
                                <Trash2 className="w-4 h-4 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground line-through">
                                  {deletedAction.task}
                                </span>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleRestoreTask(taskId)}
                                className="text-xs"
                              >
                                Ripristina
                              </Button>
                            </div>
                          ) : null;
                        })}
                      </div>
                    </div>
                  )}

                  {/* Legend */}
                  <div className="mt-6 pt-4 border-t border-border">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-6 text-xs">
                          <div className="flex items-center space-x-2">
                            <div className="w-4 h-2 bg-red-600 rounded"></div>
                            <span>Critica</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <div className="w-4 h-2 bg-orange-600 rounded"></div>
                            <span>Alta</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <div className="w-4 h-2 bg-yellow-600 rounded"></div>
                            <span>Media</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <div className="w-4 h-2 bg-gray-400 rounded opacity-50"></div>
                            <span>Nascosto</span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                          <div className="flex items-center space-x-2">
                            <EyeOff className="w-3 h-3" />
                            <span>Nascondi/Mostra</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Trash2 className="w-3 h-3" />
                            <span>Elimina azione</span>
                          </div>
                        </div>
                      </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="metrics" className="space-y-6">
            {/* KPI Dashboard per Stakeholder */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* IT Metrics */}
              <Card className="border-border">
                <CardHeader>
                  <CardTitle className="flex items-center text-blue-600">
                    <BarChart3 className="w-5 h-5 mr-2" />
                    Metriche IT
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between">
                    <span className="text-sm">Vulnerabilità Critiche</span>
                    <span className="font-bold text-red-500">12</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Patch Missing</span>
                    <span className="font-bold text-yellow-500">23</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Sistemi Non Conformi</span>
                    <span className="font-bold text-orange-500">8</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Tempo Medio Remediation</span>
                    <span className="font-bold">15 giorni</span>
                  </div>
                </CardContent>
              </Card>

              {/* Compliance Metrics */}
              <Card className="border-border">
                <CardHeader>
                  <CardTitle className="flex items-center text-green-600">
                    <CheckCircle className="w-5 h-5 mr-2" />
                    Metriche Compliance
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between">
                    <span className="text-sm">Conformità NIS2</span>
                    <span className="font-bold text-yellow-500">68%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Gap Identificati</span>
                    <span className="font-bold text-red-500">45</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Controlli Implementati</span>
                    <span className="font-bold text-green-500">127</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Audit Readiness</span>
                    <span className="font-bold text-yellow-500">72%</span>
                  </div>
                </CardContent>
              </Card>

              {/* Executive Metrics */}
              <Card className="border-border">
                <CardHeader>
                  <CardTitle className="flex items-center text-purple-600">
                    <Users className="w-5 h-5 mr-2" />
                    Metriche Direzione
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between">
                    <span className="text-sm">ROI Sicurezza</span>
                    <span className="font-bold text-green-500">3.2x</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Rischio Residuo</span>
                    <span className="font-bold text-yellow-500">Medio</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Costi Evitati</span>
                    <span className="font-bold text-green-500">€65K</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Business Continuity</span>
                    <span className="font-bold text-green-500">94%</span>
                  </div>
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
