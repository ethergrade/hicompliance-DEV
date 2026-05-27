 import { useClientContext } from '@/contexts/ClientContext';
 
 const STORAGE_KEY = 'hicompliance_selected_org';

 /**
  * Hook helper che restituisce l'organization_id corretto da usare nelle query.
  * Per utenti sales/admin usa l'organizzazione selezionata dal context.
  * Per utenti client normali usa la loro organizzazione.
  *
  * Also checks localStorage as a fallback — if the selectedOrganization is null
  * but a stored org exists, we skip the redirect to /admin/clients so the
  * ClientProvider has time to restore the full object on mount.
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

   // Allow pass-through if localStorage has a stored org (even if selectedOrganization is null
   // during the initial mount before ClientProvider restores it).
   const hasStoredOrganization = !!localStorage.getItem(STORAGE_KEY);

   const needsClientSelection = canManageMultipleClients
     && !selectedOrganization
     && !hasStoredOrganization;

   return {
     organizationId: effectiveOrganizationId,
     selectedOrganization,
     canManageMultipleClients,
     needsClientSelection,
     isLoading: isLoadingClients,
   };
 };
