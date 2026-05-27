import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useClientOrganization } from '@/hooks/useClientOrganization';

interface ClientSelectionGuardProps {
  children: React.ReactNode;
}

/**
 * Guard che protegge le route che richiedono un cliente selezionato.
 * Per utenti sales/admin: redirect a /admin/clients se nessun cliente è selezionato.
 * Per utenti client normali: passa attraverso normalmente.
 */
export const ClientSelectionGuard: React.FC<ClientSelectionGuardProps> = ({ children }) => {
  const location = useLocation();
  const { needsClientSelection, isLoading, hasFetchedOrganizations } = useClientOrganization();

  // Aspetta che il fetch iniziale + il restore da localStorage siano completati
  // prima di decidere se redirezionare, così evitiamo redirect spuri al refresh.
  if (isLoading || !hasFetchedOrganizations) {
    return <>{children}</>;
  }

  if (needsClientSelection && location.pathname !== '/admin/clients') {
    return (
      <Navigate
        to="/admin/clients"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  return <>{children}</>;
};
