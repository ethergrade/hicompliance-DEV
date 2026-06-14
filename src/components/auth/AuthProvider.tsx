import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authApi } from '@/lib/api/auth';
import { getToken, clearToken, handleUnauthorized, ApiError, isTokenExpired } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import type { LoginUser } from '@/types/api';

export type MfaState =
  | { step: 'none' }
  | { step: 'verify'; challengeToken: string }
  | { step: 'setup' };

interface AuthContextType {
  user: LoginUser | null;
  capabilities: Record<string, boolean> | undefined;
  loading: boolean;
  mfaState: MfaState;
  signIn: (login: string, password: string) => Promise<{ error: unknown }>;
  completeMfaVerify: (challengeToken: string, code: string) => Promise<{ error: unknown }>;
  signOut: () => Promise<void>;
  /** Ricarica /auth/me con X-Group-Id per ottenere le capabilities corrette del gruppo */
  refreshCapabilities: (groupId: string) => Promise<void>;
  /** Ricarica /auth/me e aggiorna user (es. dopo setup MFA) */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  capabilities: undefined,
  loading: true,
  mfaState: { step: 'none' },
  signIn: async () => ({ error: null }),
  completeMfaVerify: async () => ({ error: null }),
  signOut: async () => {},
  refreshCapabilities: async () => {},
  refreshUser: async () => {},
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
  const [mfaState, setMfaState] = useState<MfaState>({ step: 'none' });
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

  const finalizeLogin = useCallback(async (loggedUser: LoginUser) => {
    const firstGroupId = loggedUser.groups?.[0]?.id;
    try {
      // Sempre ricarica /auth/me per avere mfa_recommended e capabilities aggiornati
      const me = await authApi.me(firstGroupId && !loggedUser.is_super_admin ? firstGroupId : undefined);
      setUser(me);
      setCapabilities(me.capabilities);
    } catch {
      // Fallback ai dati del login se /auth/me fallisce
      setUser(loggedUser);
    }
    setMfaState({ step: 'none' });
    toast({ title: "Accesso effettuato", description: "Benvenuto in HiConsole" });
  }, [toast]);

  const signIn = useCallback(async (login: string, password: string) => {
    try {
      const data = await authApi.login({ login, password });

      // Caso 3: MFA configurato — challenge in attesa
      if (data.mfa_required && data.mfa_configured && data.mfa_challenge_token) {
        setMfaState({ step: 'verify', challengeToken: data.mfa_challenge_token });
        return { error: null };
      }

      // Caso 2: MFA obbligatorio ma non configurato — setup forzato
      if (data.mfa_required && !data.mfa_configured && data.user) {
        setMfaState({ step: 'setup' });
        // Token già salvato da authApi.login — accesso parziale per poter chiamare /auth/mfa/setup
        window.location.href = '/auth/mfa-setup';
        return { error: null };
      }

      // Caso 1: login normale senza MFA
      if (data.user) {
        await finalizeLogin(data.user);
      }

      return { error: null };
    } catch (error) {
      const message = error instanceof ApiError
        ? error.message
        : "Si è verificato un errore durante l'accesso";

      toast({ title: "Errore di accesso", description: message, variant: "destructive" });
      return { error };
    }
  }, [toast, finalizeLogin]);

  const completeMfaVerify = useCallback(async (challengeToken: string, code: string) => {
    try {
      const { user: loggedUser } = await authApi.mfaVerify({ mfa_challenge_token: challengeToken, code });
      await finalizeLogin(loggedUser);
      return { error: null };
    } catch (error) {
      const message = error instanceof ApiError
        ? error.message
        : "Codice non valido";

      // Challenge scaduta (401) — rimanda al login
      if (error instanceof ApiError && error.status === 401) {
        setMfaState({ step: 'none' });
        toast({ title: "Sessione scaduta", description: "Rieffettua il login", variant: "destructive" });
      } else {
        toast({ title: "Verifica fallita", description: message, variant: "destructive" });
      }
      return { error };
    }
  }, [toast, finalizeLogin]);

  const refreshUser = useCallback(async () => {
    try {
      const storedGroupId = getStoredGroupId();
      const me = await authApi.me(storedGroupId ?? undefined);
      setUser(me);
      setCapabilities(me.capabilities);
    } catch { /* ignora */ }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Even if API call fails, clear local state
    }
    clearToken();
    setUser(null);
    setMfaState({ step: 'none' });
    toast({ title: "Disconnesso", description: "Sei stato disconnesso con successo" });
  }, [toast]);

  const value: AuthContextType = {
    user,
    capabilities,
    loading,
    mfaState,
    signIn,
    completeMfaVerify,
    signOut,
    refreshCapabilities,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};