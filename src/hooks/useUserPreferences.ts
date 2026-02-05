import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useClientContext } from '@/contexts/ClientContext';
import type { Json } from '@/integrations/supabase/types';

export interface UserPreferences {
  // Audit log preferences
  auditLogActionFilter?: string;
  auditLogDateFrom?: string;
  auditLogDateTo?: string;
  auditLogSortOrder?: 'asc' | 'desc';
  
  // General view preferences
  defaultView?: string;
  itemsPerPage?: number;
  
  // Other preferences can be added here
  [key: string]: unknown;
}

interface UseUserPreferencesOptions {
  preferenceKey: string;
  defaultPreferences?: UserPreferences;
}

export const useUserPreferences = ({ preferenceKey, defaultPreferences = {} }: UseUserPreferencesOptions) => {
  const { user } = useAuth();
  const { selectedOrganization } = useClientContext();
  const queryClient = useQueryClient();
  const [localPreferences, setLocalPreferences] = useState<UserPreferences>(defaultPreferences);

  const organizationId = selectedOrganization?.id || null;

  // Fetch preferences from database
  const { data: dbPreferences, isLoading } = useQuery({
    queryKey: ['user-preferences', user?.id, organizationId, preferenceKey],
    queryFn: async () => {
      if (!user?.id || !organizationId) return null;

      const { data, error } = await supabase
        .from('user_preferences')
        .select('preference_value')
        .eq('user_id', user.id)
        .eq('organization_id', organizationId)
        .eq('preference_key', preferenceKey)
        .maybeSingle();

      if (error) throw error;
      return data?.preference_value as UserPreferences | null;
    },
    enabled: !!user?.id && !!organizationId,
  });

  // Sync local state with database
  useEffect(() => {
    if (dbPreferences) {
      setLocalPreferences({ ...defaultPreferences, ...dbPreferences });
    } else {
      setLocalPreferences(defaultPreferences);
    }
  }, [dbPreferences, defaultPreferences]);

  // Save preferences mutation
  const saveMutation = useMutation({
    mutationFn: async (preferences: UserPreferences) => {
      if (!user?.id || !organizationId) throw new Error('User or organization not available');

      // Check if preference exists
      const { data: existing } = await supabase
        .from('user_preferences')
        .select('id')
        .eq('user_id', user.id)
        .eq('organization_id', organizationId)
        .eq('preference_key', preferenceKey)
        .maybeSingle();

      const prefValue = preferences as unknown as Json;

      if (existing) {
        // Update existing
        const { error: updateError } = await supabase
          .from('user_preferences')
          .update({ preference_value: prefValue })
          .eq('id', existing.id);
        if (updateError) throw updateError;
      } else {
        // Insert new
        const { error: insertError } = await supabase
          .from('user_preferences')
          .insert({
            user_id: user.id,
            organization_id: organizationId,
            preference_key: preferenceKey,
            preference_value: prefValue,
          });
        if (insertError) throw insertError;
      }

      return preferences;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ['user-preferences', user?.id, organizationId, preferenceKey] 
      });
    },
  });

  // Update preferences (debounced save)
  const updatePreferences = useCallback((updates: Partial<UserPreferences>) => {
    setLocalPreferences(prev => {
      const newPrefs = { ...prev, ...updates };
      saveMutation.mutate(newPrefs);
      return newPrefs;
    });
  }, [saveMutation]);

  // Clear preferences
  const clearPreferences = useCallback(async () => {
    setLocalPreferences(defaultPreferences);
    if (user?.id && organizationId) {
      await supabase
        .from('user_preferences')
        .delete()
        .eq('user_id', user.id)
        .eq('organization_id', organizationId)
        .eq('preference_key', preferenceKey);
      
      queryClient.invalidateQueries({ 
        queryKey: ['user-preferences', user?.id, organizationId, preferenceKey] 
      });
    }
  }, [user?.id, organizationId, preferenceKey, defaultPreferences, queryClient]);

  return {
    preferences: localPreferences,
    updatePreferences,
    clearPreferences,
    isLoading,
    isSaving: saveMutation.isPending,
  };
};
