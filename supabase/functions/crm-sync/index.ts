// Generic CRM sync API. Sync key: Partita IVA (vat_number). Auth: header x-crm-token = CRM_SYNC_TOKEN.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

const STATUSES = ["proposto", "inviato", "in_trattativa", "accettato", "rifiutato", "in_esecuzione", "completato"] as const;
const Vat = z.string().min(5).max(20);
const Body = z.discriminatedUnion("action", [
	z.object({ action: z.literal("upsert_client"), vat_number: Vat, name: z.string().min(1).max(200),
		legal_name: z.string().max(300).optional(), email: z.string().email().optional(), pec: z.string().email().optional(),
		phone: z.string().max(50).optional(), business_sector: z.string().max(200).optional(), legal_address: z.string().max(500).optional(),
		create_remediations: z.boolean().default(true), template_categories: z.array(z.string()).optional() }),
	z.object({ action: z.literal("list_remediations"), vat_number: Vat }),
	z.object({ action: z.literal("update_remediation"), vat_number: Vat, task_id: z.string().uuid(),
		status: z.enum(STATUSES).optional(), budget: z.number().min(0).nullable().optional(), notes: z.string().max(2000).optional() }),
	z.object({ action: z.literal("list_changes"), since_id: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(500).default(200),
		include_crm_origin: z.boolean().default(false) }),
]);

export const normalizeVat = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^IT(?=\d{11}$)/, "");
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function safeEqual(a: string, b: string) {
	if (a.length !== b.length) return false;
	let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return r === 0;
}

Deno.serve(async (req) => {
	if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
	if (req.method !== "POST") return json({ error: "Use POST" }, 405);
	const expected = Deno.env.get("CRM_SYNC_TOKEN");
	if (!expected) return json({ error: "CRM_SYNC_TOKEN not configured" }, 500);
	if (!safeEqual(req.headers.get("x-crm-token") ?? "", expected)) return json({ error: "Unauthorized" }, 401);

	let raw: unknown; try { raw = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
	const parsed = Body.safeParse(raw);
	if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
	const b = parsed.data;
	const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

	const findOrg = async (vat: string) => {
		const n = normalizeVat(vat);
		const { data } = await db.from("organization_profiles").select("organization_id,vat_number").not("vat_number", "is", null);
		return (data ?? []).find((p: any) => normalizeVat(p.vat_number) === n)?.organization_id as string | undefined;
	};
	const tasksOf = async (orgId: string) => {
		const { data: t } = await db.from("remediation_tasks").select("id,task,category,priority,progress,budget,start_date,end_date")
			.eq("organization_id", orgId).or("is_deleted.is.null,is_deleted.eq.false");
		const ids = (t ?? []).map((x: any) => x.id);
		const { data: c } = ids.length ? await db.from("remediation_commercial").select("task_id,status,notes").in("task_id", ids) : { data: [] };
		const m = new Map((c ?? []).map((x: any) => [x.task_id, x]));
		return (t ?? []).map((x: any) => ({ ...x, status: (m.get(x.id) as any)?.status ?? "proposto", notes: (m.get(x.id) as any)?.notes ?? null }));
	};

	try {
		if (b.action === "upsert_client") {
			let orgId = await findOrg(b.vat_number);
			const created = !orgId;
			if (!orgId) {
				const code = (b.name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) || "CLIENTE") + "-" + normalizeVat(b.vat_number).slice(-5);
				const { data, error } = await db.from("organizations").insert({ name: b.name, code }).select("id").single();
				if (error) throw error;
				orgId = data.id;
			}
			const profile: Record<string, unknown> = { organization_id: orgId, vat_number: normalizeVat(b.vat_number) };
			for (const k of ["legal_name", "email", "pec", "phone", "business_sector", "legal_address"] as const) if (b[k] !== undefined) profile[k] = b[k];
			if (!profile.legal_name && created) profile.legal_name = b.name;
			const { error: pe } = await db.from("organization_profiles").upsert(profile, { onConflict: "organization_id" });
			if (pe) throw pe;

			let createdTasks = 0;
			const existing = await tasksOf(orgId!);
			if (b.create_remediations && existing.length === 0) {
				let q = db.from("remediation_templates").select("category,task_name,estimated_days,priority");
				if (b.template_categories?.length) q = q.in("category", b.template_categories);
				const { data: tpl, error: te } = await q;
				if (te) throw te;
				const start = new Date();
				const rows = (tpl ?? []).map((t: any, i: number) => {
					const end = new Date(start.getTime() + Math.max(1, t.estimated_days ?? 7) * 86400000);
					return { organization_id: orgId, task: t.task_name, category: t.category, priority: t.priority, progress: 0,
						start_date: start.toISOString().slice(0, 10), end_date: end.toISOString().slice(0, 10), display_order: i, source: "crm" };
				});
				if (rows.length) { const { error } = await db.from("remediation_tasks").insert(rows); if (error) throw error; }
				createdTasks = rows.length;
			}
			return json({ organization_id: orgId, created, remediations_created: createdTasks, remediations: await tasksOf(orgId!) });
		}

		if (b.action === "list_remediations") {
			const orgId = await findOrg(b.vat_number);
			if (!orgId) return json({ error: "Client not found for vat_number" }, 404);
			return json({ organization_id: orgId, remediations: await tasksOf(orgId) });
		}

		if (b.action === "update_remediation") {
			const orgId = await findOrg(b.vat_number);
			if (!orgId) return json({ error: "Client not found for vat_number" }, 404);
			const { data: t } = await db.from("remediation_tasks").select("id").eq("id", b.task_id).eq("organization_id", orgId).maybeSingle();
			if (!t) return json({ error: "Remediation not found for this client" }, 404);
			const patch: Record<string, unknown> = { task_id: b.task_id, organization_id: orgId };
			const today = new Date().toISOString().slice(0, 10);
			if (b.status) {
				patch.status = b.status;
				if (b.status === "inviato") patch.proposed_at = today;
				if (["accettato", "rifiutato", "in_esecuzione", "completato"].includes(b.status)) patch.closed_at = today;
			}
			if (b.budget !== undefined) patch.proposed_value = b.budget;
			if (b.notes !== undefined) patch.notes = b.notes;
			const { error } = await db.from("remediation_commercial").upsert(patch, { onConflict: "task_id" });
			if (error) throw error;
			if (b.budget !== undefined) await db.from("remediation_tasks").update({ budget: b.budget }).eq("id", b.task_id);
			return json({ ok: true, remediation: (await tasksOf(orgId)).find((x: any) => x.id === b.task_id) });
		}

		// list_changes
		let q = db.from("crm_sync_events").select("*").gt("id", b.since_id).order("id").limit(b.limit);
		if (!b.include_crm_origin) q = q.neq("origin", "crm");
		const { data, error } = await q;
		if (error) throw error;
		return json({ changes: data ?? [], next_since_id: data?.length ? data[data.length - 1].id : b.since_id });
	} catch (e: any) {
		console.error("crm-sync error", e);
		return json({ error: e?.message ?? String(e) }, 500);
	}
});
