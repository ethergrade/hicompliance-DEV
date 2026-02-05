 import { useClientContext } from '@/contexts/ClientContext';
 
 /**
  * Hook helper che restituisce l'organization_id corretto da usare nelle query.
  * Per utenti sales/admin usa l'organizzazione selezionata dal context.
  * Per utenti client normali usa la loro organizzazione.
  */
 export const useClientOrganization = () => {
   const {
     selectedOrganization,
     canManageMultipleClients,
     userOrganizationId,
     isLoadingClients,
   } = useClientContext();
 
   // L'organization_id da usare nelle query
   const effectiveOrganizationId = canManageMultipleClients
     ? selectedOrganization?.id || null
     : userOrganizationId;
 
   // Se l'utente può gestire più clienti ma non ne ha selezionato uno
   const needsClientSelection = canManageMultipleClients && !selectedOrganization;
 
   return {
     organizationId: effectiveOrganizationId,
     selectedOrganization,
     canManageMultipleClients,
     needsClientSelection,
     isLoading: isLoadingClients,
   };
 };