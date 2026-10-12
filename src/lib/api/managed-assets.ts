import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface ManagedAsset {
  id: string;
  organization_id: string;
  internal_code: string;
  asset_number: string | null;
  asset_type: string | null;
  model: string | null;
  name: string | null;
  serial_number: string | null;
  status: string | null;
  status_cliente: string | null;
  pin: string | null;
  puk: string | null;
  assignee: string | null;
  date_of_assign: string | null;
  purchase_type: string | null;
  contract_number: string | null;
  start_contract_date: string | null;
  end_contract_date: string | null;
  asset_cost: number | null;
  asset_cost_nd: boolean;
  warranty_type: string | null;
  warranty_cost: number | null;
  warranty_start_date: string | null;
  warranty_expiration: string | null;
  ddt_number: string | null;
  ddt_date: string | null;
  supplier: string | null;
  note: string | null;
  site: string | null;
  source: "manual" | "halo";
  halo_asset_id: string | null;
  last_synced_at: string | null;
}

export type LookupKind = "asset_type" | "status" | "purchase_type" | "supplier" | "assignee";

export const DEFAULT_LOOKUPS: Record<LookupKind, string[]> = {
  asset_type: ["SIM", "e-SIM", "Mobile Phone", "Laptop", "Monitor", "License", "Server", "Access Point", "Firewall", "Switch", "Network Device", "Printer"],
  status: ["New", "Available", "Assigned", "Disposed of", "Stolen", "To be disposed of", "To be repaired"],
  purchase_type: ["Noleggio", "Acquisto"],
  supplier: [],
  assignee: ["IT Warehouse", "Meeting Room 1-1", "Meeting Room 1-2", "Meeting Room 1-3", "Meeting Room 2-1", "Meeting Room 2-2", "Meeting Room 2-3", "Meeting Room 2-4"],
};

