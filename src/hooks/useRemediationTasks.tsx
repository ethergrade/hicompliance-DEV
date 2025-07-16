import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface RemediationTask {
  id: string;
  organization_id?: string | null;
  task: string;
  category: string;
  start_date: string;
  end_date: string;
  progress: number;
  assignee?: string | null;
  priority: string;
  dependencies: string[] | null;
  color: string;
  created_at?: string;
  updated_at?: string;
}

export interface GanttTask extends RemediationTask {
  offsetDays: number;
  durationDays: number;
  progressWidth: number;
}

export const useRemediationTasks = () => {
  const [tasks, setTasks] = useState<RemediationTask[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('remediation_tasks')
        .select('*')
        .order('start_date', { ascending: true });

      if (error) throw error;
      setTasks((data || []).map(task => ({
        ...task,
        dependencies: task.dependencies || []
      })));
    } catch (error) {
      console.error('Error fetching remediation tasks:', error);
      toast({
        title: "Errore",
        description: "Impossibile caricare le attività di remediation",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const createTask = async (taskData: Omit<RemediationTask, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      // Get current user's organization
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('organization_id')
        .eq('auth_user_id', (await supabase.auth.getUser()).data.user?.id)
        .single();

      if (userError) throw userError;

      const { data, error } = await supabase
        .from('remediation_tasks')
        .insert([{
          ...taskData,
          organization_id: userData.organization_id
        }])
        .select()
        .single();

      if (error) throw error;

      setTasks(prev => [...prev, { ...data, dependencies: data.dependencies || [] }]);
      toast({
        title: "Successo",
        description: "Attività creata con successo",
      });
      return data;
    } catch (error) {
      console.error('Error creating task:', error);
      toast({
        title: "Errore",
        description: "Impossibile creare l'attività",
        variant: "destructive",
      });
      throw error;
    }
  };

  const updateTask = async (id: string, updates: Partial<RemediationTask>) => {
    try {
      const { data, error } = await supabase
        .from('remediation_tasks')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      setTasks(prev => prev.map(task => 
        task.id === id ? { ...task, ...data, dependencies: data.dependencies || [] } : task
      ));
      
      toast({
        title: "Successo",
        description: "Attività aggiornata con successo",
      });
      return data;
    } catch (error) {
      console.error('Error updating task:', error);
      toast({
        title: "Errore",
        description: "Impossibile aggiornare l'attività",
        variant: "destructive",
      });
      throw error;
    }
  };

  const deleteTask = async (id: string) => {
    try {
      const { error } = await supabase
        .from('remediation_tasks')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setTasks(prev => prev.filter(task => task.id !== id));
      toast({
        title: "Successo",
        description: "Attività eliminata con successo",
      });
    } catch (error) {
      console.error('Error deleting task:', error);
      toast({
        title: "Errore",
        description: "Impossibile eliminare l'attività",
        variant: "destructive",
      });
      throw error;
    }
  };

  const updateTaskDates = async (id: string, startDate: string, endDate: string) => {
    return updateTask(id, { start_date: startDate, end_date: endDate });
  };

  const reorderTasks = async (newOrder: string[]) => {
    try {
      // Update tasks in batch with new start dates based on order
      const updates = newOrder.map((taskId, index) => {
        const task = tasks.find(t => t.id === taskId);
        if (!task) return null;
        
        const startDate = new Date();
        startDate.setDate(startDate.getDate() + (index * 7)); // Each task starts 1 week after the previous
        
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 14); // Each task lasts 2 weeks
        
        return {
          id: taskId,
          start_date: startDate.toISOString().split('T')[0],
          end_date: endDate.toISOString().split('T')[0]
        };
      }).filter(Boolean);

      for (const update of updates) {
        if (update) {
          await updateTask(update.id, {
            start_date: update.start_date,
            end_date: update.end_date
          });
        }
      }
    } catch (error) {
      console.error('Error reordering tasks:', error);
      toast({
        title: "Errore",
        description: "Impossibile riordinare le attività",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    fetchTasks();

    // Set up real-time subscription
    const subscription = supabase
      .channel('remediation_tasks_changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'remediation_tasks' },
        (payload) => {
          console.log('Real-time update:', payload);
          fetchTasks(); // Refresh data on any change
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return {
    tasks,
    loading,
    createTask,
    updateTask,
    deleteTask,
    updateTaskDates,
    reorderTasks,
    refetch: fetchTasks
  };
};