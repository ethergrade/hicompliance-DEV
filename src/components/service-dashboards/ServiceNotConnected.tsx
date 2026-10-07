import { Card, CardContent } from '@/components/ui/card';
import { Loader2, PlugZap } from 'lucide-react';

interface ServiceNotConnectedProps {
  service: string;
  loading?: boolean;
}

/**
 * Al posto della dashboard quando il servizio non ha ancora dati reali per il
 * cliente: meglio dirlo che riempire la pagina di numeri d'esempio.
 */
export function ServiceNotConnected({ service, loading = false }: ServiceNotConnectedProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Caricamento {service}…
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <PlugZap className="h-10 w-10 text-muted-foreground" />
        <p className="text-lg font-semibold">{service} non è ancora collegato</p>
        <p className="max-w-md text-sm text-muted-foreground">
          Per questo cliente non ci sono ancora dati reali da mostrare. La dashboard si
          popolerà quando il servizio sarà attivo e collegato.
        </p>
      </CardContent>
    </Card>
  );
}
