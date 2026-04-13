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
 
 export const ClientProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
   const [selectedOrganization, setSelectedOrganizationState] = useState<TenantResource | null>(null);
   const [organizations, setOrganizations] = useState<TenantResource[]>([]);
   const [isLoadingClients, setIsLoadingClients] = useState(true);
   const [userOrganizationId, setUserOrganizationId] = useState<string | null>(null);
   const { user } = useAuth();
 const { isSuperAdmin, isSales, loading: rolesLoading } = useUserRoles();
   
   const canManageMultipleClients = isSuperAdmin || isSales;

   // Fetch organizations for sales/admin users
   const fetchOrganizations = useCallback(async () => {
     if (!user || rolesLoading) return;
     
     setIsLoadingClients(true);
     try {
       setUserOrganizationId(user.tenant_id || null);

       if (canManageMultipleClients) {
         // Sales/Admin: fetch all tenants
         const tenants = await tenantsApi.listAll();
         setOrganizations(tenants);

         // Try to restore from localStorage
         const storedOrgId = localStorage.getItem(STORAGE_KEY);
         if (storedOrgId) {
           const storedOrg = tenants.find(t => t.id === storedOrgId);
           if (storedOrg) {
             setSelectedOrganizationState(storedOrg);
           }
         }
       } else {
         // Normal client: use their own tenant
         if (user.tenant_id) {
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
     localStorage.setItem(STORAGE_KEY, org.id);
   }, []);
 
   // Clear selection (for switching clients)
   const clearSelection = useCallback(() => {
     setSelectedOrganizationState(null);
     localStorage.removeItem(STORAGE_KEY);
   }, []);
 
   // Fetch organizations on auth change
   useEffect(() => {
     if (user && !rolesLoading) {
       fetchOrganizations();
     } else if (!user) {
       setOrganizations([]);
       setSelectedOrganizationState(null);
       setUserOrganizationId(null);
       localStorage.removeItem(STORAGE_KEY);
     }
   }, [user, rolesLoading, fetchOrganizations]);
 
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