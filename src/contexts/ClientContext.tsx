 import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
 import { supabase } from '@/integrations/supabase/client';
 import { useAuth } from '@/components/auth/AuthProvider';
 import { useUserRoles } from '@/hooks/useUserRoles';
 
 interface Organization {
   id: string;
   name: string;
   code: string;
   created_at: string;
 }
 
 interface ClientContextType {
   selectedOrganization: Organization | null;
   setSelectedOrganization: (org: Organization) => void;
   clearSelection: () => void;
   canManageMultipleClients: boolean;
   isLoadingClients: boolean;
   organizations: Organization[];
   fetchOrganizations: () => Promise<void>;
   userOrganizationId: string | null;
 }
 
 const ClientContext = createContext<ClientContextType | undefined>(undefined);
 
 const STORAGE_KEY = 'hicompliance_selected_org';
 
 export const ClientProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
   const [selectedOrganization, setSelectedOrganizationState] = useState<Organization | null>(null);
   const [organizations, setOrganizations] = useState<Organization[]>([]);
   const [isLoadingClients, setIsLoadingClients] = useState(true);
   const [userOrganizationId, setUserOrganizationId] = useState<string | null>(null);
   const { user, userProfile } = useAuth();
 const { isSuperAdmin, isSales, loading: rolesLoading } = useUserRoles();
   
   const canManageMultipleClients = isSuperAdmin || isSales;
 
   // Fetch organizations for sales/admin users
   const fetchOrganizations = useCallback(async () => {
     if (!user || rolesLoading) return;
     
     setIsLoadingClients(true);
     try {
       // First get user's own organization
       const { data: userData } = await supabase
         .from('users')
         .select('organization_id')
         .eq('auth_user_id', user.id)
         .single();
       
       setUserOrganizationId(userData?.organization_id || null);
 
       if (canManageMultipleClients) {
         // Sales/Admin: fetch all organizations
         const { data, error } = await supabase
           .from('organizations')
           .select('id, name, code, created_at')
           .order('name');
 
         if (error) throw error;
         setOrganizations(data || []);
 
         // Try to restore from localStorage
         const storedOrgId = localStorage.getItem(STORAGE_KEY);
         if (storedOrgId && data) {
           const storedOrg = data.find(o => o.id === storedOrgId);
           if (storedOrg) {
             setSelectedOrganizationState(storedOrg);
           }
         }
       } else {
         // Normal client: use their organization
         if (userData?.organization_id) {
           const { data: orgData } = await supabase
             .from('organizations')
             .select('id, name, code, created_at')
             .eq('id', userData.organization_id)
             .single();
           
           if (orgData) {
             setOrganizations([orgData]);
             setSelectedOrganizationState(orgData);
           }
         }
       }
     } catch (error) {
       console.error('Error fetching organizations:', error);
     } finally {
       setIsLoadingClients(false);
     }
   }, [user, canManageMultipleClients, rolesLoading]);
 
   // Set selected organization with persistence
   const setSelectedOrganization = useCallback((org: Organization) => {
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