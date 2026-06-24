import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { Group, TenantResource, TenantServiceResource } from "@/types/api";

// ─── Persistence key for the selected organization ────────────────────────
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

// ─── Type-safe org flags derived from tenant services ────────────────────
export interface OrganizationFlags {
	hicompliance_enabled: boolean;
	surface_scan360_enabled: boolean;
	dark_risk360_enabled: boolean;
	hipatch_enabled: boolean;
}

/** Derive boolean flags from a list of tenant services. Pure, no side effects. */
export function deriveOrganizationFlags(
	services: TenantServiceResource[],
): OrganizationFlags {
	const isActive = (type: string) =>
		services.some((s) => s.service_type === type && s.status === "active");
	return {
		hicompliance_enabled: isActive("hicompliance"),
		surface_scan360_enabled: isActive("surfacescan"),
		dark_risk360_enabled: isActive("darkrisk"),
		hipatch_enabled: isActive("hipatch"),
	};
}

// ─── Store shape ─────────────────────────────────────────────────────────
interface OrganizationState {
	// Core state
	selectedOrganization: TenantResource | null;
	organizations: TenantResource[];
	selectedGroup: Group | null;
	groups: Group[];

	// Tenant services for the selected organization
	tenantServices: TenantServiceResource[];

	// Derived organization flags (computed on setServices)
	orgFlags: OrganizationFlags;

	// Loading flags
	isLoadingOrganizations: boolean;
	hasFetchedOrganizations: boolean;

	// Actions
	setSelectedOrganization: (org: TenantResource) => void;
	clearSelection: () => void;
	setOrganizations: (orgs: TenantResource[]) => void;
	setSelectedGroup: (group: Group) => void;
	setGroups: (groups: Group[]) => void;
	setTenantServices: (services: TenantServiceResource[]) => void;
	setLoadingOrganizations: (loading: boolean) => void;
	setHasFetchedOrganizations: (fetched: boolean) => void;

	// Selectors (computed via accessor functions on store instance)
}

export const useOrganizationStore = create<OrganizationState>()(
	devtools(
		(set) => ({
			selectedOrganization: getStoredOrganization(),
			organizations: [],
			selectedGroup: null,
			groups: [],
			tenantServices: [],
			orgFlags: deriveOrganizationFlags([]),
			isLoadingOrganizations: true,
			hasFetchedOrganizations: false,

			setSelectedOrganization: (org) => {
				localStorage.setItem(STORAGE_KEY, JSON.stringify(org));
				set({ selectedOrganization: org });
			},

			clearSelection: () => {
				localStorage.removeItem(STORAGE_KEY);
				set({
					selectedOrganization: null,
					tenantServices: [],
					orgFlags: deriveOrganizationFlags([]),
				});
			},

			setOrganizations: (orgs) => set({ organizations: orgs }),

			setSelectedGroup: (group) => set({ selectedGroup: group }),

			setGroups: (groups) => set({ groups }),

			setTenantServices: (services) =>
				set({
					tenantServices: services,
					orgFlags: deriveOrganizationFlags(services),
				}),

			setLoadingOrganizations: (loading) =>
				set({ isLoadingOrganizations: loading }),

			setHasFetchedOrganizations: (fetched) =>
				set({ hasFetchedOrganizations: fetched }),
		}),
		{ name: "organization-store" },
	),
);
