import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  ClipboardCheck, 
  AlertTriangle, 
  CheckCircle, 
  Clock,
  FileText,
  TrendingUp,
  Target,
  Building2,
  Shield,
  AlertCircle,
  Filter,
  ArrowUpDown
} from 'lucide-react';
import { useOrganizationProfile } from '@/hooks/useOrganizationProfile';
import { NIS2_LABELS } from '@/types/organization';
import { useUserPreferences } from '@/hooks/useUserPreferences';

const Assessment: React.FC = () => {
  // Organization profile for NIS2 classification
  const { formData: orgProfile, loading: profileLoading } = useOrganizationProfile();

  // Persistent preferences
  const { preferences, updatePreferences } = useUserPreferences({
    preferenceKey: 'assessment_filters',
    defaultPreferences: {
      statusFilter: 'all',
      sortBy: 'name',
      sortOrder: 'asc',
    },
  });

  // Filter and sort states synced with preferences
  const [statusFilter, setStatusFilterState] = useState('all');
  const [sortBy, setSortByState] = useState('name');

  // Sync from preferences
  useEffect(() => {
    if (preferences.statusFilter) {
      setStatusFilterState(preferences.statusFilter as string);
    }
    if (preferences.sortBy) {
      setSortByState(preferences.sortBy as string);
    }
  }, [preferences.statusFilter, preferences.sortBy]);

  // Wrapper functions to persist preferences
  const setStatusFilter = (value: string) => {
    setStatusFilterState(value);
    updatePreferences({ statusFilter: value });
  };

  const setSortBy = (value: string) => {
    setSortByState(value);
    updatePreferences({ sortBy: value });
  };

  // Animated states
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const [animatedScore, setAnimatedScore] = useState(0);
  const [animatedCompleted, setAnimatedCompleted] = useState(0);
  const [animatedInProgress, setAnimatedInProgress] = useState(0);
  const [animatedNotStarted, setAnimatedNotStarted] = useState(0);
  const [animatedCategoryProgress, setAnimatedCategoryProgress] = useState<number[]>([]);
  const [animatedCategoryScores, setAnimatedCategoryScores] = useState<number[]>([]);
  const [animationsStarted, setAnimationsStarted] = useState(false);

  const getNIS2Badge = () => {
    if (!orgProfile.nis2_classification) return null;
    
    const badgeColors: Record<string, string> = {
      essential: 'bg-red-500/10 text-red-500 border-red-500/20',
      important: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
      none: 'bg-muted text-muted-foreground border-border'
    };

    return (
      <Badge variant="outline" className={badgeColors[orgProfile.nis2_classification]}>
        {NIS2_LABELS[orgProfile.nis2_classification]}
      </Badge>
    );
  };

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
      score: 25 
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
      completed: 1, 
      status: 'in_progress',
      score: 30
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
      completed: 1, 
      status: 'in_progress',
      score: 35 
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
      completed: 1, 
      status: 'in_progress',
      score: 40 
    },
  ];

  // Filter and sort categories based on preferences
  const filteredAndSortedCategories = assessmentCategories
    .filter(cat => statusFilter === 'all' || cat.status === statusFilter)
    .sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name);
      } else if (sortBy === 'score') {
        return b.score - a.score;
      } else if (sortBy === 'progress') {
        const progressA = a.completed / a.questions;
        const progressB = b.completed / b.questions;
        return progressB - progressA;
      } else if (sortBy === 'status') {
        const statusOrder = { 'not_started': 0, 'in_progress': 1, 'completed': 2 };
        return statusOrder[a.status as keyof typeof statusOrder] - statusOrder[b.status as keyof typeof statusOrder];
      }
      return 0;
    });

  const getRiskLevel = (score: number) => {
    if (score >= 71) return { level: 'Basso', color: 'text-green-500' };
    if (score >= 41) return { level: 'Medio', color: 'text-yellow-500' };
    return { level: 'Alto', color: 'text-red-500' };
  };

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

  // Animation function
  const animateValue = (
    startValue: number,
    endValue: number,
    setter: React.Dispatch<React.SetStateAction<number>>,
    duration: number = 2000
  ) => {
    const startTime = Date.now();
    const animate = () => {
      const currentTime = Date.now();
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function for smooth animation
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      const currentValue = Math.round(startValue + (endValue - startValue) * easeOutQuart);
      
      setter(currentValue);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  };

  // Animation for arrays
  const animateArray = (
    endValues: number[],
    setter: React.Dispatch<React.SetStateAction<number[]>>,
    duration: number = 2000
  ) => {
    const startTime = Date.now();
    const startValues = new Array(endValues.length).fill(0);
    
    const animate = () => {
      const currentTime = Date.now();
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      const currentValues = endValues.map((endValue, index) => 
        Math.round(startValues[index] + (endValue - startValues[index]) * easeOutQuart)
      );
      
      setter(currentValues);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  };

  // Start animations on component mount - only once
  useEffect(() => {
    // Prevent animations from running multiple times
    if (animationsStarted) return;

    const timer = setTimeout(() => {
      setAnimationsStarted(true);
      
      // Animate main metrics
      animateValue(0, overallProgress, setAnimatedProgress, 2000);
      animateValue(0, overallScore, setAnimatedScore, 2200);
      animateValue(0, assessmentCategories.filter(c => c.status === 'completed').length, setAnimatedCompleted, 1800);
      animateValue(0, assessmentCategories.filter(c => c.status === 'in_progress').length, setAnimatedInProgress, 2100);
      animateValue(0, assessmentCategories.filter(c => c.status === 'not_started').length, setAnimatedNotStarted, 1900);
      
      // Animate category progress bars
      const categoryProgressValues = assessmentCategories.map(cat => (cat.completed / cat.questions) * 100);
      animateArray(categoryProgressValues, setAnimatedCategoryProgress, 2500);
      
      // Animate category scores
      const categoryScoreValues = assessmentCategories.map(cat => cat.score);
      animateArray(categoryScoreValues, setAnimatedCategoryScores, 2300);
    }, 300); // Small delay before starting animations

    return () => clearTimeout(timer);
  }, []); // Empty dependency array ensures this runs only once

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Assessment NIS2/NIST/ISO</h1>
            <p className="text-muted-foreground">
              Valutazione conformità direttiva e best practices NIS2/NIST/ISO
            </p>
          </div>
          <Button className="bg-primary text-primary-foreground">
            <FileText className="w-4 h-4 mr-2" />
            Genera Report
          </Button>
        </div>

        {/* Organization Profile Banner */}
        {!profileLoading && (orgProfile.legal_name || orgProfile.nis2_classification) && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Building2 className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">
                      {orgProfile.legal_name || 'Azienda non configurata'}
                    </h3>
                    {orgProfile.business_sector && (
                      <p className="text-sm text-muted-foreground">{orgProfile.business_sector}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {orgProfile.nis2_classification ? (
                    <div className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-primary" />
                      <span className="text-sm font-medium">Classificazione NIS2:</span>
                      {getNIS2Badge()}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-amber-500">
                      <AlertCircle className="h-5 w-5" />
                      <span className="text-sm">Classificazione NIS2 non impostata</span>
                      <Button variant="outline" size="sm" asChild>
                        <a href="/incident-response">Configura</a>
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Assessment Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Progresso Globale</p>
                  <p className="text-2xl font-bold text-foreground">{animatedProgress}%</p>
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
                  <p className="text-2xl font-bold text-yellow-500">{animatedScore}/100</p>
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
                    {animatedCompleted}
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
                  <span>{animatedProgress}%</span>
                </div>
                <Progress value={animatedProgress} className="h-2" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-500">
                    {animatedCompleted}
                  </div>
                  <div className="text-sm text-muted-foreground">Aree Completate</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-500">
                    {animatedInProgress}
                  </div>
                  <div className="text-sm text-muted-foreground">In Corso</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-500">
                    {animatedNotStarted}
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
            <div className="flex items-center justify-between">
              <CardTitle>Categorie Assessment</CardTitle>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-muted-foreground" />
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[140px] h-8 text-xs">
                      <SelectValue placeholder="Stato" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tutti gli stati</SelectItem>
                      <SelectItem value="completed">Completati</SelectItem>
                      <SelectItem value="in_progress">In Corso</SelectItem>
                      <SelectItem value="not_started">Non Iniziati</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="w-[130px] h-8 text-xs">
                      <SelectValue placeholder="Ordina" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name">Nome</SelectItem>
                      <SelectItem value="score">Punteggio</SelectItem>
                      <SelectItem value="progress">Progresso</SelectItem>
                      <SelectItem value="status">Stato</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            {statusFilter !== 'all' && (
              <p className="text-sm text-muted-foreground mt-2">
                Mostrando {filteredAndSortedCategories.length} di {assessmentCategories.length} categorie
              </p>
            )}
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredAndSortedCategories.map((category, index) => {
                // Find original index for animation values
                const originalIndex = assessmentCategories.findIndex(c => c.name === category.name);
                return (
                  <div key={category.name} className="flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors">
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
                            value={animatedCategoryProgress[originalIndex] || 0} 
                            className="h-1.5 w-48" 
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <div className="text-sm font-medium">Punteggio: {animatedCategoryScores[originalIndex] || 0}/100</div>
                        <div className={`text-xs font-medium ${getRiskLevel(category.score).color}`}>
                          Rischio: {getRiskLevel(category.score).level}
                        </div>
                        <div className="flex items-center space-x-1 mt-1">
                          {getStatusIcon(category.status)}
                          <Badge variant={getStatusBadge(category.status) as any}>
                            {getStatusText(category.status)}
                          </Badge>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">
                        <FileText className="w-4 h-4 mr-1" />
                        Modifica
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Assessment;