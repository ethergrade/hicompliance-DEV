import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Calendar, Clock, AlertTriangle, CheckCircle, BarChart3, Target, DollarSign, Users, MoreHorizontal, Trash2, Bot, Library } from 'lucide-react';
import { useRemediationTasks, type RemediationTask, type GanttTask } from '@/hooks/useRemediationTasks';
import { useRemediationTemplates } from '@/hooks/useRemediationTemplates';
import { useAssessmentGapAnalysis } from '@/hooks/useAssessmentGapAnalysis';
import { TemplateSelectionModal } from '@/components/remediation/TemplateSelectionModal';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const Remediation: React.FC = () => {
  const [selectedTimeframe, setSelectedTimeframe] = useState('3months');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [draggedTask, setDraggedTask] = useState<string | null>(null);
  const [resizingTask, setResizingTask] = useState<{ taskId: string; side: 'left' | 'right' } | null>(null);
  const [newRemediation, setNewRemediation] = useState({
    task: '',
    category: '',
    assignee: '',
    priority: 'medium',
    estimatedDays: 14,
    description: ''
  });

  const { 
    tasks, 
    loading, 
    createTask, 
    updateTask, 
    deleteTask, 
    updateTaskDates, 
    reorderTasks 
  } = useRemediationTasks();

  const { templates, getCategories } = useRemediationTemplates();
  const { generateAutomaticPlan } = useAssessmentGapAnalysis();
  const { toast } = useToast();

  // Initialize task order when tasks are loaded
  useEffect(() => {
    if (tasks.length > 0) {
      const sortedTasks = [...tasks].sort((a, b) => 
        new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
      );
    }
  }, [tasks]);

  const criticalCategories = [
    {
      category: "Network Security",
      criticalCount: 8,
      totalCount: 15,
      urgentIssues: ["Unpatched SSL vulnerabilities", "Open RDP ports", "Weak firewall rules"],
      averageRemediation: "7 days",
      estimatedCost: "$12,000"
    },
    {
      category: "Identity Management", 
      criticalCount: 12,
      totalCount: 20,
      urgentIssues: ["Privileged accounts without MFA", "Dormant user accounts", "Weak password policies"],
      averageRemediation: "5 days",
      estimatedCost: "$8,500"
    },
    {
      category: "Data Protection",
      criticalCount: 6,
      totalCount: 18,
      urgentIssues: ["Unencrypted sensitive data", "Missing backup verification", "Data retention violations"],
      averageRemediation: "10 days",
      estimatedCost: "$15,000"
    },
    {
      category: "Endpoint Security",
      criticalCount: 9,
      totalCount: 25,
      urgentIssues: ["Outdated antivirus definitions", "Unmanaged devices", "Missing endpoint encryption"],
      averageRemediation: "4 days",
      estimatedCost: "$6,000"
    },
    {
      category: "Business Continuity",
      criticalCount: 4,
      totalCount: 12,
      urgentIssues: ["Outdated disaster recovery plan", "Untested backup systems", "Missing incident response procedures"],
      averageRemediation: "14 days",
      estimatedCost: "$20,000"
    },
    {
      category: "Awareness",
      criticalCount: 3,
      totalCount: 8,
      urgentIssues: ["Outdated security training", "Phishing simulation failures", "Policy compliance gaps"],
      averageRemediation: "21 days",
      estimatedCost: "$5,000"
    }
  ];

  const getRiskColor = (level: string): string => {
    switch (level.toLowerCase()) {
      case 'critical': case 'critico': return 'text-red-500';
      case 'high': case 'alto': return 'text-orange-500';
      case 'medium': case 'medio': return 'text-yellow-500';
      case 'low': case 'basso': return 'text-green-500';
      default: return 'text-gray-500';
    }
  };

  const getPriorityColor = (priority: string): "default" | "destructive" | "outline" | "secondary" => {
    switch (priority.toLowerCase()) {
      case 'critical': case 'critico': return 'destructive';
      case 'high': case 'alto': return 'destructive';
      case 'medium': case 'medio': return 'default';
      case 'low': case 'basso': return 'secondary';
      default: return 'outline';
    }
  };

  const getProgressColor = (progress: number): string => {
    if (progress >= 70) return 'bg-green-500';
    if (progress >= 40) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const calculateBudget = (days: number, complexity: string): number => {
    const baseCost = days * 500; // $500 per day base cost
    const multiplier = complexity === 'high' ? 1.5 : complexity === 'medium' ? 1.2 : 1.0;
    return Math.round(baseCost * multiplier);
  };

  const calculateDays = (complexity: string, categoryType: string): number => {
    const baseDays = categoryType === 'Network Security' ? 14 : 
                     categoryType === 'Identity Management' ? 10 : 
                     categoryType === 'Data Protection' ? 21 : 7;
    const multiplier = complexity === 'high' ? 1.5 : complexity === 'medium' ? 1.2 : 1.0;
    return Math.round(baseDays * multiplier);
  };

  const handleCreateRemediation = async () => {
    try {
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(startDate.getDate() + newRemediation.estimatedDays);
      
      await createTask({
        task: newRemediation.task,
        category: newRemediation.category,
        assignee: newRemediation.assignee,
        priority: newRemediation.priority,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        progress: 0,
        dependencies: [],
        color: getPriorityColor(newRemediation.priority) === 'destructive' ? '#ef4444' : 
               getPriorityColor(newRemediation.priority) === 'default' ? '#3b82f6' : '#22c55e'
      });
      
      // Reset form
      setNewRemediation({
        task: '',
        category: '',
        assignee: '',
        priority: 'medium',
        estimatedDays: 14,
        description: ''
      });
      
      setShowCreateModal(false);
    } catch (error) {
      console.error('Error creating task:', error);
    }
  };

  const handleSelectTemplate = async (template: any) => {
    try {
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(startDate.getDate() + template.estimated_days);

      await createTask({
        task: template.task_name,
        category: template.category,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        progress: 0,
        assignee: null,
        priority: template.priority,
        dependencies: template.dependencies,
        color: '#3b82f6'
      });
    } catch (error) {
      console.error("Error creating task from template:", error);
    }
  };

  const handleGenerateAutomaticPlan = async () => {
    try {
      // Get current user's organization
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('organization_id')
        .eq('auth_user_id', (await supabase.auth.getUser()).data.user?.id)
        .single();

      if (userError || !userData?.organization_id) {
        toast({
          title: "Errore",
          description: "Utente non autenticato o organizzazione non trovata",
          variant: "destructive",
        });
        return;
      }

      const recommendedTemplates = await generateAutomaticPlan(userData.organization_id, templates);
      
      // Create tasks from recommended templates
      for (const template of recommendedTemplates) {
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(startDate.getDate() + template.estimated_days);

        await createTask({
          task: template.task_name,
          category: template.category,
          start_date: startDate.toISOString().split('T')[0],
          end_date: endDate.toISOString().split('T')[0],
          progress: 0,
          assignee: null,
          priority: template.priority,
          dependencies: template.dependencies,
          color: '#3b82f6'
        });

        // Add some delay between tasks to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error("Error generating automatic plan:", error);
    }
  };

  const handleDragStart = (taskId: string) => {
    setDraggedTask(taskId);
  };

  const handleDragOver = (e: React.DragEvent, taskId: string) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, targetTaskId: string) => {
    e.preventDefault();
    
    if (draggedTask === null || draggedTask === targetTaskId) return;
    
    const currentOrder = tasks.map(t => t.id);
    const draggedIndex = currentOrder.indexOf(draggedTask);
    const targetIndex = currentOrder.indexOf(targetTaskId);
    
    if (draggedIndex !== -1 && targetIndex !== -1) {
      const newOrder = [...currentOrder];
      newOrder.splice(draggedIndex, 1);
      newOrder.splice(targetIndex, 0, draggedTask);
      
      await reorderTasks(newOrder);
    }
    
    setDraggedTask(null);
  };

  const handleResizeStart = (e: React.MouseEvent, taskId: string, side: 'left' | 'right') => {
    e.preventDefault();
    setResizingTask({ taskId, side });
  };

  const handleDeleteTask = async (taskId: string) => {
    if (confirm('Sei sicuro di voler eliminare questa attività?')) {
      await deleteTask(taskId);
    }
  };

  const getGanttData = (): GanttTask[] => {
    if (tasks.length === 0) return [];
    
    // Find the earliest start date
    const earliestDate = new Date(Math.min(...tasks.map(t => new Date(t.start_date).getTime())));
    
    return tasks.map(task => {
      const startDate = new Date(task.start_date);
      const endDate = new Date(task.end_date);
      
      const startDiff = Math.ceil((startDate.getTime() - earliestDate.getTime()) / (1000 * 60 * 60 * 24));
      const duration = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const progressWidth = (task.progress / 100) * 100;
      
      return {
        ...task,
        offsetDays: Math.max(0, startDiff),
        durationDays: duration,
        progressWidth
      };
    });
  };

  const generateWeeks = () => {
    const weeks = [];
    const currentDate = new Date();
    
    for (let i = 0; i < 12; i++) {
      const weekDate = new Date(currentDate);
      weekDate.setDate(currentDate.getDate() + (i * 7));
      weeks.push({
        label: `W${i + 1}`,
        date: weekDate
      });
    }
    return weeks;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Piano di Remediation</h1>
            <p className="text-muted-foreground">
              Gestione delle attività di remediation
            </p>
          </div>
          
          <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowTemplateModal(true)}
                  >
                    <Library className="h-4 w-4 mr-2" />
                    Da Template
                  </Button>
                  
                  <Button
                    variant="outline"
                    onClick={handleGenerateAutomaticPlan}
                  >
                    <Bot className="h-4 w-4 mr-2" />
                    Piano Automatico
                  </Button>

                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Nuova Attività
                    </Button>
                  </DialogTrigger>
                </div>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Crea Nuova Attività di Remediation</DialogTitle>
                <DialogDescription>
                  Aggiungi una nuova attività di remediation
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="task">Nome Attività</Label>
                  <Input
                    id="task"
                    value={newRemediation.task}
                    onChange={(e) => setNewRemediation(prev => ({
                      ...prev,
                      task: e.target.value
                    }))}
                    placeholder="es. Implementazione MFA"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="category">Categoria</Label>
                    <Select 
                      value={newRemediation.category} 
                      onValueChange={(value) => setNewRemediation(prev => ({
                        ...prev,
                        category: value
                      }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        {getCategories().map((category) => (
                          <SelectItem key={category} value={category}>
                            {category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="priority">Priorità</Label>
                    <Select 
                      value={newRemediation.priority} 
                      onValueChange={(value) => setNewRemediation(prev => ({
                        ...prev,
                        priority: value
                      }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona priorità" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="critical">Critica</SelectItem>
                        <SelectItem value="high">Alta</SelectItem>
                        <SelectItem value="medium">Media</SelectItem>
                        <SelectItem value="low">Bassa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="assignee">Assegnato a</Label>
                    <Input
                      id="assignee"
                      value={newRemediation.assignee}
                      onChange={(e) => setNewRemediation(prev => ({
                        ...prev,
                        assignee: e.target.value
                      }))}
                      placeholder="es. IT Security Team"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="estimatedDays">Giorni Stimati</Label>
                    <Input
                      id="estimatedDays"
                      type="number"
                      min="1"
                      value={newRemediation.estimatedDays}
                      onChange={(e) => setNewRemediation(prev => ({
                        ...prev,
                        estimatedDays: parseInt(e.target.value) || 14
                      }))}
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="description">Descrizione</Label>
                  <Textarea
                    id="description"
                    value={newRemediation.description}
                    onChange={(e) => setNewRemediation(prev => ({
                      ...prev,
                      description: e.target.value
                    }))}
                    placeholder="Descrizione dettagliata dell'attività..."
                    rows={3}
                  />
                </div>
                
                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                    Annulla
                  </Button>
                  <Button onClick={handleCreateRemediation} disabled={!newRemediation.task || !newRemediation.category}>
                    Crea Attività
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <TemplateSelectionModal
            open={showTemplateModal}
            onOpenChange={setShowTemplateModal}
            onSelectTemplate={handleSelectTemplate}
          />
        </div>

        {/* Executive Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Attività Totali</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{tasks.length}</div>
              <p className="text-xs text-muted-foreground">
                {tasks.filter(t => t.progress === 100).length} completate
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Corso</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {tasks.filter(t => t.progress > 0 && t.progress < 100).length}
              </div>
              <p className="text-xs text-muted-foreground">Attività attive</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Critiche</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {tasks.filter(t => t.priority === 'critical' && t.progress < 100).length}
              </div>
              <p className="text-xs text-muted-foreground">Priorità alta</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Progresso</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {tasks.length > 0 ? Math.round((tasks.filter(t => t.progress === 100).length / tasks.length) * 100) : 0}%
              </div>
              <Progress 
                value={tasks.length > 0 ? (tasks.filter(t => t.progress === 100).length / tasks.length) * 100 : 0} 
                className="mt-2" 
              />
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Panoramica</TabsTrigger>
            <TabsTrigger value="gantt">GANTT</TabsTrigger>
            <TabsTrigger value="metrics">Metriche</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {criticalCategories.map((category, index) => (
                <Card key={index}>
                  <CardHeader>
                    <CardTitle className="text-lg">{category.category}</CardTitle>
                    <CardDescription>
                      {category.criticalCount} vulnerabilità critiche da risolvere
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Progresso</span>
                      <span className="text-sm text-muted-foreground">
                        {category.criticalCount}/{category.totalCount}
                      </span>
                    </div>
                    <Progress value={(category.criticalCount / category.totalCount) * 100} />
                    
                    <div className="space-y-2">
                      <span className="text-sm font-medium">Problemi urgenti:</span>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        {category.urgentIssues.map((issue, issueIndex) => (
                          <li key={issueIndex} className="flex items-start">
                            <span className="w-1 h-1 bg-red-500 rounded-full mt-2 mr-2 flex-shrink-0" />
                            {issue}
                          </li>
                        ))}
                      </ul>
                    </div>
                    
                    <div className="flex justify-between items-center pt-4 border-t">
                      <div className="text-center">
                        <div className="text-sm font-medium">{category.averageRemediation}</div>
                        <div className="text-xs text-muted-foreground">Tempo medio</div>
                      </div>
                      <div className="text-center">
                        <div className="text-sm font-medium">{category.estimatedCost}</div>
                        <div className="text-xs text-muted-foreground">Costo stimato</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="gantt" className="space-y-6">
            {loading ? (
              <div className="text-center py-8">
                <div className="text-sm text-muted-foreground">Caricamento attività...</div>
              </div>
            ) : (
              <div className="bg-white dark:bg-card p-6 rounded-lg border">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold">Timeline delle Attività</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Settimane:</span>
                    {generateWeeks().map((week, index) => (
                      <div key={index} className="text-xs text-center">
                        <div className="font-medium">{week.label}</div>
                        <div className="text-muted-foreground">{week.date.getDate()}</div>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="space-y-2">
                  {getGanttData().map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-4 p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors"
                      draggable
                      onDragStart={() => handleDragStart(item.id)}
                      onDragOver={(e) => handleDragOver(e, item.id)}
                      onDrop={(e) => handleDrop(e, item.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{item.task}</div>
                        <div className="text-xs text-muted-foreground">{item.assignee}</div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Badge variant={getPriorityColor(item.priority)}>
                          {item.priority}
                        </Badge>
                        <span className="text-xs text-muted-foreground w-16 text-right">
                          {item.progress}% done
                        </span>
                      </div>
                      
                      <div className="relative w-96 h-8 bg-muted rounded">
                        <div
                          className="absolute top-0 h-full rounded"
                          style={{
                            left: `${(item.offsetDays / 90) * 100}%`,
                            width: `${(item.durationDays / 90) * 100}%`,
                            backgroundColor: item.color,
                            opacity: 0.7
                          }}
                        >
                          <div
                            className="h-full rounded"
                            style={{
                              width: `${item.progressWidth}%`,
                              backgroundColor: item.color
                            }}
                          />
                          
                          {/* Resize handles */}
                          <div
                            className="absolute left-0 top-0 w-2 h-full cursor-w-resize bg-black/20 rounded-l opacity-0 hover:opacity-100 transition-opacity"
                            onMouseDown={(e) => handleResizeStart(e, item.id, 'left')}
                          />
                          <div
                            className="absolute right-0 top-0 w-2 h-full cursor-e-resize bg-black/20 rounded-r opacity-0 hover:opacity-100 transition-opacity"
                            onMouseDown={(e) => handleResizeStart(e, item.id, 'right')}
                          />
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-700"
                          onClick={() => handleDeleteTask(item.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  
                  {tasks.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <div className="text-sm">Nessuna attività trovata.</div>
                      <div className="text-xs mt-1">Crea la tua prima attività di remediation.</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="metrics" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <BarChart3 className="h-5 w-5 mr-2" />
                    KPI IT
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Attività completate</span>
                      <span className="font-medium">{tasks.filter(t => t.progress === 100).length}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Tempo medio remediation</span>
                      <span className="font-medium">12 giorni</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Efficienza del team</span>
                      <span className="font-medium">85%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Users className="h-5 w-5 mr-2" />
                    KPI Compliance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Conformità raggiunta</span>
                      <span className="font-medium">78%</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Gap critici risolti</span>
                      <span className="font-medium">{tasks.filter(t => t.priority === 'critical' && t.progress === 100).length}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Audit readiness</span>
                      <span className="font-medium">Good</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <DollarSign className="h-5 w-5 mr-2" />
                    KPI Executive
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Riduzione del rischio</span>
                      <span className="font-medium">65%</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Budget utilizzato</span>
                      <span className="font-medium">€45,000</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">ROI sicurezza</span>
                      <span className="font-medium">3.2x</span>
                    </div>
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