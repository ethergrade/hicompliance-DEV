import React, { useState } from 'react';
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
  Euro
} from 'lucide-react';

const Remediation: React.FC = () => {
  const [selectedTimeframe, setSelectedTimeframe] = useState('90days');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newRemediation, setNewRemediation] = useState({
    category: '',
    priority: '',
    description: '',
    estimatedDays: '',
    estimatedBudget: '',
    assignedTeam: '',
    complexity: 'medium'
  });

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
      budget: '€8,500'
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
      budget: '€9,000'
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
      budget: '€3,000'
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
      budget: '€3,000'
    }
  ];

  // Azioni GANTT
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
      dependencies: []
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
      dependencies: []
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
      dependencies: []
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
      dependencies: []
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
      dependencies: []
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

  const handleCreateRemediation = () => {
    const estimatedDays = newRemediation.estimatedDays || calculateDays(newRemediation.complexity, newRemediation.category);
    const estimatedBudget = newRemediation.estimatedBudget || calculateBudget(Number(estimatedDays), newRemediation.complexity);
    
    console.log('Creating remediation:', {
      ...newRemediation,
      estimatedDays,
      estimatedBudget: `€${estimatedBudget.toLocaleString()}`
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
  };

  // Metriche actionable
  const actionableMetrics = {
    totalBudget: '€23,500',
    estimatedCompletion: '90 giorni',
    riskReduction: '60%',
    complianceImprovement: '55%',
    criticalIssues: 4,
    highPriorityActions: 6
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
            {/* GANTT Chart Semplificato */}
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Calendar className="w-5 h-5 mr-2 text-primary" />
                  GANTT Operativo - Azioni Prioritarie
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground border-b pb-2">
                    <div className="col-span-4">Attività</div>
                    <div className="col-span-2">Assegnatario</div>
                    <div className="col-span-2">Data Inizio</div>
                    <div className="col-span-2">Data Fine</div>
                    <div className="col-span-1">Progresso</div>
                    <div className="col-span-1">Priorità</div>
                  </div>
                  
                  {ganttActions.map((action) => (
                    <div key={action.id} className="grid grid-cols-12 gap-2 items-center py-2 border-b border-border/50">
                      <div className="col-span-4">
                        <div className="font-medium text-sm">{action.task}</div>
                        <div className="text-xs text-muted-foreground">{action.category}</div>
                      </div>
                      <div className="col-span-2 text-sm">{action.assignee}</div>
                      <div className="col-span-2 text-sm">{action.startDate}</div>
                      <div className="col-span-2 text-sm">{action.endDate}</div>
                      <div className="col-span-1">
                        <div className="flex items-center space-x-1">
                          <div className="w-8 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className={`h-full transition-all duration-300 ${getProgressColor(action.progress)}`}
                              style={{ width: `${action.progress}%` }}
                            />
                          </div>
                          <span className="text-xs">{action.progress}%</span>
                        </div>
                      </div>
                      <div className="col-span-1">
                        <Badge variant={getPriorityColor(action.priority) as any} className="text-xs">
                          {action.priority}
                        </Badge>
                      </div>
                    </div>
                  ))}
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