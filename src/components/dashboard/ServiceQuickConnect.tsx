import React, { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Link2, Unlink } from 'lucide-react';

interface ServiceQuickConnectProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceName: string;
  serviceId: string;
  isConnected: boolean;
  integrationId?: string;
  onConnect: (params: { serviceId: string; apiUrl: string; apiKey: string }) => void;
  onDisconnect: (integrationId: string) => void;
  isConnecting: boolean;
  isDisconnecting: boolean;
}

export const ServiceQuickConnect: React.FC<ServiceQuickConnectProps> = ({
  open, onOpenChange, serviceName, serviceId,
  isConnected, integrationId,
  onConnect, onDisconnect, isConnecting, isDisconnecting,
}) => {
  const [apiUrl, setApiUrl] = useState('');
  const [apiKey, setApiKey] = useState('');

  const handleConnect = () => {
    if (!apiUrl.trim() || !apiKey.trim()) return;
    onConnect({ serviceId, apiUrl: apiUrl.trim(), apiKey: apiKey.trim() });
    setApiUrl('');
    setApiKey('');
  };

  const handleDisconnect = () => {
    if (integrationId) {
      onDisconnect(integrationId);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isConnected ? <Unlink className="w-5 h-5" /> : <Link2 className="w-5 h-5" />}
            {isConnected ? `Gestisci ${serviceName}` : `Collega ${serviceName}`}
          </DialogTitle>
          <DialogDescription>
            {isConnected
              ? 'Il servizio è attualmente collegato. Puoi scollegarlo.'
              : 'Inserisci URL e chiave API per collegare il servizio.'}
          </DialogDescription>
        </DialogHeader>

        {isConnected ? (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Vuoi scollegare <strong>{serviceName}</strong>?
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
              <Button variant="destructive" onClick={handleDisconnect} disabled={isDisconnecting}>
                {isDisconnecting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Scollega
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="api-url">URL API</Label>
              <Input
                id="api-url"
                placeholder="https://api.example.com/v1"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="api-key">Chiave API</Label>
              <Input
                id="api-key"
                type="password"
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
              <Button onClick={handleConnect} disabled={isConnecting || !apiUrl.trim() || !apiKey.trim()}>
                {isConnecting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Collega
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
