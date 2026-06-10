import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authApi } from '@/lib/api/auth';
import { getToken, clearToken, handleUnauthorized, ApiError, isTokenExpired } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import type { LoginUser } from '@/types/api';

interface AuthContextType {
  user: LoginUser | null;
  capabilities: Record<string, boolean> | undefined;
  loading: boolean;
  signIn: (login: string, password: string) => Promise<{ error: unknown }>;
  signOut: () => Promise<void>;
  /** Ricarica /auth/me con X-Group-Id per ottenere le capabilities corrette del gruppo */
  refreshCapabilities: (groupId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  capabilities: undefined,
  loading: true,
  signIn: async () => ({ error: null }),
  signOut: async () => {},
  refreshCapabilities: async () => {},
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<LoginUser | null>(null);
  const [capabilities, setCapabilities] = useState<Record<string, boolean> | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Legge il group_id dell'organizzazione selezionata da localStorage
  const getStoredGroupId = (): string | null => {
    try {
      const raw = localStorage.getItem('hicompliance_selected_org');
      return raw ? (JSON.parse(raw)?.group_id ?? null) : null;
    } catch { return null; }
  };

  // Ricarica /auth/me con X-Group-Id per ottenere capabilities complete
  const refreshCapabilities = useCallback(async (groupId: string) => {
    try {
      const me = await authApi.me(groupId);
      setCapabilities(me.capabilities);
    } catch { /* ignora — capabilities rimangono invariate */ }
  }, []);

  // Restore session from stored token on mount
  useEffect(() => {
    const token = getToken();
    if (!token || isTokenExpired()) {
      clearToken();
      setLoading(false);
      if (window.location.pathname !== '/auth') {
        window.location.href = '/auth';
      }
      return;
    }

    const storedGroupId = getStoredGroupId();

    authApi.me(storedGroupId ?? undefined)
      .then(async (me) => {
        setUser(me);
        setCapabilities(me.capabilities);
        // Se non avevamo un groupId stored, proviamo comunque il primo gruppo disponibile
        // per assicurarci di avere capabilities non vuote
        if (!storedGroupId && !me.is_super_admin) {
          const firstGroupId = me.groups?.[0]?.id;
          if (firstGroupId) {
            try {
              const meWithCaps = await authApi.me(firstGroupId);
              setCapabilities(meWithCaps.capabilities);
            } catch { /* ignora */ }
          }
        }
      })
      .catch(() => {
        // Token expired or invalid — force logout via handleUnauthorized
        // This dispatches 'auth:unauthorized' event for graceful redirect
        handleUnauthorized();
      })
      .finally(() => setLoading(false));
  }, []);

  // Listen for unauthorized events from api-client (401 responses)
  // This replaces the old hard redirect with graceful React state change
  useEffect(() => {
    const handleAuthUnauthorized = () => {
      setUser(null);
      toast({
        title: "Sessione scaduta",
        description: "Effettua nuovamente l'accesso",
        variant: "destructive",
      });
      window.location.href = '/auth';
    };

    window.addEventListener('auth:unauthorized', handleAuthUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleAuthUnauthorized);
  }, [toast]);

  const signIn = useCallback(async (login: string, password: string) => {
    try {
      const { user: loggedUser } = await authApi.login({ login, password });

      // Subito dopo il login, tentiamo di caricare capabilities del primo gruppo
      // in modo che il sidebar sia già corretto al primo render
      const firstGroupId = loggedUser.groups?.[0]?.id;
      if (firstGroupId && !loggedUser.is_super_admin) {
        try {
          const meWithCaps = await authApi.me(firstGroupId);
          setCapabilities(meWithCaps.capabilities);
        } finally {
          setUser(loggedUser);
        }
      } else {
        setUser(loggedUser);
      }

      toast({
        title: "Accesso effettuato",
        description: "Benvenuto in HiConsole",
      });

      return { error: null };
    } catch (error) {
      const message = error instanceof ApiError
        ? error.message
        : "Si è verificato un errore durante l'accesso";

      toast({
        title: "Errore di accesso",
        description: message,
        variant: "destructive",
      });

      return { error };
    }
  }, [toast]);

  const signOut = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Even if API call fails, clear local state
    }
    clearToken();
    setUser(null);
    toast({
      title: "Disconnesso",
      description: "Sei stato disconnesso con successo",
    });
  }, [toast]);

  const value: AuthContextType = {
    user,
    capabilities,
    loading,
    signIn,
    signOut,
    refreshCapabilities,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};