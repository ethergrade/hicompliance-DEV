import { PentestToolsApiError, PentestToolsClient } from './pentestToolsClient.ts';

const DEFAULT_MAX_PARALLEL = 5;
const STALE_QUEUED_MINUTES = 6 * 60;
const STALE_RETRY_OVERDUE_MINUTES = 30;
const RETRY_CAP_FOR_STALE = 2;

const PHASE_PRIORITY: Record<string, number> = {
  port_scan: 10,
  subdomain_discovery: 20,
  ssl_scan: 30,
  website_recon: 40,
  network_scan: 50,
};

const PHASE_TIMEOUT_MINUTES: Record<string, number> = {
  port_scan: 90,
  subdomain_discovery: 90,
  ssl_scan: 75,
  website_recon: 75,
  network_scan: 120,
};

const OPTIONAL_PHASES = new Set(['website_recon', 'ssl_scan', 'network_scan']);

function isOptionalPhase(phase: unknown): boolean {
  return OPTIONAL_PHASES.has(String(phase || '').toLowerCase());
}

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

export function getPhasePriority(phase: string): number {
  return PHASE_PRIORITY[String(phase || '').toLowerCase()] ?? 90;
}

export function getPhaseTimeoutMinutes(phase: string): number {
  return PHASE_TIMEOUT_MINUTES[String(phase || '').toLowerCase()] ?? 45;
}

function toTs(value: unknown): number {
  const ts = Date.parse(String(value || ''));
  return Number.isFinite(ts) ? ts : 0;
}

function isProviderAuthError(error: unknown): boolean {
  return error instanceof PentestToolsApiError && (error.status === 401 || error.status === 403);
}

function staleRecoveryRawPayload(row: any, reason: string) {
  const currentRaw = row?.raw_output && typeof row.raw_output === 'object' ? row.raw_output : {};
  return {
    ...currentRaw,
    _stale_recovery: {
      reason,
      recovered_at: new Date().toISOString(),
      previous_status: String(row?.status || ''),
      previous_remote_scan_id: row?.remote_scan_id ?? null,
      previous_retry_count: Number(row?.retry_count || 0),
    },
  };
}

export async function recoverStaleScansForJob(
  adminClient: any,
  scanJobId: string,
): Promise<{
  recoveredToRetry: number;
  failedStale: number;
}> {
  const nowMs = Date.now();
  const { data: rows } = await adminClient
    .from('pentest_tools_scans' as any)
    .select('id, phase, status, retry_count, remote_scan_id, next_retry_at, started_at, created_at, updated_at, raw_output')
    .eq('scan_job_id', scanJobId)
    .in('status', ['running', 'waiting', 'queued', 'retry']);

  const tasks = (rows || []) as any[];
  if (tasks.length === 0) return { recoveredToRetry: 0, failedStale: 0 };

  let recoveredToRetry = 0;
  let failedStale = 0;

  for (const row of tasks) {
    const status = String(row?.status || '').toLowerCase();
    const retryCount = Number(row?.retry_count || 0);
    const updatedTs = toTs(row?.updated_at) || toTs(row?.created_at);
    const startedTs = toTs(row?.started_at) || updatedTs;
    const nextRetryTs = toTs(row?.next_retry_at);
    const phaseTimeoutMs = getPhaseTimeoutMinutes(String(row?.phase || '')) * 60_000;

    const isRunningLike = status === 'running' || status === 'waiting';
    const isStaleRunning = isRunningLike && startedTs > 0 && nowMs - startedTs > phaseTimeoutMs;
    const isQueuedLike = status === 'queued' || status === 'retry';
    const isRetryOverdue = status === 'retry'
      && nextRetryTs > 0
      && nowMs - nextRetryTs > STALE_RETRY_OVERDUE_MINUTES * 60_000;
    const isStaleQueued = isQueuedLike
      && (
        (updatedTs > 0 && nowMs - updatedTs > STALE_QUEUED_MINUTES * 60_000)
        || isRetryOverdue
      );

    if (!isStaleRunning && !isStaleQueued) continue;

    const reason = isStaleRunning
      ? 'stale_running_timeout'
      : (isRetryOverdue ? 'stale_retry_overdue' : 'stale_queued_timeout');
    const rawPayload = staleRecoveryRawPayload(row, reason);

    if (retryCount < RETRY_CAP_FOR_STALE) {
      const retryAt = nextRetryIsoFromMinutes(1);
      await adminClient
        .from('pentest_tools_scans' as any)
        .update({
          status: 'retry',
          retry_count: retryCount + 1,
          next_retry_at: retryAt,
          error_message: `Auto-recovery: ${reason}`,
          updated_at: new Date().toISOString(),
          raw_output: rawPayload,
        })
        .eq('id', row.id);
      recoveredToRetry += 1;
      continue;
    }

    if (isOptionalPhase(row?.phase)) {
      await adminClient
        .from('pentest_tools_scans' as any)
        .update({
          status: 'finished',
          progress: 100,
          finished_at: new Date().toISOString(),
          error_message: `Optional phase skipped after stale recovery: ${reason}`,
          updated_at: new Date().toISOString(),
          raw_output: {
            ...rawPayload,
            _optional_phase: true,
            _skipped: true,
          },
        })
        .eq('id', row.id);
      continue;
    }

    await adminClient
      .from('pentest_tools_scans' as any)
      .update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        error_message: `Auto-failed after stale recovery: ${reason}`,
        updated_at: new Date().toISOString(),
        raw_output: rawPayload,
      })
      .eq('id', row.id);
    failedStale += 1;
  }

  return { recoveredToRetry, failedStale };
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
    .limit(Math.max(remainingSlots * 6, 30));

  const rows = ((queuedRows || []) as any[])
    .sort((a, b) => {
      const phaseDelta = getPhasePriority(String(a?.phase || '')) - getPhasePriority(String(b?.phase || ''));
      if (phaseDelta !== 0) return phaseDelta;
      return toTs(a?.created_at) - toTs(b?.created_at);
    })
    .slice(0, remainingSlots);
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
      if (isProviderAuthError(error)) {
        const authRetryAt = nextRetryIsoFromMinutes(30);
        const selectedIds = rows
          .slice(rows.indexOf(row))
          .map((selectedRow: any) => String(selectedRow?.id || '').trim())
          .filter(Boolean);

        if (selectedIds.length > 0) {
          await adminClient
            .from('pentest_tools_scans' as any)
            .update({
              status: 'retry',
              next_retry_at: authRetryAt,
              error_message: `provider_auth_failed:${error.status}`,
              updated_at: new Date().toISOString(),
            })
            .in('id', selectedIds);
          deferred += selectedIds.length;
        }
        break;
      }

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
        if (isOptionalPhase(row?.phase)) {
          await adminClient
            .from('pentest_tools_scans' as any)
            .update({
              status: 'finished',
              progress: 100,
              finished_at: new Date().toISOString(),
              error_message: error?.message
                ? `Optional phase skipped: ${String(error.message).slice(0, 3900)}`
                : 'Optional phase skipped',
              updated_at: new Date().toISOString(),
              raw_output: {
                _optional_phase: true,
                _skipped: true,
                _skip_reason: 'start_failed',
              },
            })
            .eq('id', row.id);
          continue;
        }
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
