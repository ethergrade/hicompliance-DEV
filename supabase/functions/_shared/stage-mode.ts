// Interruttore globale "Modalità Stage".
//
// Quando `platform_runtime_settings.stage_mode` è true l'istanza è usata come
// ambiente di test: tutte le attività automatiche (scansioni, arricchimenti,
// polling) devono terminare subito senza consumare API esterne né DB.
//
// Il flag è letto con la service role key, quindi funziona anche per le
// invocazioni da pg_cron.

let cachedValue: boolean | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 15_000;

export async function isStageModePaused(): Promise<boolean> {
  const now = Date.now();
  if (cachedValue !== null && now - cachedAt < CACHE_TTL_MS) return cachedValue;

  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return false;

  try {
    const res = await fetch(
      `${url}/rest/v1/platform_runtime_settings?select=stage_mode&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    if (!res.ok) return false;
    const rows = (await res.json()) as Array<{ stage_mode?: boolean }>;
    cachedValue = rows?.[0]?.stage_mode === true;
    cachedAt = now;
    return cachedValue;
  } catch (_e) {
    // In caso di errore non blocchiamo l'esecuzione.
    return false;
  }
}

export function stageModeResponse(headers: Record<string, string> = {}): Response {
  return new Response(
    JSON.stringify({
      ok: true,
      skipped: true,
      reason: 'stage_mode',
      message: 'Modalità Stage attiva: attività automatiche e scansioni sono in pausa.',
    }),
    { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } },
  );
}
