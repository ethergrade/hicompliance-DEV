import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { OrganizationProfileForm } from '@/components/irp/OrganizationProfileForm';
import { Pencil } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/components/auth/AuthProvider';
import { useClientContext } from '@/contexts/ClientContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  FileText,
  TrendingUp,
  Target,
  Building2,
  Shield,
  AlertCircle,
  Save,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Loader2,
  Filter,
} from 'lucide-react';
import { useOrganizationProfile } from '@/hooks/useOrganizationProfile';
import { useUserRoles } from '@/hooks/useUserRoles';
import { NIS2_LABELS } from '@/types/organization';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { ASSESSMENT_CATEGORIES, AssessmentResponse, calculateCategoryScore, getRiskFromScore, CATEGORY_DESCRIPTIONS } from '@/data/assessmentQuestions';
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { generateAssessmentPDF } from '@/components/assessment/AssessmentReportGenerator';
import GapAnalysisSection from '@/components/assessment/GapAnalysisSection';
import { AssessmentRadarChart } from '@/components/assessment/AssessmentRadarChart';
import { assessmentApi } from '@/lib/api';
import { moduleVisibility } from '@/config/moduleVisibility';

// Map UI response values to API values and vice versa
const UI_TO_API_QUESTION_STATUS: Record<Exclude<AssessmentResponse, null>, number> = {
  non_iniziato: 0,
  pianificato_in_corso: 1,
  completato: 2,
  non_applicabile: 3,
};
const API_QUESTION_STATUS_TO_UI: Record<number, AssessmentResponse> = {
  0: 'non_iniziato',
  1: 'pianificato_in_corso',
  2: 'completato',
  3: 'non_applicabile',
};

const normalizeQuestionId = (key: string) => {
  const match = key.match(/\d+/);
  return match ? Number(match[0]) : null;
};

const parseAssessmentQuestions = (rawQuestions: unknown): Record<number, AssessmentResponse> => {
  if (!rawQuestions) return {};

  let parsed: unknown = rawQuestions;
  if (typeof rawQuestions === 'string') {
    try {
      parsed = JSON.parse(rawQuestions);
    } catch {
      return {};
    }
  }

  if (Array.isArray(parsed)) {
    return parsed.reduce<Record<number, AssessmentResponse>>((acc, value, index) => {
      const questionId = index + 1;

      if (typeof value === 'number') {
        acc[questionId] = API_QUESTION_STATUS_TO_UI[value] ?? null;
      } else if (typeof value === 'string') {
        const numericValue = Number(value);
        if (!Number.isNaN(numericValue)) {
          acc[questionId] = API_QUESTION_STATUS_TO_UI[numericValue] ?? null;
        }
      }

      return acc;
    }, {});
  }

  if (!parsed || typeof parsed !== 'object') return {};

  const responses: Record<number, AssessmentResponse> = {};
  Object.entries(parsed as Record<string, unknown>).forEach(([key, value]) => {
    const questionId = normalizeQuestionId(key);
    if (questionId === null) return;

    if (typeof value === 'number') {
      responses[questionId] = API_QUESTION_STATUS_TO_UI[value] ?? null;
      return;
    }

    if (typeof value === 'string') {
      // First try numeric string mapping (backend returns "0", "1", "2", "3")
      const numericValue = Number(value);
      if (!Number.isNaN(numericValue)) {
        responses[questionId] = API_QUESTION_STATUS_TO_UI[numericValue] ?? null;
        return;
      }
      // Then try legacy string mapping
      const normalized = value.toLowerCase();
      const legacyMap: Record<string, AssessmentResponse> = {
        completed: 'completato',
        planned_in_progress: 'pianificato_in_corso',
        not_started: 'non_iniziato',
        not_applicable: 'non_applicabile',
        completato: 'completato',
        pianificato_in_corso: 'pianificato_in_corso',
        non_iniziato: 'non_iniziato',
        non_applicabile: 'non_applicabile',
      };
      responses[questionId] = legacyMap[normalized] ?? null;
    }
  });

  return responses;
};

