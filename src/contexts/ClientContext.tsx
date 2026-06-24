import React, {
	createContext,
	useContext,
	useState,
	useEffect,
	useCallback,
} from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useUserRoles } from "@/hooks/useUserRoles";
import { tenantsApi } from "@/lib/api";
import { authApi } from "@/lib/api/auth";
import type { TenantResource, Group } from "@/types/api";

interface ClientContextType {
	selectedOrganization: TenantResource | null;
	setSelectedOrganization: (org: TenantResource) => void;
	clearSelection: () => void;
	selectedGroup: Group | null;
	setSelectedGroup: (group: Group) => void;
	groups: Group[];
	canManageMultipleClients: boolean;
	isLoadingClients: boolean;
	organizations: TenantResource[];
	fetchOrganizations: () => Promise<void>;
	userOrganizationId: string | null;
	hasFetchedOrganizations: boolean;
}

const ClientContext = createContext<ClientContextType | undefined>(undefined);

const STORAGE_KEY = "hicompliance_selected_org";

function getStoredOrganization(): TenantResource | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) return JSON.parse(raw) as TenantResource;
	} catch {
		/* ignore corrupt data */
	}
	return null;
}

export const ClientProvider: React.FC<{ children: React.ReactNode }> = ({
	children,
}) => {
	const [selectedOrganization, setSelectedOrganizationState] =
		useState<TenantResource | null>(getStoredOrganization);
	const [organizations, setOrganizations] = useState<TenantResource[]>([]);
	const [groups, setGroups] = useState<Group[]>([]);
	const [selectedGroup, setSelectedGroupState] = useState<Group | null>(null);
	const [isLoadingClients, setIsLoadingClients] = useState(true);
	const [hasFetchedOrganizations, setHasFetchedOrganizations] = useState(false);
	const [userOrganizationId, setUserOrganizationId] = useState<string | null>(
		null,
	);
	const { user, loading: authLoading, refreshCapabilities } = useAuth();
	const { isSuperAdmin, isSales, loading: rolesLoading } = useUserRoles();

	const canManageMultipleClients = isSuperAdmin || isSales;

	// Fetch organizations for super-admin/sales users
	const fetchOrganizations = useCallback(async () => {
		if (!user || rolesLoading) return;

		setIsLoadingClients(true);
		try {
			// Resolve group: use user.groups if present, else fetch from API for superadmins
			let resolveGroupId: string | null = null;
			const primaryGroup = user.groups?.[0];
			if (primaryGroup?.id) {
				resolveGroupId = primaryGroup.id;
			} else if (canManageMultipleClients) {
				// Superadmin without groups in /auth/me — fetch from /auth/groups
				try {
					const apiGroups = await authApi.groups();
					resolveGroupId = apiGroups[0]?.id || null;
					setGroups(apiGroups);
					if (apiGroups.length > 0 && !selectedGroup) {
						setSelectedGroupState(apiGroups[0]);
					}
				} catch {
					/* ignore */
				}
			}
			setUserOrganizationId(resolveGroupId);

			if (canManageMultipleClients) {
				// Super-admin/Sales: fetch companies for the resolved group
				const tenants = resolveGroupId
					? await tenantsApi.listAll(resolveGroupId)
					: [];
				setOrganizations(tenants);

				// Restore from localStorage (already handled in useState init, but
				// refresh with fresh API data here to ensure name/code are current)
				const stored = getStoredOrganization();
				if (stored && !selectedOrganization) {
					const fresh = tenants.find((t) => t.id === stored.id);
					if (fresh) setSelectedOrganizationState(fresh);
				}
				// No auto-selection: user must explicitly pick a client from /admin/clients
			} else if (resolveGroupId) {
				// Normal client with single org: fetch their company by group and auto-select
				// (single-tenant users have no reason to pick — their only tenant is the one)
				try {
					const tenants = await tenantsApi.listAll(resolveGroupId);
					setOrganizations(tenants);
					if (tenants.length > 0 && !selectedOrganization) {
						setSelectedOrganizationState(tenants[0]);
						localStorage.setItem(STORAGE_KEY, JSON.stringify(tenants[0]));
					}
				} catch {
					/* ignore */
				}
			}
		} catch (error) {
			console.error("Error fetching organizations:", error);
		} finally {
			setIsLoadingClients(false);
			setHasFetchedOrganizations(true);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
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
			setHasFetchedOrganizations(false);
		}
	}, [user, rolesLoading, fetchOrganizations, authLoading]);

	// Set selected group and reload organizations for that group
	const setSelectedGroup = useCallback(
		async (group: Group) => {
			setSelectedGroupState(group);
			setSelectedOrganizationState(null); // Clear org when group changes
			localStorage.removeItem(STORAGE_KEY);

			// Ricarica capabilities per il nuovo gruppo prima di caricare le organizzazioni
			await refreshCapabilities(group.id);

			// Load organizations for the selected group
			setIsLoadingClients(true);
			try {
				const tenants = await tenantsApi.listAll(group.id);
				setOrganizations(tenants);
				// No auto-selection: user must pick a client explicitly
				localStorage.removeItem(STORAGE_KEY);
			} catch (error) {
				console.error("Error loading organizations for group:", error);
				setOrganizations([]);
			} finally {
				setIsLoadingClients(false);
			}
		},
		[setSelectedOrganizationState, refreshCapabilities],
	);

	return (
		<ClientContext.Provider
			value={{
				selectedOrganization,
				setSelectedOrganization,
				clearSelection,
				selectedGroup,
				setSelectedGroup,
				groups,
				canManageMultipleClients,
				isLoadingClients,
				organizations,
				fetchOrganizations,
				userOrganizationId,
				hasFetchedOrganizations,
			}}
		>
			{children}
		</ClientContext.Provider>
	);
};
// eslint-disable-next-line react-refresh/only-export-components -- hook consumed via context alongside the provider
export const useClientContext = () => {
	const context = useContext(ClientContext);
	if (context === undefined) {
		throw new Error("useClientContext must be used within a ClientProvider");
	}
	return context;
};
