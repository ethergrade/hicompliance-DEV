import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  EMPTY_HITRACK_DASHBOARD,
  type HiTrackCollector,
  type HiTrackDashboardPayload,
} from "@/lib/hitrack/types";

let cachedClient: SupabaseClient | null | undefined;

function getEnv(name: "VITE_SUPABASE_URL" | "VITE_SUPABASE_ANON_KEY") {
  const value = String(import.meta.env[name] || "").trim();
  return value.length > 0 ? value : null;
}

export function isHiTrackSupabaseConfigured() {
  return Boolean(getEnv("VITE_SUPABASE_URL") && getEnv("VITE_SUPABASE_ANON_KEY"));
}

export function getHiTrackSupabaseClient() {
  if (cachedClient !== undefined) return cachedClient;

  const url = getEnv("VITE_SUPABASE_URL");
  const anonKey = getEnv("VITE_SUPABASE_ANON_KEY");
  if (!url || !anonKey) {
    cachedClient = null;
    return cachedClient;
  }

  cachedClient = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return cachedClient;
}

export async function fetchHiTrackDashboard(organizationId: string) {
  const client = getHiTrackSupabaseClient();
  if (!client) return EMPTY_HITRACK_DASHBOARD;

  const { data, error } = await client.rpc("hitrack_get_dashboard", {
    _organization_id: organizationId,
  });

  if (error) {
    throw error;
  }

  return {
    ...EMPTY_HITRACK_DASHBOARD,
    ...(data as Partial<HiTrackDashboardPayload> | null),
  };
}

export async function fetchHiTrackCollectors(organizationId: string) {
  const client = getHiTrackSupabaseClient();
  if (!client) return [] as HiTrackCollector[];

  const { data, error } = await client.rpc("hitrack_get_collectors", {
    _organization_id: organizationId,
  });

  if (error) {
    throw error;
  }

  return (data as HiTrackCollector[] | null) ?? [];
}

export async function queueHiTrackSyncNow(
  organizationId: string,
  collectorIds?: string[],
) {
  const client = getHiTrackSupabaseClient();
  if (!client) {
    throw new Error("HiTrack Supabase client not configured");
  }

  const { data, error } = await client.functions.invoke("hitrack-sync-now", {
    body: {
      organization_id: organizationId,
      collector_ids: collectorIds ?? [],
    },
  });

  if (error) {
    throw error;
  }

  return data;
}