const serializeAssessmentQuestions = (responses: Record<number, AssessmentResponse>) =>
  Object.entries(responses).reduce<Record<string, string>>((acc, [questionId, value]) => {
    if (!value) return acc;
    acc[`q${questionId}`] = String(UI_TO_API_QUESTION_STATUS[value]);
    return acc;
  }, {});

const answerOptions = [
  {
    value: 'non_iniziato',
    label: 'Non iniziato',
    description: 'Attività non ancora avviata',
    activeClass: 'bg-red-500 text-white border-red-600',
    dotClass: 'bg-red-500',
  },
  {
    value: 'pianificato_in_corso',
    label: 'Pianificato/In corso',
    description: 'Attività pianificata o in lavorazione',
    activeClass: 'bg-yellow-500 text-white border-yellow-600',
    dotClass: 'bg-yellow-500',
  },
  {
    value: 'completato',
    label: 'Completato',
    description: 'Controllo implementato e operativo',
    activeClass: 'bg-green-500 text-white border-green-600',
    dotClass: 'bg-green-500',
  },
  {
    value: 'non_applicabile',
    label: 'Non applicabile',
    description: 'Controllo non pertinente al contesto',
    activeClass: 'bg-muted-foreground/60 text-white border-muted-foreground/60',
    dotClass: 'bg-muted-foreground/60',
  },
] as const;


import { useNavigate } from 'react-router-dom';

