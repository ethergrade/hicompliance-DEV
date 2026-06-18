 import { useClientContext } from '@/contexts/ClientContext';
 
 const STORAGE_KEY = 'hicompliance_selected_org';

type ClientOrganizationContext = {
  organizationId: string | null;
  groupId: string | null;
  selectedOrganization: ReturnType<typeof useClientContext>["selectedOrganization"];
  canManageMultipleClients: boolean;
  needsClientSelection: boolean;
  isLoading: boolean;
  hasFetchedOrganizations: boolean;
};

 /**
  * Hook helper che restituisce l'organization_id corretto da usare nelle query.
  * Per utenti sales/admin usa l'organizzazione selezionata dal context.
  * Per utenti client normali usa la loro organizzazione.
  *
  * Also checks localStorage as a fallback — if the selectedOrganization is null
  * but a stored org exists, we skip the redirect to /admin/clients so the
  * ClientProvider has time to restore the full object on mount.
  */
 export const useClientOrganization = (): ClientOrganizationContext => {
   const {
     selectedOrganization,
     canManageMultipleClients,
     userOrganizationId,
     isLoadingClients,
    hasFetchedOrganizations,
   } = useClientContext();

   // L'organization_id da usare nelle query
   // Prefer selectedOrganization for all users (auto-loaded for single-org clients).
   // Non ripiegare su userOrganizationId (che è il groupId, non il companyId):
  // durante il cambio gruppo selectedOrganization è null per un breve window
  // e gli hook devono skippare le chiamate finché il companyId non è pronto.
  const effectiveOrganizationId = selectedOrganization?.id ?? null;


   // Allow pass-through if localStorage has a stored org (even if selectedOrganization is null
   // during the initial mount before ClientProvider restores it).
   const hasStoredOrganization = !!localStorage.getItem(STORAGE_KEY);

   const needsClientSelection = canManageMultipleClients
     && !selectedOrganization
     && !hasStoredOrganization;

   return {
     organizationId: effectiveOrganizationId,
     groupId: selectedOrganization?.group_id ?? null,
     selectedOrganization,
     canManageMultipleClients,
     needsClientSelection,
     isLoading: isLoadingClients,
    hasFetchedOrganizations,
   };
 };