/** Columns in AKC Excel order: [field, header, required] */
export const ASSET_COLUMNS: [keyof ManagedAsset, string, boolean][] = [
  ["internal_code", "Internal Code", true], ["asset_number", "Asset Number", true], ["asset_type", "Asset Type", true],
  ["model", "Model", true], ["name", "Name", false], ["serial_number", "Serial Number", true], ["status", "Status", true],
  ["status_cliente", "Status Cliente", false], ["pin", "PIN", false], ["puk", "PUK", false], ["assignee", "Assignee", true],
  ["date_of_assign", "Date of assign", false], ["purchase_type", "Purchase type", false], ["contract_number", "Contract number", false],
  ["start_contract_date", "Start contract date", false], ["end_contract_date", "End contract date", false],
  ["asset_cost", "Asset cost", true], ["warranty_type", "Warranty type", false], ["warranty_cost", "Warranty cost", false],
  ["warranty_start_date", "Warranty start date", false], ["warranty_expiration", "Warranty expiration", false],
  ["ddt_number", "DDT number", false], ["ddt_date", "DDT date", false], ["supplier", "Supplier", true],
  ["note", "Note", false], ["site", "Sito", false],
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const unwrap = <T = any,>(r: { data: T; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};

export const managedAssetsApi = {
  async list(org: string): Promise<ManagedAsset[]> {
    return unwrap(await db.from("managed_assets").select("*").eq("organization_id", org).order("internal_code")) ?? [];
  },
  async nextCode(org: string): Promise<string> {
    const rows: { internal_code: string }[] = unwrap(await db.from("managed_assets").select("internal_code").eq("organization_id", org)) ?? [];
    const n = Math.max(0, ...rows.map((r) => parseInt(r.internal_code) || 0)) + 1;
    return String(n).padStart(3, "0");
  },
  async create(org: string, p: Partial<ManagedAsset>): Promise<ManagedAsset> {
    const internal_code = p.internal_code || (await managedAssetsApi.nextCode(org));
    return unwrap(await db.from("managed_assets").insert({ ...p, organization_id: org, internal_code, source: "manual" }).select().single());
  },
  async update(id: string, p: Partial<ManagedAsset>): Promise<ManagedAsset> {
    const { id: _i, organization_id: _o, source: _s, ...rest } = p as ManagedAsset;
    return unwrap(await db.from("managed_assets").update(rest).eq("id", id).select().single());
  },
  async remove(id: string) {
    unwrap(await db.from("managed_assets").delete().eq("id", id));
  },
  async bulkInsert(org: string, rows: Partial<ManagedAsset>[]) {
    let next = parseInt(await managedAssetsApi.nextCode(org));
    const payload = rows.map((r) => ({ ...r, organization_id: org, source: "manual", internal_code: r.internal_code || String(next++).padStart(3, "0") }));
    unwrap(await db.from("managed_assets").upsert(payload, { onConflict: "organization_id,internal_code" }));
  },
  async lookups(org: string): Promise<Record<LookupKind, string[]>> {
    const rows: { kind: LookupKind; value: string }[] = unwrap(await db.from("asset_lookup_values").select("kind,value").eq("organization_id", org).order("value")) ?? [];
    const out = { asset_type: [], status: [], purchase_type: [], supplier: [], assignee: [] } as Record<LookupKind, string[]>;
    rows.forEach((r) => out[r.kind]?.push(r.value));
    (Object.keys(out) as LookupKind[]).forEach((k) => { if (!out[k].length) out[k] = [...DEFAULT_LOOKUPS[k]]; });
    return out;
  },
  async addLookup(org: string, kind: LookupKind, value: string) {
    const existing = await db.from("asset_lookup_values").select("id").eq("organization_id", org).eq("kind", kind).limit(1);
    if (!existing.data?.length && DEFAULT_LOOKUPS[kind].length) {
      await db.from("asset_lookup_values").upsert(DEFAULT_LOOKUPS[kind].map((v) => ({ organization_id: org, kind, value: v })), { onConflict: "organization_id,kind,value" });
    }
    unwrap(await db.from("asset_lookup_values").upsert({ organization_id: org, kind, value }, { onConflict: "organization_id,kind,value" }));
  },
  async removeLookup(org: string, kind: LookupKind, value: string) {
    const existing = await db.from("asset_lookup_values").select("id").eq("organization_id", org).eq("kind", kind).limit(1);
    if (!existing.data?.length) {
      await db.from("asset_lookup_values").insert(DEFAULT_LOOKUPS[kind].filter((v) => v !== value).map((v) => ({ organization_id: org, kind, value: v })));
      return;
    }
    unwrap(await db.from("asset_lookup_values").delete().eq("organization_id", org).eq("kind", kind).eq("value", value));
  },
  async haloLink(org: string) {
    return unwrap(await db.from("asset_halo_links").select("*").eq("organization_id", org).maybeSingle());
  },
  async saveHaloLink(org: string, p: Record<string, unknown>) {
    unwrap(await db.from("asset_halo_links").upsert({ organization_id: org, ...p }));
  },
  async halo(action: "test" | "clients" | "sync", org?: string, search?: string) {
    const { data, error } = await supabase.functions.invoke("halo-asset-sync", { body: { action, organization_id: org, search } });
    if (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ctx = (error as any).context;
      let msg = error.message;
      try { msg = (await ctx.json()).error ?? msg; } catch { /* ignore */ }
      throw new Error(msg);
    }
    return data;
  },
  async expirySettings(org: string) {
    return unwrap(await db.from("asset_expiry_settings").select("*").eq("organization_id", org).maybeSingle());
  },
  async saveExpirySettings(org: string, p: Record<string, unknown>) {
    unwrap(await db.from("asset_expiry_settings").upsert({ organization_id: org, ...p }));
  },
};

export function daysUntil(d: string | null): number | null {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

export function nearestExpiry(a: ManagedAsset): number | null {
  const v = [daysUntil(a.end_contract_date), daysUntil(a.warranty_expiration)].filter((x): x is number => x !== null);
  return v.length ? Math.min(...v) : null;
}
