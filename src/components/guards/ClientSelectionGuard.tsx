 import React from 'react';
 import { Navigate, useLocation } from 'react-router-dom';
 import { useClientOrganization } from '@/hooks/useClientOrganization';
 
 interface ClientSelectionGuardProps {
   children: React.ReactNode;
 }
 
 /**
  * Guard che protegge le route che richiedono un cliente selezionato.
  * Per utenti sales/admin: redirect a /clients se nessun cliente è selezionato.
  * Per utenti client normali: passa attraverso normalmente.
  */
 export const ClientSelectionGuard: React.FC<ClientSelectionGuardProps> = ({ children }) => {
   const location = useLocation();
   const { needsClientSelection, isLoading } = useClientOrganization();
 
   // Durante il caricamento, mostra i children (evita flash)
   if (isLoading) {
     return <>{children}</>;
   }
 
   // Se l'utente può gestire più clienti ma non ne ha selezionato uno
   // e non è già sulla pagina di selezione clienti
   if (needsClientSelection && location.pathname !== '/clients') {
     return <Navigate to="/clients" replace />;
   }
 
   return <>{children}</>;
 };