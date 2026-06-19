import React, { useState } from 'react';
import { useAuth } from './AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Navigate, Link, useSearchParams } from 'react-router-dom';
import { ShieldCheck, KeyRound } from 'lucide-react';

const SAML_ERRORS: Record<string, string> = {
  saml_failed:       'Autenticazione Microsoft fallita. Riprova.',
  no_email:          'Microsoft non ha fornito un indirizzo email.',
  user_not_found:    "Account non abilitato. Contatta l'amministratore.",
  mfa_not_satisfied: "È richiesta l'autenticazione a più fattori su Microsoft.",
};

// ─── Schermata login ──────────────────────────────────────────────────────────

const LoginForm: React.FC = () => {
  const { signIn } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) ?? '';

  const handleMicrosoftLogin = () => {
    window.location.href = `${API_BASE_URL}/auth/saml/redirect`;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    const formData = new FormData(e.currentTarget);
    await signIn(formData.get('login') as string, formData.get('password') as string);
    setIsLoading(false);
  };

  return (
    <Card className="border-border shadow-cyber">
      <CardHeader>
        <CardTitle>Accesso alla piattaforma</CardTitle>
        <CardDescription>Accedi con le tue credenziali</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="login">Email o Username</Label>
            <Input id="login" name="login" type="text" placeholder="email o username" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" placeholder="inserisci la password per accedere" required />
          </div>
          <Button type="submit" className="w-full bg-gradient-cyber hover:opacity-90" disabled={isLoading}>
            {isLoading ? 'Accesso in corso...' : 'Accedi'}
          </Button>
          <div className="text-center">
            <Link to="/auth/forgot-password" className="text-xs text-muted-foreground hover:text-foreground underline">
              Password dimenticata?
            </Link>
          </div>
          <div className="hidden">
            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">oppure</span>
              </div>
            </div>
            <Button type="button" variant="outline" className="w-full" onClick={handleMicrosoftLogin}>
              <svg className="mr-2 h-4 w-4" viewBox="0 0 21 21" fill="none">
                <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
                <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
                <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
                <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
              </svg>
              Accedi con Microsoft
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

// ─── Schermata verifica TOTP ──────────────────────────────────────────────────

const MfaVerifyForm: React.FC<{ challengeToken: string }> = ({ challengeToken }) => {
  const { completeMfaVerify, signOut } = useAuth();
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setIsLoading(true);
    const { error } = await completeMfaVerify(challengeToken, code.trim());
    if (error) {
      setCode('');
    }
    setIsLoading(false);
  };

  return (
    <Card className="border-border shadow-cyber">
      <CardHeader>
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="w-5 h-5 text-primary" />
          <CardTitle>Verifica a due fattori</CardTitle>
        </div>
        <CardDescription>
          Inserisci il codice a 6 cifre dalla tua app di autenticazione, oppure un recovery code nel formato XXXX-XXXX.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mfa-code">Codice</Label>
            <Input
              id="mfa-code"
              name="code"
              type="text"
              inputMode="numeric"
              placeholder="123456 oppure XXXX-XXXX"
              value={code}
              onChange={e => setCode(e.target.value)}
              autoComplete="one-time-code"
              autoFocus
              required
            />
          </div>
          <Button type="submit" className="w-full bg-gradient-cyber hover:opacity-90" disabled={isLoading || !code.trim()}>
            {isLoading ? 'Verifica in corso...' : 'Verifica'}
          </Button>
          <Button type="button" variant="ghost" className="w-full text-xs text-muted-foreground" onClick={() => signOut()}>
            Torna al login
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

// ─── Componente principale ────────────────────────────────────────────────────

export const LoginPage: React.FC = () => {
  const { user, mfaState } = useAuth();
  const [searchParams] = useSearchParams();
  const samlError = searchParams.get('error');

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-cyber bg-clip-text text-transparent">
            HiConsole
          </h1>
          <p className="text-muted-foreground mt-2">Piattaforma di gestione cyber risk</p>
        </div>

        {samlError && (
          <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {SAML_ERRORS[samlError] ?? 'Errore di accesso. Riprova.'}
          </div>
        )}

        {mfaState.step === 'verify' ? (
          <MfaVerifyForm challengeToken={mfaState.challengeToken} />
        ) : (
          <LoginForm />
        )}
      </div>
    </div>
  );
};
