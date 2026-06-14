import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '@/lib/api/auth';
import { useAuth } from '@/components/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { ApiError } from '@/lib/api-client';
import { ShieldCheck, Copy, CheckCheck } from 'lucide-react';
import type { MfaSetupData } from '@/types/api';

// ─── Step 1: QR code ─────────────────────────────────────────────────────────

const QrStep: React.FC<{ setup: MfaSetupData; onNext: () => void }> = ({ setup, onNext }) => {
  const [copied, setCopied] = useState(false);

  const copySecret = () => {
    navigator.clipboard.writeText(setup.secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Scansiona il QR code con Google Authenticator, Authy o qualsiasi app TOTP.
      </p>
      <div className="flex justify-center">
        <img
          src={`data:${setup.qr_mime};base64,${setup.qr_code}`}
          alt="QR Code MFA"
          className="w-48 h-48 border border-border rounded-lg"
        />
      </div>
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Oppure inserisci manualmente il codice segreto:</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs bg-muted px-3 py-2 rounded font-mono break-all">{setup.secret}</code>
          <Button type="button" variant="outline" size="icon" onClick={copySecret}>
            {copied ? <CheckCheck className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
          </Button>
        </div>
      </div>
      <Button className="w-full bg-gradient-cyber hover:opacity-90" onClick={onNext}>
        Ho scansionato il QR code
      </Button>
    </div>
  );
};

// ─── Step 2: Conferma codice ──────────────────────────────────────────────────

const ConfirmStep: React.FC<{ onDone: (codes: string[]) => void }> = ({ onDone }) => {
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setIsLoading(true);
    try {
      const { recovery_codes } = await authApi.mfaEnable(code.trim());
      onDone(recovery_codes);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Codice non valido';
      toast({ title: 'Errore', description: message, variant: 'destructive' });
      setCode('');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Inserisci il codice a 6 cifre generato dall'app per confermare la configurazione.
      </p>
      <div className="space-y-2">
        <Label htmlFor="confirm-code">Codice di conferma</Label>
        <Input
          id="confirm-code"
          type="text"
          inputMode="numeric"
          placeholder="123456"
          value={code}
          onChange={e => setCode(e.target.value)}
          autoComplete="one-time-code"
          autoFocus
          required
        />
      </div>
      <Button type="submit" className="w-full bg-gradient-cyber hover:opacity-90" disabled={isLoading || !code.trim()}>
        {isLoading ? 'Attivazione...' : 'Attiva MFA'}
      </Button>
    </form>
  );
};

// ─── Step 3: Recovery codes ───────────────────────────────────────────────────

const RecoveryCodesStep: React.FC<{ codes: string[]; onDone: () => void }> = ({ codes, onDone }) => {
  const [copied, setCopied] = useState(false);

  const copyAll = () => {
    navigator.clipboard.writeText(codes.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/30 px-4 py-3 text-sm text-yellow-600 dark:text-yellow-400">
        Salva questi codici in un posto sicuro. Verranno mostrati <strong>una sola volta</strong> e servono per accedere se perdi accesso all'app di autenticazione.
      </div>
      <div className="grid grid-cols-2 gap-2">
        {codes.map(c => (
          <code key={c} className="text-xs bg-muted px-3 py-2 rounded font-mono text-center">{c}</code>
        ))}
      </div>
      <Button type="button" variant="outline" className="w-full" onClick={copyAll}>
        {copied ? <CheckCheck className="w-4 h-4 mr-2 text-green-500" /> : <Copy className="w-4 h-4 mr-2" />}
        {copied ? 'Copiati!' : 'Copia tutti'}
      </Button>
      <Button className="w-full bg-gradient-cyber hover:opacity-90" onClick={onDone}>
        Ho salvato i codici — Continua
      </Button>
    </div>
  );
};

// ─── Pagina principale ────────────────────────────────────────────────────────

type SetupStep = 'qr' | 'confirm' | 'recovery';

const MfaSetup: React.FC = () => {
  const navigate = useNavigate();
  const { signOut, refreshUser } = useAuth();
  const { toast } = useToast();

  const [step, setStep] = useState<SetupStep>('qr');
  const [setupData, setSetupData] = useState<MfaSetupData | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [isLoadingSetup, setIsLoadingSetup] = useState(true);

  useEffect(() => {
    authApi.mfaSetup()
      .then(setSetupData)
      .catch(err => {
        const message = err instanceof ApiError ? err.message : 'Errore nel caricamento del setup MFA';
        toast({ title: 'Errore', description: message, variant: 'destructive' });
      })
      .finally(() => setIsLoadingSetup(false));
  }, [toast]);

  const stepTitles: Record<SetupStep, string> = {
    qr: 'Configura autenticazione a due fattori',
    confirm: 'Conferma il codice',
    recovery: 'Codici di recupero',
  };

  const stepDescriptions: Record<SetupStep, string> = {
    qr: 'Step 1 di 3 — Scansiona il QR code',
    confirm: 'Step 2 di 3 — Verifica la configurazione',
    recovery: 'Step 3 di 3 — Salva i codici di recupero',
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
          <p className="text-muted-foreground mt-2">Autenticazione a due fattori richiesta</p>
        </div>

        <Card className="border-border shadow-cyber">
          <CardHeader>
            <CardTitle>{stepTitles[step]}</CardTitle>
            <CardDescription>{stepDescriptions[step]}</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingSetup ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Caricamento...</div>
            ) : step === 'qr' && setupData ? (
              <QrStep setup={setupData} onNext={() => setStep('confirm')} />
            ) : step === 'confirm' ? (
              <ConfirmStep onDone={async codes => { setRecoveryCodes(codes); await refreshUser(); setStep('recovery'); }} />
            ) : (
              <RecoveryCodesStep codes={recoveryCodes} onDone={() => navigate('/dashboard', { replace: true })} />
            )}
          </CardContent>
        </Card>

        {step !== 'recovery' && (
          <p className="text-center mt-4 text-xs text-muted-foreground">
            <button
              type="button"
              className="underline hover:text-foreground"
              onClick={() => signOut().then(() => navigate('/auth', { replace: true }))}
            >
              Esci e torna al login
            </button>
          </p>
        )}
      </div>
    </div>
  );
};

export default MfaSetup;