const Assessment: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { selectedOrganization, userOrganizationId, canManageMultipleClients } = useClientContext();
  const { isSales } = useUserRoles();
  const orgId = selectedOrganization?.id || userOrganizationId;
  const isReadOnlyView = canManageMultipleClients && isSales;

  // Question responses state: { [questionId]: response }
  const [responses, setResponses] = useState<Record<number, AssessmentResponse>>({});
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [guidedCategoryIndex, setGuidedCategoryIndex] = useState(0);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const assessmentIdRef = useRef<string | number | null>(null);
  const loadedOrgRef = useRef<string | null>(null);
  const guidedOrgRef = useRef<string | null>(null);

  // Load existing assessment responses from the API
  useEffect(() => {
    if (!orgId || !user) return;
    if (loadedOrgRef.current === orgId) return;

    const loadResponses = async () => {
      try {
        const assessments = await assessmentApi.list();
        const assessment = assessments.find(a => a.tenant_id === orgId) || null;
        if (!assessment) {
          setResponses({});
          assessmentIdRef.current = null;
          loadedOrgRef.current = orgId;
          return;
        }
        assessmentIdRef.current = assessment.id;
        setResponses(parseAssessmentQuestions(assessment.questions));
        loadedOrgRef.current = orgId;
      } catch (error) {
        console.error('Assessment load error:', error);
        setResponses({});
        assessmentIdRef.current = null;
      }
    };

    loadResponses();
  }, [orgId, user]);

  // Auto-save: debounced save after each response change
  const snapshotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const responsesRef = useRef(responses);
  responsesRef.current = responses;

  const triggerAutoSave = useCallback(() => {
    if (!orgId || !user) return;
    if (snapshotTimerRef.current) clearTimeout(snapshotTimerRef.current);
    snapshotTimerRef.current = setTimeout(async () => {
      const currentResponses = responsesRef.current;
      const serializedQuestions = serializeAssessmentQuestions(currentResponses);
      try {
        if (!assessmentIdRef.current) {
          const createdAssessment = await assessmentApi.create({
            questions: serializedQuestions,
          });
          assessmentIdRef.current = createdAssessment.id;
        } else {
          await assessmentApi.update(assessmentIdRef.current, {
            questions: serializedQuestions,
          });
        }
        setSaveStatus('saved');
        setLastSaved(new Date());
      } catch (err) {
        console.error('Auto-snapshot error:', err);
        setSaveStatus('error');
      }
    }, 3000); // 3s debounce
  }, [orgId, user]);

  const setResponse = useCallback((questionId: number, value: AssessmentResponse) => {
    if (isReadOnlyView) return;

    setResponses(prev => ({ ...prev, [questionId]: value }));

    // Persist to API with debounce
    if (!orgId || !user) return;
    setSaveStatus('saving');

    triggerAutoSave();
  }, [isReadOnlyView, orgId, user, triggerAutoSave]);

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

  const getNIS2Badge = () => {
    if (!orgProfile.nis2_classification) return null;
    
    const badgeColors: Record<string, string> = {
      soggetto_essenziale: 'bg-red-500/10 text-red-500 border-red-500/20',
      soggetto_importante: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
      nessuna: 'bg-muted text-muted-foreground border-border'
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

  const radarData = useMemo(() => {
    return assessmentCategories.map((cat) => {
      const compliance = Number.isFinite(cat.score) ? cat.score : 0;
      const target = 90;

      return {
        category: cat.name.length > 14 ? `${cat.name.substring(0, 12)}…` : cat.name,
        fullName: cat.name,
        compliance,
        target,
      };
    });
  }, [assessmentCategories]);

  const hasRadarResponses = useMemo(
    () => assessmentCategories.some((cat) => cat.completed > 0),
    [assessmentCategories]
  );


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

  const firstIncompleteCategoryIndex = useMemo(() => {
    const index = assessmentCategories.findIndex(category => category.completed < category.questions);
    return index === -1 ? Math.max(assessmentCategories.length - 1, 0) : index;
  }, [assessmentCategories]);

  const activeGuidedCategory = assessmentCategories[guidedCategoryIndex] ?? assessmentCategories[firstIncompleteCategoryIndex];

  const persistGuidedCategoryIndex = useCallback((index: number) => {
    if (!orgId) return;
    localStorage.setItem(`assessment_guided_category_${orgId}`, String(index));
  }, [orgId]);

  const selectGuidedCategory = useCallback((index: number) => {
    const category = assessmentCategories[index];
    if (!category) return;

    setGuidedCategoryIndex(index);
    persistGuidedCategoryIndex(index);
    setExpandedCategories(new Set([category.name]));
  }, [assessmentCategories, persistGuidedCategoryIndex]);

  useEffect(() => {
    if (!orgId || assessmentCategories.length === 0) return;
    if (guidedOrgRef.current === orgId) return;

    const storedIndex = Number(localStorage.getItem(`assessment_guided_category_${orgId}`));
    const initialIndex = Number.isInteger(storedIndex) && storedIndex >= 0 && storedIndex < assessmentCategories.length
      ? storedIndex
      : firstIncompleteCategoryIndex;
    const initialCategory = assessmentCategories[initialIndex];

    if (!initialCategory) return;

    guidedOrgRef.current = orgId;
    setGuidedCategoryIndex(initialIndex);
    setExpandedCategories(new Set([initialCategory.name]));
  }, [orgId, assessmentCategories, firstIncompleteCategoryIndex]);

  const toggleCategory = useCallback((name: string) => {
    const index = assessmentCategories.findIndex(category => category.name === name);
    if (index === -1) return;
    selectGuidedCategory(index);
  }, [assessmentCategories, selectGuidedCategory]);

  const answeredQuestions = useMemo(
    () => assessmentCategories.reduce((acc, cat) => acc + cat.completed, 0),
    [assessmentCategories]
  );

  const totalQuestions = useMemo(
    () => assessmentCategories.reduce((acc, cat) => acc + cat.questions, 0),
    [assessmentCategories]
  );
  const shouldShowEmptyReviewState = isReadOnlyView && answeredQuestions === 0;

  const resumeMessage = useMemo(() => {
    if (isReadOnlyView && answeredQuestions === 0) {
      return 'Il cliente selezionato non ha ancora inviato risposte da revisionare.';
    }

    if (isReadOnlyView) {
      return `${answeredQuestions}/${totalQuestions} risposte disponibili in sola lettura per ${selectedOrganization?.name || 'il cliente selezionato'}.`;
    }

    if (answeredQuestions === 0) {
      return 'Inizia rispondendo alle domande: il salvataggio automatico conserverà i progressi.';
    }

    const progressText = `${answeredQuestions}/${totalQuestions} risposte salvate`;
    if (!lastSaved) return `${progressText}. Puoi continuare da dove hai lasciato.`;

    return `${progressText}. Ultimo salvataggio ${lastSaved.toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
    })}.`;
  }, [answeredQuestions, totalQuestions, isReadOnlyView, lastSaved, selectedOrganization?.name]);

  const continueToNextCategory = useCallback((categoryName: string) => {
    const currentIndex = assessmentCategories.findIndex(category => category.name === categoryName);
    const nextIndex = currentIndex + 1;
    if (currentIndex === -1 || nextIndex >= assessmentCategories.length) return;

    selectGuidedCategory(nextIndex);
  }, [assessmentCategories, selectGuidedCategory]);

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
            {/* Save status indicator */}
            {!isReadOnlyView && saveStatus !== 'idle' && (
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                saveStatus === 'saving' ? 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20' :
                saveStatus === 'saved' ? 'bg-green-500/10 text-green-600 border-green-500/20' :
                'bg-red-500/10 text-red-500 border-red-500/20'
              }`}>
                {saveStatus === 'saving' && <Loader2 className="w-3 h-3 animate-spin" />}
                {saveStatus === 'saved' && <Save className="w-3 h-3" />}
                {saveStatus === 'error' && <AlertCircle className="w-3 h-3" />}
                {saveStatus === 'saving' ? 'Salvataggio...' : 
                 saveStatus === 'saved' ? `Salvato ${lastSaved ? lastSaved.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}` :
                 'Errore salvataggio'}
              </div>
            )}
            {moduleVisibility.consistenze && (
              <Button 
                variant="outline"
                className="gap-2"
                onClick={() => navigate('/consistenze')}
              >
                <FileText className="w-4 h-4" />
                Gestisci Consistenze
              </Button>
            )}
            <Button 
              className="bg-primary text-primary-foreground"
              onClick={() => generateAssessmentPDF({ responses, companyName: orgProfile.legal_name || undefined })}
            >
              <FileText className="w-4 h-4 mr-2" />
              Genera Report PDF
            </Button>
          </div>
        </div>

        {/* Organization Profile Banner */}
        {!profileLoading && (
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
                  {orgProfile.nis2_classification && (
                    <div className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-primary" />
                      <span className="text-sm font-medium">NIS2:</span>
                      {getNIS2Badge()}
                    </div>
                  )}
                  {!orgProfile.nis2_classification && (
                    <div className="flex items-center gap-2 text-amber-500">
                      <AlertCircle className="h-5 w-5" />
                      <span className="text-sm">NIS2 non impostata</span>
                    </div>
                  )}
                  <Sheet>
                    <SheetTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <Pencil className="h-3.5 w-3.5" />
                        Configura
                      </Button>
                    </SheetTrigger>
                    <SheetContent className="w-[500px] sm:max-w-[500px] overflow-y-auto">
                      <SheetHeader>
                        <SheetTitle>Anagrafica Azienda</SheetTitle>
                      </SheetHeader>
                      <div className="mt-4">
                        <OrganizationProfileForm />
                      </div>
                    </SheetContent>
                  </Sheet>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {isReadOnlyView && (
          <Card className="border-border bg-muted/20">
            <CardContent className="flex items-center gap-3 p-4">
              <AlertCircle className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium text-foreground">Vista cliente in sola lettura</p>
                <p className="text-sm text-muted-foreground">
                  {selectedOrganization?.name || 'Il cliente selezionato'} compila l&apos;assessment. I profili sales possono solo consultare lo stato corrente.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {shouldShowEmptyReviewState ? (
          <Card className="border-dashed border-border">
            <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
              <AlertTriangle className="h-10 w-10 text-muted-foreground/60" />
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-foreground">Nessuna risposta disponibile</h2>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  {selectedOrganization?.name || 'Il cliente selezionato'} non ha ancora inviato risposte. Le sezioni Assessment resteranno vuote finché il cliente non inizierà la compilazione.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
        <>
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

        {/* ── Historical Gap/Gain Analysis ── */}
        <GapAnalysisSection
          currentCategories={assessmentCategories.map(c => ({
            name: c.name,
            score: c.score,
            completed: c.completed,
            questions: c.questions,
          }))}
          overallScore={overallScore}
          overallProgress={overallProgress}
        />

        {/* ── RADAR Chart + Category Breakdown ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Radar Chart - Left */}
          <Card className="border-border lg:col-span-2">
            <CardHeader className="pb-2">
              <div>
                <CardTitle className="text-base">Allineamento NIS2 / NIST / ISO</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Punteggio reale da risposte assessment</p>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {!hasRadarResponses ? (
                <div className="h-[350px] w-full flex flex-col items-center justify-center text-muted-foreground gap-3">
                  <AlertTriangle className="h-10 w-10 opacity-40" />
                  <p className="text-sm text-center max-w-[240px]">Rispondi alle domande dell'assessment per visualizzare i risultati nella radar</p>
                </div>
              ) : (
                <AssessmentRadarChart data={radarData} />
              )}
            </CardContent>
          </Card>

          {/* Category Response Breakdown - Right */}
          <Card className="border-border lg:col-span-3">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Riepilogo Risposte per Categoria</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Distribuzione dello stato delle risposte</p>
                </div>
                <div className="flex items-center gap-3 text-[10px] font-medium">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-500" /> Completato</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-yellow-500" /> Pianificato</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-500" /> Non iniziato</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-muted-foreground/40" /> N/A</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                {assessmentCategories.map((cat) => {
                  const total = cat.questions;
                  const c = cat.counts;
                  const answered = c.completato + c.pianificato_in_corso + c.non_iniziato + c.non_applicabile;
                  const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
                  return (
                    <div key={cat.name} className="group rounded-lg border border-border/50 hover:border-border bg-card/50 hover:bg-muted/20 transition-all px-3 py-2.5">
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <span className="text-xs font-semibold text-foreground truncate flex-1">{cat.name}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-muted-foreground">{answered}/{total}</span>
                          <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-4 ${
                            pct === 100 ? 'border-green-500/40 text-green-500' :
                            pct > 0 ? 'border-yellow-500/40 text-yellow-500' :
                            'border-border text-muted-foreground'
                          }`}>
                            {pct}%
                          </Badge>
                        </div>
                      </div>
                      {/* Stacked bar - thicker */}
                      <div className="flex h-3 rounded-full overflow-hidden bg-muted/40 mb-2">
                        {c.completato > 0 && (
                          <div className="bg-green-500 transition-all duration-500" style={{ width: `${(c.completato / total) * 100}%` }} />
                        )}
                        {c.pianificato_in_corso > 0 && (
                          <div className="bg-yellow-500 transition-all duration-500" style={{ width: `${(c.pianificato_in_corso / total) * 100}%` }} />
                        )}
                        {c.non_iniziato > 0 && (
                          <div className="bg-red-500 transition-all duration-500" style={{ width: `${(c.non_iniziato / total) * 100}%` }} />
                        )}
                        {c.non_applicabile > 0 && (
                          <div className="bg-muted-foreground/40 transition-all duration-500" style={{ width: `${(c.non_applicabile / total) * 100}%` }} />
                        )}
                      </div>
                      {/* Count pills with mini bars */}
                      <div className="flex items-center gap-3 text-[10px]">
                        <div className="flex items-center gap-1">
                          <div className="w-1.5 h-3 rounded-sm bg-green-500" />
                          <span className="text-green-500 font-bold">{c.completato}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-1.5 h-3 rounded-sm bg-yellow-500" />
                          <span className="text-yellow-500 font-bold">{c.pianificato_in_corso}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-1.5 h-3 rounded-sm bg-red-500" />
                          <span className="text-red-500 font-bold">{c.non_iniziato}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-1.5 h-3 rounded-sm bg-muted-foreground/40" />
                          <span className="text-muted-foreground font-bold">{c.non_applicabile}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Assessment Categories */}
        <Card className="border-border">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <CardTitle>Categorie Assessment</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">{resumeMessage}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => selectGuidedCategory(guidedCategoryIndex)}
                  >
                    <ChevronDown className="w-3.5 h-3.5 mr-1" />
                    Riprendi
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => selectGuidedCategory(firstIncompleteCategoryIndex)}
                  >
                    <ChevronRight className="w-3.5 h-3.5 mr-1" />
                    Prima incompleta
                  </Button>
                </div>
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
            <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_auto]">
              <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                <p className="text-sm font-medium text-foreground">
                  {isReadOnlyView ? 'Legenda risposte' : 'Come rispondere'}
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {answerOptions.map(option => (
                    <div key={option.value} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <span className={`mt-1 h-2.5 w-2.5 rounded-full ${option.dotClass}`} />
                      <div>
                        <span className="font-medium text-foreground">{option.label}</span>
                        <p>{option.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm lg:max-w-xs">
                <p className="font-medium text-foreground">
                  {isReadOnlyView ? 'Modalità revisione cliente' : 'Hai domande o dubbi sulla compilazione?'}
                </p>
                {isReadOnlyView ? (
                  <p className="mt-1 text-muted-foreground">
                    Questa sezione mostra solo le risposte del cliente selezionato.
                  </p>
                ) : (
                  <a href="mailto:support@hisolution.it?subject=Supporto%20Assessment%20HiConsole" className="mt-1 inline-flex text-primary hover:underline">
                    Clicca e sarai ricontattato!
                  </a>
                )}
              </div>
            </div>
            <div className="space-y-3">
              {filteredAndSortedCategories.map((category) => {
                const isExpanded = expandedCategories.has(category.name);
                const catData = ASSESSMENT_CATEGORIES.find(c => c.name === category.name);
                const counts = category.counts;
                const canonicalIndex = assessmentCategories.findIndex(item => item.name === category.name);
                const isActiveGuidedCategory = activeGuidedCategory?.name === category.name;
                const hasNextGuidedCategory = canonicalIndex >= 0 && canonicalIndex < assessmentCategories.length - 1;

                return (
                  <div
                    key={category.name}
                    className={`rounded-lg border bg-card overflow-hidden transition-colors ${
                      isActiveGuidedCategory ? 'border-primary/60 ring-1 ring-primary/20' : 'border-border'
                    }`}
                  >
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
                            {isActiveGuidedCategory && (
                              <Badge variant="secondary" className="text-[10px]">Categoria attiva</Badge>
                            )}
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
                              value={(category.completed / category.questions) * 100} 
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
                                  {answerOptions.map(opt => {
                                    const isActive = currentResponse === opt.value;
                                    return (
                                      <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => setResponse(q.id, isActive ? null : opt.value as AssessmentResponse)}
                                        disabled={isReadOnlyView}
                                        className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-all duration-150 ${
                                          isActive 
                                            ? opt.activeClass 
                                            : 'border-border text-muted-foreground hover:bg-muted/60'
                                        } ${isReadOnlyView ? 'cursor-default opacity-80' : ''}`}
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
                        <div className="flex items-center justify-between gap-3 border-t border-border bg-card px-5 py-3">
                          <p className="text-xs text-muted-foreground">
                            {isReadOnlyView
                              ? 'Le risposte mostrate appartengono al cliente selezionato e non sono modificabili da questa vista.'
                              : 'Le risposte vengono salvate automaticamente: puoi uscire e riprendere più tardi.'}
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!hasNextGuidedCategory}
                            onClick={() => continueToNextCategory(category.name)}
                          >
                            Continua
                            <ChevronRight className="ml-1 h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
        </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Assessment;
