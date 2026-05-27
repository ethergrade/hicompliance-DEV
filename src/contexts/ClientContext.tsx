 import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
 import { useAuth } from '@/components/auth/AuthProvider';
 import { useUserRoles } from '@/hooks/useUserRoles';
 import { tenantsApi } from '@/lib/api';
 import type { TenantResource } from '@/types/api';
 
 interface ClientContextType {
   selectedOrganization: TenantResource | null;
   setSelectedOrganization: (org: TenantResource) => void;
   clearSelection: () => void;
   canManageMultipleClients: boolean;
   isLoadingClients: boolean;
   organizations: TenantResource[];
   fetchOrganizations: () => Promise<void>;
   userOrganizationId: string | null;
 }
 
 const ClientContext = createContext<ClientContextType | undefined>(undefined);
 
 const STORAGE_KEY = 'hicompliance_selected_org';

 function getStoredOrganization(): TenantResource | null {
   try {
     const raw = localStorage.getItem(STORAGE_KEY);
     if (raw) return JSON.parse(raw) as TenantResource;
   } catch { /* ignore corrupt data */ }
   return null;
 }
 
 export const ClientProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
   const [selectedOrganization, setSelectedOrganizationState] = useState<TenantResource | null>(getStoredOrganization);
   const [organizations, setOrganizations] = useState<TenantResource[]>([]);
   const [isLoadingClients, setIsLoadingClients] = useState(true);
   const [userOrganizationId, setUserOrganizationId] = useState<string | null>(null);
   const { user, loading: authLoading } = useAuth();
 const { isSuperAdmin, isSales, loading: rolesLoading } = useUserRoles();
  
   const canManageMultipleClients = isSuperAdmin || isSales;

   // Fetch organizations for super-admin/sales users
   const fetchOrganizations = useCallback(async () => {
     if (!user || rolesLoading) return;
     
     setIsLoadingClients(true);
     try {
       // Use the first group's ID as the user's organization
      const primaryGroup = user.groups?.[0];
      setUserOrganizationId(primaryGroup?.id || null);

       if (canManageMultipleClients) {
         // Super-admin/Sales: fetch all tenants
         const tenants = await tenantsApi.listAll();
         setOrganizations(tenants);

         // Restore from localStorage (already handled in useState init, but
         // refresh with fresh API data here to ensure name/code are current)
         const stored = getStoredOrganization();
         if (stored && !selectedOrganization) {
           const fresh = tenants.find(t => t.id === stored.id);
           if (fresh) setSelectedOrganizationState(fresh);
         }
       } else {
         // Normal client: use their own tenant
         const primaryGroup = user.groups?.[0];
       if (primaryGroup?.id) {
           const tenant = await tenantsApi.getOwn();
           setOrganizations([tenant]);
           setSelectedOrganizationState(tenant);
         }
       }
     } catch (error) {
       console.error('Error fetching organizations:', error);
     } finally {
       setIsLoadingClients(false);
     }
   }, [user, canManageMultipleClients, rolesLoading]);
 
   // Set selected organization with persistence
   const setSelectedOrganization = useCallback((org: TenantResource) => {
     setSelectedOrganizationState(org);
     localStorage.setItem(STORAGE_KEY, JSON.stringify(org));
   }, []);
 
   // Clear selection (for switching clients)
   const clearSelection = useCallback(() => {
     setSelectedOrganizationState(null);
     localStorage.removeItem(STORAGE_KEY);
   }, []);
 
   // Fetch organizations on auth change
   // IMPORTANT: authLoading guard prevents clearing stored org during initial page load
   useEffect(() => {
     if (authLoading) return; // Wait for auth to resolve
     if (user && !rolesLoading) {
       fetchOrganizations();
     } else if (!user) {
       // User explicitly logged out — clear everything
       setOrganizations([]);
       setSelectedOrganizationState(null);
       setUserOrganizationId(null);
       localStorage.removeItem(STORAGE_KEY);
     }
   }, [user, rolesLoading, fetchOrganizations, authLoading]);
 
   return (
     <ClientContext.Provider
       value={{
         selectedOrganization,
         setSelectedOrganization,
         clearSelection,
         canManageMultipleClients,
         isLoadingClients,
         organizations,
         fetchOrganizations,
         userOrganizationId,
       }}
     >
       {children}
     </ClientContext.Provider>
   );
 };
 
 export const useClientContext = () => {
   const context = useContext(ClientContext);
   if (context === undefined) {
     throw new Error('useClientContext must be used within a ClientProvider');
   }
   return context;
 };
