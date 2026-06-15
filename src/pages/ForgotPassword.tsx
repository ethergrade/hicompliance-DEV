import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '@/lib/api/auth';
import { ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldCheck, ArrowLeft, CheckCircle } from 'lucide-react';

const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await authApi.forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Si è verificato un errore. Riprova.');
    } finally {
      setIsLoading(false);
    }
  };

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
            <CardTitle>Recupero password</CardTitle>
            <CardDescription>
              {sent
                ? 'Controlla la tua email'
                : 'Inserisci la tua email per ricevere il link di reset'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="space-y-4">
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <CheckCircle className="w-12 h-12 text-green-500" />
                  <p className="text-sm text-muted-foreground">
                    Se l'indirizzo <strong>{email}</strong> è associato a un account, riceverai a breve un'email con le istruzioni per reimpostare la password.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Controlla anche la cartella spam.
                  </p>
                </div>
                <Link to="/auth">
                  <Button variant="outline" className="w-full gap-2">
                    <ArrowLeft className="w-4 h-4" />
                    Torna al login
                  </Button>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="email@esempio.it"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    autoFocus
                    required
                  />
                </div>
                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}
                <Button
                  type="submit"
                  className="w-full bg-gradient-cyber hover:opacity-90"
                  disabled={isLoading || !email.trim()}
                >
                  {isLoading ? 'Invio in corso...' : 'Invia link di reset'}
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

export default ForgotPassword;
