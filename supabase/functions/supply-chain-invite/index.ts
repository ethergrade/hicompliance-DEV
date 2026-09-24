import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

const Body = z.object({
  supplier_id: z.string().uuid(),
  email: z.string().trim().email().max(255),
  due_at: z.string().datetime().optional().nullable(),
  mode: z.enum(["email", "link"]),
  redirect_origin: z.string().url().max(300),
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json(401, { error: "Non autenticato" });

    const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: u, error: uErr } = await userClient.auth.getUser(auth.slice(7));
    if (uErr || !u.user) return json(401, { error: "Non autenticato" });
    const caller = u.user.id;

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: "Dati non validi", details: parsed.error.flatten().fieldErrors });
    const { supplier_id, email, due_at, mode, redirect_origin } = parsed.data;
    const normEmail = email.toLowerCase();

    const admin = createClient(url, service, { auth: { persistSession: false } });

    const { data: supplier } = await admin.from("supplier_directory")
      .select("id, organization_id, archived_at").eq("id", supplier_id).maybeSingle();
    if (!supplier || supplier.archived_at) return json(404, { error: "Fornitore non trovato" });

    // Authorization: org admin or sales/super_admin
    const { data: canAll } = await admin.rpc("can_manage_all_organizations", { _user_id: caller });
    let allowed = !!canAll;
    if (!allowed) {
      const { data: me } = await admin.from("users").select("organization_id, user_type")
        .eq("auth_user_id", caller).eq("organization_id", supplier.organization_id).maybeSingle();
      allowed = !!me && me.user_type === "admin";
    }
    if (!allowed) return json(403, { error: "Permessi insufficienti" });

    // Reject console-user emails
    const { data: consoleUser } = await admin.from("users").select("id").ilike("email", normEmail).maybeSingle();
    if (consoleUser) return json(409, { error: "Questo indirizzo appartiene a un utente della console. Usa un indirizzo dedicato al fornitore." });

    // Existing portal user for this email?
    const { data: existingPortal } = await admin.from("supplier_portal_users")
      .select("id, supplier_id, auth_user_id, is_active").ilike("email", normEmail);
    const otherSupplier = (existingPortal ?? []).find((p) => p.supplier_id !== supplier_id && p.is_active);
    if (otherSupplier) return json(409, { error: "Questo indirizzo è già collegato a un altro fornitore." });
    const samePortal = (existingPortal ?? []).find((p) => p.supplier_id === supplier_id);

    const redirectTo = `${new URL(redirect_origin).origin}/supplier-portal/activate`;
    let authUserId: string | null = samePortal?.auth_user_id ?? null;
    let actionLink: string | null = null;

    if (mode === "email") {
      if (samePortal) {
        const { error } = await admin.auth.resetPasswordForEmail(normEmail, { redirectTo });
        if (error) throw new Error("invio_fallito");
      } else {
        const { data, error } = await admin.auth.admin.inviteUserByEmail(normEmail, { redirectTo });
        if (error) {
          const msg = /registered|exists/i.test(error.message)
            ? "Esiste già un account con questo indirizzo: usa un indirizzo dedicato."
            : "Invio email non riuscito. Prova con \"Genera link\".";
          await admin.from("supplier_invitations").insert({ supplier_id, email: normEmail, status: "failed", invited_by: caller, delivery_mode: mode, error_message: msg });
          return json(409, { error: msg });
        }
        authUserId = data.user?.id ?? null;
      }
    } else {
      const type = samePortal ? "recovery" : "invite";
      const { data, error } = await admin.auth.admin.generateLink({ type, email: normEmail, options: { redirectTo } });
      if (error) {
        const msg = /registered|exists/i.test(error.message)
          ? "Esiste già un account con questo indirizzo: usa un indirizzo dedicato."
          : "Generazione link non riuscita.";
        await admin.from("supplier_invitations").insert({ supplier_id, email: normEmail, status: "failed", invited_by: caller, delivery_mode: mode, error_message: msg });
        return json(409, { error: msg });
      }
      authUserId = data.user?.id ?? authUserId;
      actionLink = data.properties?.action_link ?? null;
    }
    if (!authUserId) return json(500, { error: "Account non creato" });

    await admin.from("supplier_portal_users").upsert({
      supplier_id, auth_user_id: authUserId, email: normEmail, is_active: true,
      must_change_password: true, invited_at: new Date().toISOString(),
    }, { onConflict: "supplier_id,auth_user_id" });

    await admin.from("supplier_invitations").update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("supplier_id", supplier_id).eq("status", "pending");
    await admin.from("supplier_invitations").insert({
      supplier_id, email: normEmail, auth_user_id: authUserId, status: "pending", invited_by: caller,
      delivery_mode: mode, expires_at: new Date(Date.now() + 7 * 864e5).toISOString(),
    });

    await admin.from("supplier_directory").update({
      email: normEmail, portal_enabled: true, assessment_due_at: due_at ?? null,
      status: "invited",
    }).eq("id", supplier_id).in("status", ["draft", "invited", "suspended"]);
    if (due_at) await admin.from("supplier_directory").update({ assessment_due_at: due_at }).eq("id", supplier_id);

    // ensure an open assessment exists
    const { data: open } = await admin.from("supplier_assessments").select("id")
      .eq("supplier_id", supplier_id).in("status", ["not_started", "in_progress", "reopened"]).maybeSingle();
    if (!open) {
      const { data: any } = await admin.from("supplier_assessments").select("id").eq("supplier_id", supplier_id).limit(1);
      if (!any || any.length === 0) {
        await admin.from("supplier_assessments").insert({ supplier_id, status: "not_started", due_at: due_at ?? null, created_by: caller });
      }
    }

    await admin.from("supply_chain_audit_log").insert({
      organization_id: supplier.organization_id, supplier_id, actor_user_id: caller, actor_kind: "customer",
      action: "supplier_invited", metadata: { mode },
    });

    return json(200, { ok: true, link: actionLink });
  } catch (_e) {
    return json(500, { error: "Errore interno durante l'invito" });
  }
});
