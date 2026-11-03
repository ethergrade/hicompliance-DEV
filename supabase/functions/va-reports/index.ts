import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Proxy in sola lettura verso le API VA di Nove (v1). Il token NOVE_API_TOKEN non lascia mai il server.
 * Azioni: clients (super admin/sales), link (super admin/sales), reviews, review, zip, password.
 */
const NOVE_HOST = (Deno.env.get("NOVE_API_HOST") ?? "").trim().replace(/\/+$/, "").replace(/\/api\/v1$/, "");
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const ERR: Record<string, string> = {
  non_autenticato: "Token Nove non valido, scaduto o revocato",
  non_autorizzato: "Il token Nove non ha il permesso per questa operazione",
  ip_non_ammesso: "Indirizzo del server non ammesso dal token Nove",
  https_richiesto: "Nove richiede HTTPS",
  non_trovato: "Report non trovato o non scaricabile",
  troppe_richieste: "Troppe richieste a Nove, riprova tra poco",
  troppi_tentativi: "Troppi tentativi verso Nove, riprova tra poco",
};

async function nove(path: string, raw = false) {
  const token = Deno.env.get("NOVE_API_TOKEN");
  if (!token) throw { status: 400, message: "Token Nove non configurato" };
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(NOVE_HOST)) throw { status: 400, message: "Indirizzo del server Nove non configurato (NOVE_API_HOST)" };
  let r: Response;
  try {
    r = await fetch(NOVE_HOST + path, {
    headers: { Authorization: `Bearer ${token}`, Accept: raw ? "application/zip" : "application/json" },
    redirect: "manual",
    });
  } catch {
    throw { status: 502, message: "Server Nove non raggiungibile: verifica l'indirizzo (NOVE_API_HOST) e che sia accessibile da internet" };
  }
  if (r.status !== 200) {
    let code = "";
    try { code = (await r.json()).codice ?? ""; } catch { /* */ }
    throw { status: r.status === 404 ? 404 : 502, message: ERR[code] ?? `Errore Nove (${r.status})`, code };
  }
  return raw ? r : r.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return json({ error: "Non autenticato" }, 401);
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { action, organization_id, review_id, q, cliente_id, cliente_name } = await req.json();

    const { data: isManager } = await admin.rpc("can_manage_all_organizations", { _user_id: u.user.id });

    if (action === "clients") {
      if (!isManager) return json({ error: "Solo Super Admin e Sales" }, 403);
      const d = await nove(`/api/v1/va/clienti/${q ? `?q=${encodeURIComponent(String(q))}` : ""}`);
      return json(d);
    }

    if (!organization_id) return json({ error: "Cliente mancante" }, 400);
    const { data: canAccess } = await userClient.rpc("doc_can_access_org", { _org: organization_id });
    if (!canAccess) return json({ error: "Accesso negato" }, 403);

    if (action === "link") {
      if (!isManager) return json({ error: "Solo Super Admin e Sales" }, 403);
      const id = cliente_id == null ? null : Number(cliente_id);
      if (id !== null && !Number.isInteger(id)) return json({ error: "Cliente non valido" }, 400);
      await admin.from("organizations").update({ nove_cliente_id: id, nove_cliente_name: id ? cliente_name ?? null : null }).eq("id", organization_id);
      await admin.from("integration_audit_logs").insert({
        action: id ? "va_link" : "va_unlink", service_name: "nove_va", organization_id,
        changed_by: u.user.id, changed_by_email: u.user.email, new_values: { cliente_id: id, cliente_name },
      });
      return json({ ok: true });
    }

    const { data: org } = await admin.from("organizations").select("nove_cliente_id,nove_cliente_name").eq("id", organization_id).single();
    if (!org?.nove_cliente_id) return json({ linked: false, review: [] });
    const cid = org.nove_cliente_id;

    if (action === "reviews") {
      const d = await nove(`/api/v1/va/clienti/${cid}/review/`);
      return json({ linked: true, cliente: d.cliente ?? { id: cid, ragione_sociale: org.nove_cliente_name }, review: d.review ?? [] });
    }

    const rid = Number(review_id);
    if (!Number.isInteger(rid)) return json({ error: "Report non valido" }, 400);
    // la review deve appartenere al cliente collegato
    const detail = await nove(`/api/v1/va/review/${rid}/`);
    if (Number(detail?.cliente?.id) !== Number(cid)) return json({ error: "Report non trovato" }, 404);

    if (action === "review") return json(detail);

    if (action === "zip" || action === "password") {
      await admin.from("integration_audit_logs").insert({
        action: action === "zip" ? "va_zip_download" : "va_password_read", service_name: "nove_va", organization_id,
        changed_by: u.user.id, changed_by_email: u.user.email, new_values: { review_id: rid },
      });
      if (action === "password") return json(await nove(`/api/v1/va/review/${rid}/password/`));
      const r = (await nove(`/api/v1/va/review/${rid}/zip/`, true)) as Response;
      return new Response(r.body, {
        headers: { ...cors, "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${detail?.zip?.nome_file ?? `VA_${rid}.zip`}"` },
      });
    }
    return json({ error: "Azione non valida" }, 400);
  } catch (e) {
    // deno-lint-ignore no-explicit-any
    const err = e as any;
    return json({ error: err?.message ?? "Errore interno" }, err?.status ?? 500);
  }
});
