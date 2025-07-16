import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface RemediationTemplate {
  id: string;
  category: string;
  task_name: string;
  description: string | null;
  estimated_days: number;
  priority: string;
  dependencies: string[];
  complexity: string;
  created_at: string;
  updated_at: string;
}

export function useRemediationTemplates() {
  const [templates, setTemplates] = useState<RemediationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('remediation_templates')
        .select('*')
        .order('category', { ascending: true })
        .order('task_name', { ascending: true });

      if (error) {
        console.error('Error fetching templates:', error);
        toast({
          title: "Errore",
          description: "Impossibile caricare i template di remediation",
          variant: "destructive",
        });
        return;
      }

      setTemplates(data || []);
    } catch (error) {
      console.error('Error fetching templates:', error);
      toast({
        title: "Errore",
        description: "Errore durante il caricamento dei template",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const getTemplatesByCategory = (category: string) => {
    return templates.filter(template => template.category === category);
  };

  const getCategories = () => {
    const categories = [...new Set(templates.map(template => template.category))];
    return categories.sort();
  };

  return {
    templates,
    loading,
    fetchTemplates,
    getTemplatesByCategory,
    getCategories,
  };
}