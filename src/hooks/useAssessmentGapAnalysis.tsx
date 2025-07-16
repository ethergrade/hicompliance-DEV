import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { RemediationTemplate } from './useRemediationTemplates';

interface AssessmentGap {
  category: string;
  riskLevel: 'high' | 'medium' | 'low';
  questionsAtRisk: number;
  totalQuestions: number;
}

export function useAssessmentGapAnalysis() {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const analyzeAssessmentGaps = async (organizationId: string): Promise<AssessmentGap[]> => {
    try {
      setLoading(true);

      // Get all assessment categories
      const { data: categories, error: categoriesError } = await supabase
        .from('assessment_categories')
        .select('code, name')
        .order('order_index');

      if (categoriesError) {
        throw categoriesError;
      }

      // Get assessment responses for the organization
      const { data: responses, error: responsesError } = await supabase
        .from('assessment_responses')
        .select(`
          status,
          question_id,
          assessment_questions!inner(category_id, assessment_categories!inner(code, name))
        `)
        .eq('organization_id', organizationId);

      if (responsesError) {
        throw responsesError;
      }

      // Analyze gaps by category
      const gaps: AssessmentGap[] = [];

      for (const category of categories) {
        const categoryResponses = responses.filter(
          (r: any) => r.assessment_questions?.assessment_categories?.code === category.code
        );

        const atRiskResponses = categoryResponses.filter(
          (r: any) => r.status === 'not_applicable' || r.status === 'planned_in_progress'
        );

        const riskPercentage = categoryResponses.length > 0 
          ? (atRiskResponses.length / categoryResponses.length) * 100 
          : 0;

        let riskLevel: 'high' | 'medium' | 'low' = 'low';
        if (riskPercentage >= 70) riskLevel = 'high';
        else if (riskPercentage >= 40) riskLevel = 'medium';

        if (atRiskResponses.length > 0) {
          gaps.push({
            category: category.name,
            riskLevel,
            questionsAtRisk: atRiskResponses.length,
            totalQuestions: categoryResponses.length,
          });
        }
      }

      return gaps.sort((a, b) => {
        const riskOrder = { high: 3, medium: 2, low: 1 };
        return riskOrder[b.riskLevel] - riskOrder[a.riskLevel];
      });

    } catch (error) {
      console.error('Error analyzing assessment gaps:', error);
      toast({
        title: "Errore",
        description: "Impossibile analizzare i gap dell'assessment",
        variant: "destructive",
      });
      return [];
    } finally {
      setLoading(false);
    }
  };

  const generateAutomaticPlan = async (
    organizationId: string, 
    templates: RemediationTemplate[]
  ): Promise<RemediationTemplate[]> => {
    try {
      const gaps = await analyzeAssessmentGaps(organizationId);
      const recommendedTemplates: RemediationTemplate[] = [];

      for (const gap of gaps) {
        // Find templates for this category
        const categoryTemplates = templates.filter(t => t.category === gap.category);
        
        // Prioritize based on risk level and complexity
        const sortedTemplates = categoryTemplates.sort((a, b) => {
          const priorityOrder = { high: 3, medium: 2, low: 1 };
          const complexityOrder = { low: 3, medium: 2, high: 1 };
          
          // For high-risk categories, prioritize high-priority, low-complexity tasks first
          if (gap.riskLevel === 'high') {
            const aPriorityScore = priorityOrder[a.priority as keyof typeof priorityOrder] || 1;
            const bPriorityScore = priorityOrder[b.priority as keyof typeof priorityOrder] || 1;
            const aComplexityScore = complexityOrder[a.complexity as keyof typeof complexityOrder] || 1;
            const bComplexityScore = complexityOrder[b.complexity as keyof typeof complexityOrder] || 1;
            
            return (bPriorityScore + bComplexityScore) - (aPriorityScore + aComplexityScore);
          }
          
          return 0;
        });

        // Add top templates based on risk level
        const templatesToAdd = gap.riskLevel === 'high' ? 3 : gap.riskLevel === 'medium' ? 2 : 1;
        recommendedTemplates.push(...sortedTemplates.slice(0, templatesToAdd));
      }

      toast({
        title: "Piano Automatico Generato",
        description: `Aggiunte ${recommendedTemplates.length} attività basate sui gap dell'assessment`,
      });

      return recommendedTemplates;

    } catch (error) {
      console.error('Error generating automatic plan:', error);
      toast({
        title: "Errore",
        description: "Errore durante la generazione del piano automatico",
        variant: "destructive",
      });
      return [];
    }
  };

  return {
    loading,
    analyzeAssessmentGaps,
    generateAutomaticPlan,
  };
}