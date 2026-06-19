import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '@/lib/api/auth';
import { ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldCheck, ArrowLeft, CheckCircle, Eye, EyeOff } from 'lucide-react';

const ResetPassword: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get('token') ?? '';
  const emailFromUrl = searchParams.get('email') ?? '';

  const [email, setEmail] = useState(emailFromUrl);
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const passwordRules = [
    { label: 'Minimo 10 caratteri', test: (pw: string) => pw.length >= 10 },
    { label: 'Una lettera maiuscola', test: (pw: string) => /[A-Z]/.test(pw) },
    { label: 'Una lettera minuscola', test: (pw: string) => /[a-z]/.test(pw) },
    { label: 'Un numero', test: (pw: string) => /\d/.test(pw) },
    { label: 'Un simbolo', test: (pw: string) => /[^A-Za-z0-9]/.test(pw) },
  ];

  const isPasswordValid = (pw: string) => passwordRules.every(r => r.test(pw));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isPasswordValid(password)) {
      setError('La password deve soddisfare tutti i requisiti minimi.');
      return;
    }

    if (password !== passwordConfirmation) {
      setError('Le password non corrispondono.');
      return;
    }

    setIsLoading(true);
    try {
      await authApi.resetPassword({
        token,
        email: email.trim(),
        password,
        password_confirmation: passwordConfirmation,
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Token non valido o scaduto. Richiedi un nuovo link di reset.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center space-y-4">
          <p className="text-muted-foreground">Link di reset non valido.</p>
          <Link to="/auth/forgot-password">
            <Button variant="outline">Richiedi un nuovo link</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <ShieldCheck className="w-8 h-8 text-primary" />
            <h1 className="text-4xl font-bold bg-gradient-cyber bg-clip-text text-transparent">
              HiConsole
            </h1>
          </div>
          <p className="text-muted-foreground mt-2">Piattaforma di gestione cyber risk</p>
        </div>

        <Card className="border-border shadow-cyber">
          <CardHeader>
            <CardTitle>Reimposta password</CardTitle>
            <CardDescription>
              {done ? 'Password aggiornata con successo' : 'Scegli una nuova password sicura'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {done ? (
              <div className="space-y-4">
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <CheckCircle className="w-12 h-12 text-green-500" />
                  <p className="text-sm text-muted-foreground">
                    La tua password è stata aggiornata. Ora puoi accedere con le nuove credenziali.
                  </p>
                </div>
                <Button
                  className="w-full bg-gradient-cyber hover:opacity-90"
                  onClick={() => navigate('/auth', { replace: true })}
                >
                  Vai al login
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {!emailFromUrl && (
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="email@esempio.it"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="password">Nuova password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Nuova password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      autoFocus
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {password && (
                    <ul className="space-y-1 mt-2">
                      {passwordRules.map(rule => {
                        const ok = rule.test(password);
                        return (
                          <li key={rule.label} className={`text-xs flex items-center gap-1.5 ${ok ? 'text-green-600' : 'text-muted-foreground'}`}>
                            {ok ? <CheckCircle className="w-3 h-3" /> : <span className="w-3 h-3 rounded-full border border-muted-foreground/40" />}
                            {rule.label}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password-confirm">Conferma password</Label>
                  <div className="relative">
                    <Input
                      id="password-confirm"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Ripeti la password"
                      value={passwordConfirmation}
                      onChange={e => setPasswordConfirmation(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {password && passwordConfirmation && password !== passwordConfirmation && (
                    <p className="text-xs text-destructive">Le password non corrispondono</p>
                  )}
                </div>
                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}
                <Button
                  type="submit"
                  className="w-full bg-gradient-cyber hover:opacity-90"
                  disabled={isLoading || !password || !passwordConfirmation || !isPasswordValid(password)}
                >
                  {isLoading ? 'Aggiornamento...' : 'Reimposta password'}
                </Button>
                <Link to="/auth">
                  <Button type="button" variant="ghost" className="w-full gap-2 text-muted-foreground">
                    <ArrowLeft className="w-4 h-4" />
                    Torna al login
                  </Button>
                </Link>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ResetPassword;
