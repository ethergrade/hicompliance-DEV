import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useClientContext } from '@/contexts/ClientContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts';
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
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useOrganizationProfile } from '@/hooks/useOrganizationProfile';
import { NIS2_LABELS } from '@/types/organization';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { ASSESSMENT_CATEGORIES, AssessmentResponse, RESPONSE_LABELS, RESPONSE_COLORS, calculateCategoryScore, getRiskFromScore, CATEGORY_DESCRIPTIONS } from '@/data/assessmentQuestions';
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// Map UI response values to DB enum values and vice versa
const UI_TO_DB_STATUS: Record<string, string> = {
  completato: 'completed',
  pianificato_in_corso: 'planned_in_progress',
  non_iniziato: 'not_started',
  non_applicabile: 'not_applicable',
};
const DB_TO_UI_STATUS: Record<string, AssessmentResponse> = {
  completed: 'completato',
  planned_in_progress: 'pianificato_in_corso',
  not_started: 'non_iniziato',
  not_applicable: 'non_applicabile',
};


type RadarYearRange = '1y' | '2y' | '3y' | '4y';
const RADAR_YEAR_DATA: Record<RadarYearRange, number[]> = {
  '1y': [72, 75, 68, 80, 65, 78, 73, 85, 62, 76, 71, 79, 83, 68],
  '2y': [58, 62, 55, 68, 50, 65, 60, 72, 48, 63, 58, 66, 70, 55],
  '3y': [45, 50, 42, 55, 38, 52, 48, 60, 35, 50, 45, 53, 57, 42],
  '4y': [30, 35, 28, 40, 25, 38, 32, 45, 20, 35, 30, 38, 42, 28],
};

const RADAR_TARGET_OFFSET = 15; // target is always +15 above compliance

