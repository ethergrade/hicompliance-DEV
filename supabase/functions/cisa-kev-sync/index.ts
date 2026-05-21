// Sincronizza il catalogo CISA KEV una volta al giorno.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const KEV_URL = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const res = await fetch(KEV_URL);
    if (!res.ok) throw new Error(`CISA KEV HTTP ${res.status}`);
    const json = await res.json();
    const vulns = (json?.vulnerabilities ?? []) as any[];

    const rows = vulns.map((v) => ({
      cve_id: String(v.cveID).toUpperCase(),
      vendor_project: v.vendorProject ?? null,
      product: v.product ?? null,
      vulnerability_name: v.vulnerabilityName ?? null,
      date_added: v.dateAdded ?? null,
      short_description: v.shortDescription ?? null,
      required_action: v.requiredAction ?? null,
      due_date: v.dueDate ?? null,
      known_ransomware_use: v.knownRansomwareCampaignUse ?? null,
      notes: v.notes ?? null,
      cwes: Array.isArray(v.cwes) ? v.cwes : [],
      synced_at: new Date().toISOString(),
    }));

    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await supabase.from('cisa_kev_catalog')
        .upsert(chunk, { onConflict: 'cve_id' });
      if (error) throw error;
    }

    const kevIds = rows.map((r) => r.cve_id);
    if (kevIds.length > 0) {
      for (let i = 0; i < kevIds.length; i += 500) {
        const chunk = kevIds.slice(i, i + 500);
        await supabase.from('cve_intel_cache')
          .update({ cisa_kev: true })
          .in('cve_id', chunk);
      }
    }

    return new Response(JSON.stringify({ synced: rows.length }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
