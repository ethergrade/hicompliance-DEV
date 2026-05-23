import { PentestToolsApiError, PentestToolsClient } from './pentestToolsClient.ts';

const DEFAULT_MAX_PARALLEL = 5;

function toInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round(parsed);
}

export function getMaxParallelScans(): number {
  return toInt(Deno.env.get('SURFACESCAN_MAX_PARALLEL_SCANS'), DEFAULT_MAX_PARALLEL);
}

export function getPollIntervalSeconds(): number {
  return toInt(Deno.env.get('SURFACESCAN_POLL_INTERVAL_SECONDS'), 30);
}

export function computeRetryDelayMinutes(retryCount: number): number {
  if (retryCount <= 0) return 1;
  if (retryCount === 1) return 2;
  if (retryCount === 2) return 5;
  if (retryCount === 3) return 15;
  return 30;
}

export function nextRetryIsoFromMinutes(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export async function countActiveScansForJob(adminClient: any, scanJobId: string): Promise<number> {
  const { count } = await adminClient
    .from('pentest_tools_scans' as any)
    .select('id', { count: 'exact', head: true })
    .eq('scan_job_id', scanJobId)
    .in('status', ['running', 'waiting']);
  return Number(count || 0);
}

export async function startQueuedScansForJob(adminClient: any, scanJobId: string): Promise<{
  started: number;
  deferred: number;
  failed: number;
}> {
  const maxParallel = getMaxParallelScans();
  const currentlyActive = await countActiveScansForJob(adminClient, scanJobId);
  const remainingSlots = Math.max(0, maxParallel - currentlyActive);
  if (remainingSlots <= 0) return { started: 0, deferred: 0, failed: 0 };

  const nowIso = new Date().toISOString();

  const { data: queuedRows } = await adminClient
    .from('pentest_tools_scans' as any)
    .select('*')
    .eq('scan_job_id', scanJobId)
    .in('status', ['queued', 'retry'])
    .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
    .order('created_at', { ascending: true })
    .limit(remainingSlots);

  const rows = (queuedRows || []) as any[];
  if (rows.length === 0) return { started: 0, deferred: 0, failed: 0 };

  const client = new PentestToolsClient();
  let started = 0;
  let deferred = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const payload = {
        tool_id: Number(row.tool_id),
        target_name: String(row.target_name || ''),
        tool_params: (row.tool_params || {}) as Record<string, unknown>,
      };

      const remote = await client.startScan(payload);
      const remoteScanId = Number(
        remote?.scan_id ?? remote?.id ?? remote?.created_id ?? remote?.task_id ?? remote?.scan?.id,
      );
      const remoteTargetId = Number(
        remote?.target_id ?? remote?.scan_target_id ?? remote?.target?.id,
      );

      if (!Number.isFinite(remoteScanId)) {
        throw new Error('Invalid remote scan id from Pentest-Tools');
      }

      await adminClient
        .from('pentest_tools_scans' as any)
        .update({
          remote_scan_id: Math.round(remoteScanId),
          remote_target_id: Number.isFinite(remoteTargetId) ? Math.round(remoteTargetId) : null,
          status: 'running',
          started_at: row.started_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
          error_message: null,
        })
        .eq('id', row.id);

      started += 1;
    } catch (error: any) {
      const retryCount = Number(row.retry_count || 0);
      const isApiError = error instanceof PentestToolsApiError;
      const retryAfterSeconds = isApiError ? error.retryAfterSeconds : null;
      const retryable = isApiError
        ? error.status === 429 || error.status >= 500
        : true;

      if (retryable && retryCount < 5) {
        const fallbackMinutes = computeRetryDelayMinutes(retryCount);
        const retryAt = retryAfterSeconds && retryAfterSeconds > 0
          ? new Date(Date.now() + retryAfterSeconds * 1000).toISOString()
          : nextRetryIsoFromMinutes(fallbackMinutes);
        await adminClient
          .from('pentest_tools_scans' as any)
          .update({
            status: 'retry',
            retry_count: retryCount + 1,
            next_retry_at: retryAt,
            error_message: error?.message ? String(error.message).slice(0, 4000) : 'retry scheduled',
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id);
        deferred += 1;
      } else {
        await adminClient
          .from('pentest_tools_scans' as any)
          .update({
            status: 'failed',
            finished_at: new Date().toISOString(),
            error_message: error?.message ? String(error.message).slice(0, 4000) : 'scan start failed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id);
        failed += 1;
      }
    }
  }

  return { started, deferred, failed };
}

