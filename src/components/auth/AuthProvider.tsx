import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authApi } from '@/lib/api/auth';
import { getToken, clearToken, handleUnauthorized, ApiError, isTokenExpired } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import type { LoginUser } from '@/types/api';

interface AuthContextType {
  user: LoginUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: unknown }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signIn: async () => ({ error: null }),
  signOut: async () => {},
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
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Restore session from stored token on mount
  useEffect(() => {
    const token = getToken();
    if (!token || isTokenExpired()) {
      clearToken();
      setLoading(false);
      window.location.href = '/auth';
      return;
    }

    authApi.me()
      .then((me) => setUser(me))
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

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { user: loggedUser } = await authApi.login({ email, password });
      setUser(loggedUser);

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
    loading,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};