const Assessment: React.FC = () => {
  // Question responses state: { [questionId]: response }
  const [responses, setResponses] = useState<Record<number, AssessmentResponse>>({});
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const toggleCategory = useCallback((name: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const setResponse = useCallback((questionId: number, value: AssessmentResponse) => {
    setResponses(prev => ({ ...prev, [questionId]: value }));
  }, []);

  // Compute counts per category from responses
  const getCategoryCounts = useCallback((categoryName: string) => {
    const cat = ASSESSMENT_CATEGORIES.find(c => c.name === categoryName);
    if (!cat) return { completato: 0, pianificato_in_corso: 0, non_iniziato: 0, non_applicabile: 0, unanswered: 0 };
    const counts = { completato: 0, pianificato_in_corso: 0, non_iniziato: 0, non_applicabile: 0, unanswered: 0 };
    cat.questions.forEach(q => {
      const r = responses[q.id];
      if (r && r in counts) counts[r as keyof typeof counts]++;
      else counts.unanswered++;
    });
    return counts;
  }, [responses]);

  const [radarYear, setRadarYear] = useState<RadarYearRange>('1y');

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

  const assessmentCategories = useMemo(() => {
    return ASSESSMENT_CATEGORIES.map(cat => {
      const counts = getCategoryCounts(cat.name);
      const answered = counts.completato + counts.pianificato_in_corso + counts.non_iniziato + counts.non_applicabile;
      const total = cat.questions.length;
      const status = answered === 0 ? 'not_started' : answered === total ? 'completed' : 'in_progress';
      const score = calculateCategoryScore(cat.questions, responses);
      const risk = getRiskFromScore(score);
      return {
        name: cat.name,
        questions: total,
        completed: answered,
        status,
        score,
        risk,
        counts,
      };
    });
  }, [getCategoryCounts, responses]);

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

  const overallScore = useMemo(() => {
    const catsWithAnswers = assessmentCategories.filter(c => c.completed > 0);
    if (catsWithAnswers.length === 0) return 0;
    return Math.round(catsWithAnswers.reduce((acc, cat) => acc + cat.score, 0) / catsWithAnswers.length);
  }, [assessmentCategories]);

  const overallRisk = useMemo(() => getRiskFromScore(overallScore), [overallScore]);

  const completedAreas = useMemo(() => assessmentCategories.filter(c => c.status === 'completed').length, [assessmentCategories]);

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
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <Select value={radarYear} onValueChange={(v) => setRadarYear(v as RadarYearRange)}>
                <SelectTrigger className="w-[130px] border-0 bg-transparent h-8 text-sm font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1y">2025 (1y)</SelectItem>
                  <SelectItem value="2y">2024 (2y)</SelectItem>
                  <SelectItem value="3y">2023 (3y)</SelectItem>
                  <SelectItem value="4y">2022 (4y)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="bg-primary text-primary-foreground">
              <FileText className="w-4 h-4 mr-2" />
              Genera Report
            </Button>
          </div>
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
                  <p className={`text-2xl font-bold ${overallRisk.color}`}>{overallScore}/100</p>
                </div>
                <Target className={`w-8 h-8 ${overallRisk.color}`} />
              </div>
              <p className={`text-xs mt-1 ${overallRisk.color}`}>Rischio: {overallRisk.label}</p>
            </CardContent>
          </Card>
          
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Aree Completate</p>
                  <p className="text-2xl font-bold text-green-500">
                    {completedAreas}/{assessmentCategories.length}
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
                    {completedAreas}
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

        {/* ── RADAR Chart NIS2/NIST/ISO Alignment ── */}
        <Card className="border-border">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <CardTitle>Allineamento NIS2 / NIST / ISO</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Evoluzione storica della conformità per categoria
                </p>
              </div>
              <div className="flex items-center gap-3">
                {/* Year pill selector */}
                <div className="flex items-center gap-1">
                  {(['1y', '2y', '3y', '4y'] as RadarYearRange[]).map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setRadarYear(opt)}
                      className={`px-2.5 py-0.5 rounded-full text-xs font-semibold transition-all duration-200 ${
                        radarYear === opt
                          ? 'bg-primary text-primary-foreground'
                          : 'border border-border text-muted-foreground hover:bg-muted/50'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-block w-3 h-0.5 bg-primary rounded" />
                  <span>Conformità</span>
                  <span className="inline-block w-3 h-0.5 rounded ml-2" style={{ backgroundColor: '#22c55e' }} />
                  <span>Target</span>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart
                  data={assessmentCategories.map((cat, i) => ({
                    category: cat.name.length > 18 ? cat.name.substring(0, 16) + '…' : cat.name,
                    fullName: cat.name,
                    compliance: RADAR_YEAR_DATA[radarYear][i] ?? 0,
                    target: Math.min((RADAR_YEAR_DATA[radarYear][i] ?? 0) + RADAR_TARGET_OFFSET, 100),
                  }))}
                  margin={{ top: 20, right: 60, bottom: 20, left: 60 }}
                >
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis
                    dataKey="category"
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <PolarRadiusAxis
                    angle={90}
                    domain={[0, 100]}
                    tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                    tickCount={5}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      color: 'hsl(var(--foreground))',
                    }}
                    formatter={(value: number, name: string, props: any) => [
                      `${value}/100`,
                      name === 'compliance' ? 'Conformità' : 'Target',
                    ]}
                    labelFormatter={(_: any, payload: any) =>
                      payload?.[0]?.payload?.fullName ?? ''
                    }
                  />
                  <Legend
                    formatter={(value) => value === 'compliance' ? 'Conformità Attuale' : 'Target'}
                    wrapperStyle={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))' }}
                  />
                  <Radar
                    name="compliance"
                    dataKey="compliance"
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary))"
                    fillOpacity={0.25}
                    strokeWidth={2}
                    isAnimationActive
                    animationDuration={600}
                  />
                  <Radar
                    name="target"
                    dataKey="target"
                    stroke="#22c55e"
                    fill="transparent"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    isAnimationActive
                    animationDuration={600}
                  />
                </RadarChart>
              </ResponsiveContainer>
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
            <div className="space-y-3">
              {filteredAndSortedCategories.map((category, index) => {
                const originalIndex = assessmentCategories.findIndex(c => c.name === category.name);
                const isExpanded = expandedCategories.has(category.name);
                const catData = ASSESSMENT_CATEGORIES.find(c => c.name === category.name);
                const counts = category.counts;

                return (
                  <div key={category.name} className="rounded-lg border border-border bg-card overflow-hidden">
                    {/* Category header - clickable */}
                    <div 
                      className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => toggleCategory(category.name)}
                    >
                      <div className="flex items-center space-x-4">
                        <div className="p-2 rounded-lg bg-primary/10">
                          {isExpanded ? <ChevronDown className="w-5 h-5 text-primary" /> : <ChevronRight className="w-5 h-5 text-primary" />}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium">{category.name}</h4>
                            {CATEGORY_DESCRIPTIONS[category.name] && (
                              <TooltipProvider>
                                <UITooltip>
                                  <TooltipTrigger asChild>
                                    <AlertCircle className="w-3.5 h-3.5 text-muted-foreground/60 hover:text-muted-foreground cursor-help shrink-0" />
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-xs text-xs">
                                    {CATEGORY_DESCRIPTIONS[category.name]}
                                  </TooltipContent>
                                </UITooltip>
                              </TooltipProvider>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {category.completed}/{category.questions} domande risposte
                          </p>
                          <div className="mt-2 flex items-center gap-4">
                            <Progress 
                              value={animatedCategoryProgress[originalIndex] || 0} 
                              className="h-1.5 w-48" 
                            />
                            <div className="flex items-center gap-2 text-xs">
                              <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-green-500" />
                                {counts.completato}
                              </span>
                              <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-yellow-500" />
                                {counts.pianificato_in_corso}
                              </span>
                              <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-red-500" />
                                {counts.non_iniziato}
                              </span>
                              <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-muted-foreground/40" />
                                {counts.non_applicabile}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        <div className="text-right">
                          <div className="text-sm font-medium">Punteggio: {category.score}/100</div>
                          <div className={`text-xs font-medium ${category.risk.color}`}>
                            Rischio: {category.risk.label}
                          </div>
                          <div className="flex items-center space-x-1 mt-1">
                            {getStatusIcon(category.status)}
                            <Badge variant={getStatusBadge(category.status) as any}>
                              {getStatusText(category.status)}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Expanded questions */}
                    {isExpanded && catData && (
                      <div className="border-t border-border bg-muted/20">
                        <div className="p-3 border-b border-border bg-muted/40">
                          <div className="grid grid-cols-[2rem_1fr_420px] gap-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2">
                            <span>#</span>
                            <span>Domanda</span>
                            <span className="text-center">Risposta</span>
                          </div>
                        </div>
                        <div className="divide-y divide-border">
                          {catData.questions.map((q, qi) => {
                            const currentResponse = responses[q.id] || null;
                            return (
                              <div key={q.id} className="grid grid-cols-[2rem_1fr_420px] gap-3 items-center px-5 py-3 hover:bg-muted/30 transition-colors">
                                <span className="text-xs text-muted-foreground font-mono">{qi + 1}</span>
                                <div className="flex items-start gap-2">
                                  <span className="text-sm text-foreground leading-relaxed">{q.question}</span>
                                  {q.priority === 'ALTA' && (
                                    <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0 bg-red-500/10 text-red-500 border-red-500/20">ALTA</Badge>
                                  )}
                                  {q.priority === 'BASSA' && (
                                    <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0 bg-blue-500/10 text-blue-500 border-blue-500/20">BASSA</Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  {([
                                    { value: 'completato', label: 'Completato', activeClass: 'bg-green-500 text-white border-green-600' },
                                    { value: 'pianificato_in_corso', label: 'Pianificato', activeClass: 'bg-yellow-500 text-white border-yellow-600' },
                                    { value: 'non_iniziato', label: 'Non iniziato', activeClass: 'bg-red-500 text-white border-red-600' },
                                    { value: 'non_applicabile', label: 'N/A', activeClass: 'bg-muted-foreground/60 text-white border-muted-foreground/60' },
                                  ] as const).map(opt => {
                                    const isActive = currentResponse === opt.value;
                                    return (
                                      <button
                                        key={opt.value}
                                        onClick={() => setResponse(q.id, isActive ? null : opt.value as AssessmentResponse)}
                                        className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-all duration-150 ${
                                          isActive 
                                            ? opt.activeClass 
                                            : 'border-border text-muted-foreground hover:bg-muted/60'
                                        }`}
                                      >
                                        {opt.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
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