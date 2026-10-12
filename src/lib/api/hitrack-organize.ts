import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const unwrap = (r: { data: any; error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); return r.data; };

export interface HiTrackGroup { id: string; name: string }

export const hitrackOrganizeApi = {
  async groups(org: string): Promise<HiTrackGroup[]> {
    const { data: u } = await supabase.auth.getUser();
    return unwrap(await db.from("hitrack_device_groups").select("id,name").eq("organization_id", org).eq("owner_user_id", u.user?.id).order("name")) ?? [];
  },
  async createGroup(org: string, name: string) { unwrap(await db.from("hitrack_device_groups").insert({ organization_id: org, name })); },
  async deleteGroup(id: string) { unwrap(await db.from("hitrack_device_groups").delete().eq("id", id)); },
  async members(ids: string[]): Promise<{ group_id: string; device_key: string }[]> {
    if (!ids.length) return [];
    return unwrap(await db.from("hitrack_device_group_members").select("group_id,device_key").in("group_id", ids)) ?? [];
  },
  async setMembers(groupId: string, keys: string[], member: boolean) {
    if (!keys.length) return;
    if (member) unwrap(await db.from("hitrack_device_group_members").upsert(keys.map((device_key) => ({ group_id: groupId, device_key }))));
    else unwrap(await db.from("hitrack_device_group_members").delete().eq("group_id", groupId).in("device_key", keys));
  },
  async tags(org: string): Promise<{ device_key: string; tag: string }[]> {
    return unwrap(await db.from("hitrack_device_tags").select("device_key,tag").eq("organization_id", org)) ?? [];
  },
  async addTag(org: string, keys: string[], tag: string) {
    if (!keys.length) return;
    unwrap(await db.from("hitrack_device_tags").upsert(keys.map((device_key) => ({ organization_id: org, device_key, tag })), { onConflict: "organization_id,device_key,tag" }));
  },
  async removeTag(org: string, key: string, tag: string) {
    unwrap(await db.from("hitrack_device_tags").delete().eq("organization_id", org).eq("device_key", key).eq("tag", tag));
  },
};
