// Costruisce l'utente dell'app (stesso formato usato prima dal server Laravel)
// partendo dall'accesso e dai dati presenti nel database Supabase.
import { supabase } from "@/integrations/supabase/client";
import type { LoginUser, TenantResource, Group } from "@/types/api";

export const SUPABASE_GROUP_ID = "supabase";

export async function buildLoginUser(authUserId: string, email: string): Promise<LoginUser> {
	const [{ data: roles }, { data: profile }] = await Promise.all([
		supabase.from("user_roles").select("role").eq("user_id", authUserId),
		supabase
			.from("users")
			.select("full_name, user_type, organization_id")
			.eq("auth_user_id", authUserId)
			.maybeSingle(),
	]);

	const roleList = (roles ?? []).map((r) => String(r.role));
	const isSuperAdmin = roleList.includes("super_admin");
	const isSales = roleList.includes("sales");
	const userType = isSuperAdmin ? "admin" : isSales ? "sales" : (profile?.user_type ?? "client");
	// Il ruolo del gruppo viene letto da useUserRoles per ricavare i permessi.
	const groupRole = isSuperAdmin ? "super_admin" : isSales ? "sales" : userType === "admin" ? "admin" : "customer";

	const group = {
		id: SUPABASE_GROUP_ID,
		name: "HiSolution",
		is_active: true,
		role: groupRole,
	} as Group & { role: string };

	return {
		id: authUserId,
		name: profile?.full_name || email,
		email,
		is_super_admin: isSuperAdmin,
		groups: [group],
		// capabilities non impostate = tutti i moduli visibili (come da compatibilità esistente)
		capabilities: undefined,
		user_type: userType,
		auth_method: "native",
		mfa_configured: false,
		mfa_recommended: false,
	};
}

/** Organizzazioni visibili all'utente (le regole del database filtrano per ruolo). */
export async function listSupabaseTenants(): Promise<TenantResource[]> {
	const [{ data: orgs, error }, { data: profiles }] = await Promise.all([
		supabase.from("organizations").select("*").order("name"),
		supabase.from("organization_profiles").select("*"),
	]);
	if (error) throw error;
	const byOrg = new Map((profiles ?? []).map((p) => [p.organization_id, p]));
	return (orgs ?? []).map((o) => {
		const p = byOrg.get(o.id);
		return {
			id: o.id,
			group_id: SUPABASE_GROUP_ID,
			customer_code: o.code,
			name: o.name,
			ms_tenant_id: null,
			contact_first_name: null,
			contact_last_name: null,
			phone: p?.phone ?? null,
			vat_number: p?.vat_number ?? null,
			primary_domain: null,
			primary_subnet: null,
			secondary_domain: null,
			secondary_subnet: null,
			revenue: null,
			employees_count: null,
			industry: p?.business_sector ?? null,
			customer_sectors: null,
			implemented_technologies: null,
			status: o.services_paused ? 0 : 1,
			firewalls_count: null,
			endpoints_count: null,
			servers_count: null,
			vms_count: null,
			created_at: o.created_at,
			legal_name: p?.legal_name ?? null,
			fiscal_code: p?.fiscal_code ?? null,
			legal_address: p?.legal_address ?? null,
			operational_address: p?.operational_address ?? null,
			pec: p?.pec ?? null,
			email: p?.email ?? null,
			nis2_classification: (p?.nis2_classification as TenantResource["nis2_classification"]) ?? null,
		} as TenantResource;
	});
}
