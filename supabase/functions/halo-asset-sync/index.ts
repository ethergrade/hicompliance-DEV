import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function haloToken(base: string) {
  const id = Deno.env.get("HALO_CLIENT_ID"), secret = Deno.env.get("HALO_CLIENT_SECRET");
  if (!id || !secret) throw new Error("Credenziali Halo non configurate");
  const r = await fetch(`${base}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret, scope: "all" }),
  });
  if (!r.ok) throw new Error(`Token Halo [${r.status}]: ${await r.text()}`);
  return (await r.json()).access_token as string;
}

// deno-lint-ignore no-explicit-any
const cf = (a: any, name: string) => a.fields?.find?.((f: any) => f.name === name)?.display ?? a.customfields?.find?.((f: any) => f.name === name)?.display;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return json({ error: "Non autenticato" }, 401);
    const { action, organization_id, search } = await req.json();
    const base = (Deno.env.get("HALO_BASE_URL") ?? "").replace(/\/$/, "");
    if (!base) return json({ error: "HALO_BASE_URL non configurato" }, 400);
    const token = await haloToken(base);
    const H = { Authorization: `Bearer ${token}` };

    if (action === "test") return json({ ok: true });
    if (action === "clients") {
      const r = await fetch(`${base}/api/Client?pageinate=true&page_size=50&page_no=1${search ? `&search=${encodeURIComponent(search)}` : ""}`, { headers: H });
      if (!r.ok) return json({ error: "Halo", status: r.status, details: await r.text() }, r.status);
      const d = await r.json();
      // deno-lint-ignore no-explicit-any
      return json({ clients: (d.clients ?? d).map((c: any) => ({ id: String(c.id), name: c.name })) });
    }
    if (action !== "sync" || !organization_id) return json({ error: "Richiesta non valida" }, 400);

    // verifica accesso al cliente con il token dell'utente
    const { data: link, error: le } = await userClient.from("asset_halo_links").select("*").eq("organization_id", organization_id).maybeSingle();
    if (le || !link?.halo_client_id) return json({ error: "Cliente Halo non collegato" }, 400);
    const map = link.field_mapping ?? {};
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: existing } = await admin.from("managed_assets").select("id,internal_code,halo_asset_id").eq("organization_id", organization_id);
    let next = Math.max(0, ...(existing ?? []).map((e) => parseInt(e.internal_code) || 0)) + 1;
    const byHalo = new Map((existing ?? []).filter((e) => e.halo_asset_id).map((e) => [e.halo_asset_id, e]));

    let page = 1, total = 0;
    while (page < 50) {
      const r = await fetch(`${base}/api/Asset?client_id=${link.halo_client_id}&pageinate=true&page_size=50&page_no=${page}`, { headers: H });
      if (!r.ok) throw new Error(`Asset Halo [${r.status}]: ${await r.text()}`);
      const d = await r.json();
      const list = d.assets ?? [];
      if (!list.length) break;
      // deno-lint-ignore no-explicit-any
      const detailed: any[] = [];
      for (let i = 0; i < list.length; i += 10) {
        detailed.push(...await Promise.all(list.slice(i, i + 10).map(async (lite: { id: number }) => {
          const dr = await fetch(`${base}/api/Asset/${lite.id}?includedetails=true`, { headers: H });
          return dr.ok ? { ...lite, ...(await dr.json()) } : lite;
        })));
      }
      const rows = detailed.map((a) => {
        const ex = byHalo.get(String(a.id));
        return {
          ...(ex ? { id: ex.id, internal_code: ex.internal_code } : { internal_code: String(next++).padStart(3, "0") }),
          organization_id, source: "halo", halo_asset_id: String(a.id), last_synced_at: new Date().toISOString(),
          asset_number: cf(a, map.asset_number ?? "CFASAssetNumber") ?? cf(a, "CFnumerazioneas") ?? null,
          asset_type: cf(a, "CFASsetType") ?? a.assettype_name ?? null,
          model: cf(a, "CFASModelCustomer") ?? (a.model || null),
          name: cf(a, "CFASName") ?? cf(a, "CFtitolo") ?? (a.inventory_number || `${a.assettype_name ?? "Asset"} #${a.device_number ?? a.id}`),
          serial_number: cf(a, "CFASerialNumber") ?? (a.key_field2 || null),
          status: a.status_name || null,
          status_cliente: cf(a, "CFStatus_Cliente") ?? cf(a, "CFstato") ?? null,
          assignee: a.users?.[0]?.name ?? (a.username || null),
          site: a.site_name || null,
          supplier: a.supplier_name || null,
        };
      });
      const { error: ue } = await admin.from("managed_assets").upsert(rows.filter((x) => "id" in x));
      if (ue) throw new Error(ue.message);
      const { error: ie } = await admin.from("managed_assets").insert(rows.filter((x) => !("id" in x)));
      if (ie) throw new Error(ie.message);
      total += rows.length;
      if (list.length < 50 || (d.record_count && page * 50 >= d.record_count)) break;
      page++;
    }
    await admin.from("asset_halo_links").update({ last_sync_at: new Date().toISOString(), last_sync_status: "ok", last_sync_message: `${total} asset sincronizzati` }).eq("organization_id", organization_id);
    return json({ ok: true, total });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
