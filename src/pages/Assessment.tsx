import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  ClipboardCheck, 
  AlertTriangle, 
  CheckCircle, 
  Clock,
  FileText,
  TrendingUp,
  Users,
  Target
} from 'lucide-react';

const Assessment: React.FC = () => {
  const assessmentCategories = [
    { 
      name: 'Business Continuity, Disaster recovery, Backup', 
      questions: 25, 
      completed: 18, 
      status: 'in_progress',
      score: 72 
    },
    { 
      name: 'Certificazioni', 
      questions: 20, 
      completed: 20, 
      status: 'completed',
      score: 85 
    },
    { 
      name: 'Crittografia', 
      questions: 22, 
      completed: 12, 
      status: 'in_progress',
      score: 60 
    },
    { 
      name: 'Gestione delle identità Gestione degli accessi', 
      questions: 28, 
      completed: 5, 
      status: 'not_started',
      score: 33 
    },
    { 
      name: 'Gestione degli incidenti', 
      questions: 18, 
      completed: 18, 
      status: 'completed',
      score: 78 
    },
    { 
      name: 'Gestione del rischio', 
      questions: 24, 
      completed: 12, 
      status: 'in_progress',
      score: 65 
    },
    { 
      name: 'Gestione delle risorse', 
      questions: 16, 
      completed: 8, 
      status: 'in_progress',
      score: 55 
    },
    { 
      name: 'Gestione fornitori e acquisti', 
      questions: 19, 
      completed: 0, 
      status: 'not_started',
      score: 0 
    },
    { 
      name: 'Governance', 
      questions: 21, 
      completed: 21, 
      status: 'completed',
      score: 88 
    },
    { 
      name: 'HR e formazione', 
      questions: 15, 
      completed: 10, 
      status: 'in_progress',
      score: 70 
    },
    { 
      name: 'Igiene informatica', 
      questions: 26, 
      completed: 15, 
      status: 'in_progress',
      score: 62 
    },
    { 
      name: 'Manutenzione e miglioramento continuo', 
      questions: 17, 
      completed: 0, 
      status: 'not_started',
      score: 0 
    },
    { 
      name: 'Network Security Best Practices & Operations', 
      questions: 30, 
      completed: 25, 
      status: 'in_progress',
      score: 82 
    },
    { 
      name: 'Sviluppo software', 
      questions: 23, 
      completed: 0, 
      status: 'not_started',
      score: 0 
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-500';
      case 'in_progress': return 'text-yellow-500';
      case 'not_started': return 'text-gray-500';
      default: return 'text-gray-500';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed': return 'default';
      case 'in_progress': return 'secondary';
      case 'not_started': return 'outline';
      default: return 'outline';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed': return 'Completato';
      case 'in_progress': return 'In Corso';
      case 'not_started': return 'Non Iniziato';
      default: return 'Sconosciuto';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'in_progress': return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'not_started': return <AlertTriangle className="w-4 h-4 text-gray-500" />;
      default: return <AlertTriangle className="w-4 h-4 text-gray-500" />;
    }
  };

  const overallProgress = Math.round(
    (assessmentCategories.reduce((acc, cat) => acc + cat.completed, 0) / 
     assessmentCategories.reduce((acc, cat) => acc + cat.questions, 0)) * 100
  );

  const overallScore = Math.round(
    assessmentCategories.reduce((acc, cat) => acc + cat.score, 0) / assessmentCategories.length
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Assessment NIS2</h1>
            <p className="text-muted-foreground">
              Valutazione della conformità alla direttiva NIS2
            </p>
          </div>
          <Button className="bg-primary text-primary-foreground">
            <FileText className="w-4 h-4 mr-2" />
            Genera Report
          </Button>
        </div>

        {/* Assessment Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Progresso Globale</p>
                  <p className="text-2xl font-bold text-foreground">{overallProgress}%</p>
                </div>
                <TrendingUp className="w-8 h-8 text-primary" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Punteggio Conformità</p>
                  <p className="text-2xl font-bold text-yellow-500">{overallScore}/100</p>
                </div>
                <Target className="w-8 h-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Aree Completate</p>
                  <p className="text-2xl font-bold text-green-500">
                    {assessmentCategories.filter(c => c.status === 'completed').length}
                  </p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Ultimo Aggiornamento</p>
                  <p className="text-sm font-medium text-foreground">Oggi</p>
                </div>
                <Clock className="w-8 h-8 text-primary" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Progress Overview */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle>Stato Complessivo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Progresso Assessment</span>
                  <span>{overallProgress}%</span>
                </div>
                <Progress value={overallProgress} className="h-2" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-500">
                    {assessmentCategories.filter(c => c.status === 'completed').length}
                  </div>
                  <div className="text-sm text-muted-foreground">Aree Completate</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-500">
                    {assessmentCategories.filter(c => c.status === 'in_progress').length}
                  </div>
                  <div className="text-sm text-muted-foreground">In Corso</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-500">
                    {assessmentCategories.filter(c => c.status === 'not_started').length}
                  </div>
                  <div className="text-sm text-muted-foreground">Da Iniziare</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Assessment Categories */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle>Categorie Assessment</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {assessmentCategories.map((category, index) => (
                <div key={index} className="flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors">
                  <div className="flex items-center space-x-4">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <ClipboardCheck className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium">{category.name}</h4>
                      <p className="text-sm text-muted-foreground">
                        {category.completed}/{category.questions} domande completate
                      </p>
                      <div className="mt-2">
                        <Progress 
                          value={(category.completed / category.questions) * 100} 
                          className="h-1.5 w-48" 
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <div className="text-sm font-medium">Punteggio: {category.score}/100</div>
                      <div className="flex items-center space-x-1">
                        {getStatusIcon(category.status)}
                        <Badge variant={getStatusBadge(category.status) as any}>
                          {getStatusText(category.status)}
                        </Badge>
                      </div>
                    </div>
                    <Button variant="outline" size="sm">
                      <FileText className="w-4 h-4 mr-1" />
                      Continua
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Assessment;