import React, { useState } from 'react';
import { useAuth } from './AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Navigate } from 'react-router-dom';
import { ShieldCheck, KeyRound } from 'lucide-react';

// ─── Schermata login ──────────────────────────────────────────────────────────

const LoginForm: React.FC = () => {
  const { signIn } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

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

        {mfaState.step === 'verify' ? (
          <MfaVerifyForm challengeToken={mfaState.challengeToken} />
        ) : (
          <LoginForm />
        )}
      </div>
    </div>
  );
};
