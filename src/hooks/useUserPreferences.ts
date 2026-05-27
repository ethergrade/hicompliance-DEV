import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { preferencesApi } from '@/lib/api/preferences';
import { useAuth } from '@/components/auth/AuthProvider';

export interface UserPreferences {
  // Audit log preferences
  auditLogActionFilter?: string;
  auditLogDateFrom?: string;
  auditLogDateTo?: string;
  auditLogSortOrder?: 'asc' | 'desc';

  // General view preferences
  defaultView?: string;
  itemsPerPage?: number;

  // Assessment / Remediation filter prefs
  statusFilter?: string;
  sortBy?: string;
  selectedTimeframe?: string;

  // Other preferences can be added here
  [key: string]: unknown;
}

interface UseUserPreferencesOptions {
  preferenceKey: string;
  defaultPreferences?: UserPreferences;
}

export const useUserPreferences = ({ preferenceKey, defaultPreferences = {} }: UseUserPreferencesOptions) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [localPreferences, setLocalPreferences] = useState<UserPreferences>(defaultPreferences);

  // Fetch preferences from API
  const { data: apiPreferences, isLoading } = useQuery({
    queryKey: ['user-preferences', user?.id, preferenceKey],
    queryFn: async () => {
      if (!user?.id) return null;

      try {
        const result = await preferencesApi.get(preferenceKey);
        return (result?.value ?? null) as UserPreferences | null;
      } catch (_err) {
        // Preference key not found yet → return null
        return null;
      }
    },
    enabled: !!user?.id,
  });

  // Sync local state with API — use a ref for defaultPreferences to avoid infinite loops
  const defaultPrefsRef = useRef(defaultPreferences);

  useEffect(() => {
    if (apiPreferences) {
      setLocalPreferences({ ...defaultPrefsRef.current, ...apiPreferences });
    } else {
      setLocalPreferences(defaultPrefsRef.current);
    }
  }, [apiPreferences]);

  // Save preferences mutation
  const saveMutation = useMutation({
    mutationFn: async (preferences: UserPreferences) => {
      if (!user?.id) throw new Error('User not available');

      await preferencesApi.set(preferenceKey, preferences);
      return preferences;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['user-preferences', user?.id, preferenceKey],
      });
    },
  });

  // Update preferences (debounced save)
  const updatePreferences = useCallback((updates: Partial<UserPreferences>) => {
    setLocalPreferences((prev) => {
      const newPrefs = { ...prev, ...updates };
      saveMutation.mutate(newPrefs);
      return newPrefs;
    });
  }, [saveMutation]);

  // Clear preferences for this key (reset to defaults)
  const clearPreferences = useCallback(async () => {
    if (!user?.id) return;

    try {
      await preferencesApi.set(preferenceKey, defaultPreferences);
      setLocalPreferences(defaultPreferences);
      queryClient.invalidateQueries({
        queryKey: ['user-preferences', user.id, preferenceKey],
      });
    } catch (err) {
      console.error('Error clearing preferences:', err);
    }
  }, [user?.id, preferenceKey, defaultPreferences, queryClient]);

  return {
    preferences: localPreferences,
    updatePreferences,
    clearPreferences,
    isLoading,
    isSaving: saveMutation.isPending,
  };
};

// ─── Reset all preferences ─────────────────────────────────────────────────

/**
 * Standalone hook to reset preferences for the current user.
 * The API does not expose a bulk-delete endpoint, so this invalidates
 * all cached preference queries and consumers will re-fetch with their
 * default values.
 */
export const useResetAllPreferences = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const resetAllPreferences = useCallback(async (_currentOrgOnly: boolean = false) => {
    if (!user?.id) return false;

    try {
      // Invalidate all preference queries so every consumer re-fetches defaults
      queryClient.invalidateQueries({ queryKey: ['user-preferences'] });
      return true;
    } catch (error) {
      console.error('Error resetting preferences:', error);
      return false;
    }
  }, [user?.id, queryClient]);

  return { resetAllPreferences };
};
