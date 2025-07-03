import React, { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  CalendarDays
} from 'lucide-react';

const Remediation: React.FC = () => {
  const [selectedTimeframe, setSelectedTimeframe] = useState('90days');

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
      budget: '€25,000'
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
      budget: '€35,000'
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
      budget: '€15,000'
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
      budget: '€20,000'
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

  // Metriche actionable
  const actionableMetrics = {
    totalBudget: '€95,000',
    estimatedCompletion: '120 giorni',
    riskReduction: '75%',
    complianceImprovement: '65%',
    criticalIssues: 4,
    highPriorityActions: 8
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
                    <span className="font-bold text-green-500">€180K</span>
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