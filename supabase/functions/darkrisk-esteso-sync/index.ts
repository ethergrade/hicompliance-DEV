import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { corsHeaders } from '../_shared/surface-scan-utils.ts';

// Legacy Identity implementation retired by DarkRisk360 V2.
// Programmatic Identity work is accepted only through the Laravel API and the
// run/task orchestrator, which pins 3.intelx.io and the private leaks bucket.
serve((req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  return new Response(JSON.stringify({
    ok: false,
    error: 'darkrisk_esteso_legacy_retired',
    replacement: 'darkrisk360-orchestrator-v2',
  }), {
    status: 410,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
});
