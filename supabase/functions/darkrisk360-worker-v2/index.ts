import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { IntelXSearchAdapter } from "../_shared/intelx-search-adapter.ts";
import { IntelXLeaksAdapter } from "../_shared/intelx-leaks-adapter.ts";
import { intelXRecordFingerprint } from "../_shared/intelx-record-fingerprint.ts";
import {
  envelopeEncryptJson,
  filterAuthorizedCorrelatedDomains,
  isRetryableProviderError,
  parseKek,
  retryDelaySeconds,
  safeErrorCode,
} from "./worker-utils.ts";

type ScanTask = {
  id: string;
  organization_id: string;
  scan_run_id: string;
  scope_target_id: string | null;
  task_kind: "standard_search" | "extended_lines" | "extended_accounts";
  provider: "intelx_search" | "intelx_leaks";
  attempt_count: number;
  max_attempts: number;
  payload: { selector?: string; target_type?: string };
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

function requiredEnv(name: string): string {
  const value = String(Deno.env.get(name) || "").trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
}

const envEnabled = (name: string) =>
  /^(1|true|yes|on)$/i.test(String(Deno.env.get(name) || ""));

function safeDate(value: unknown): string | null {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function normalizedDomain(value: unknown): string | null {
  const domain = String(value || "").trim().toLowerCase().replace(/\.$/, "");
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)
    ? domain
    : null;
}

async function resolveAuthorizedCorrelatedDomains(
  admin: any,
  organizationId: string,
  ip: string,
) {
  const [{ data: approvedScope }, { data: targets }, { data: ports }] =
    await Promise.all([
      admin.from("darkrisk_external_scope")
        .select("normalized_value")
        .eq("organization_id", organizationId)
        .eq("target_type", "domain")
        .eq("active", true)
        .eq("authorization_status", "approved"),
      admin.from("surface_scan_targets")
        .select("target_value,root_domain")
        .or(
          `organization_id.eq.${organizationId},customer_id.eq.${organizationId}`,
        )
        .contains("resolved_ips", [ip])
        .limit(100),
      admin.from("surface_open_ports")
        .select("host")
        .or(
          `organization_id.eq.${organizationId},customer_id.eq.${organizationId}`,
        )
        .eq("ip", ip)
        .limit(100),
    ]);
  const approvedRoots = (approvedScope || [])
    .map((row: { normalized_value?: string }) =>
      normalizedDomain(row.normalized_value)
    )
    .filter((value: string | null): value is string => Boolean(value));
  const discovered = new Set<string>();
  for (
    const row of (targets || []) as Array<
      { target_value?: string; root_domain?: string }
    >
  ) {
    const value = normalizedDomain(row.target_value) ||
      normalizedDomain(row.root_domain);
    if (value) discovered.add(value);
  }
  for (const row of (ports || []) as Array<{ host?: string }>) {
    const value = normalizedDomain(row.host);
    if (value) discovered.add(value);
  }
  return filterAuthorizedCorrelatedDomains(discovered, approvedRoots);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const bearer = String(req.headers.get("Authorization") || "").replace(
    /^Bearer\s+/i,
    "",
  ).trim();
  const internalToken = String(
    req.headers.get("x-surface-internal-secret") || "",
  ).trim();
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let authorized = bearer === serviceRoleKey;
  if (!authorized && internalToken) {
    const { data } = await admin.rpc("surface_scan_validate_internal_secret", {
      candidate: internalToken,
    });
    authorized = data === true;
  }
  if (!authorized) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const taskLimit = Math.min(10, Math.max(1, Number(body.max_tasks) || 5));
  const workerId = `darkrisk-v2:${crypto.randomUUID()}`;
  const { data: claimed, error: claimError } = await admin.rpc(
    "darkrisk_claim_scan_tasks_v2",
    {
      worker_id: workerId,
      task_limit: taskLimit,
      lease_seconds: 900,
    },
  );
  if (claimError) return json({ error: "task_claim_failed" }, 500);

  const tasks = (claimed || []) as ScanTask[];
  const results: Array<Record<string, unknown>> = [];
  for (const task of tasks) {
    const selector = String(task.payload?.selector || "").trim();
    let providerLease = false;
    try {
      if (
        task.provider === "intelx_leaks" && !envEnabled("DARKRISK_IDENTITY_V2")
      ) {
        await admin.from("darkrisk_scan_tasks").update({
          status: "queued",
          attempt_count: Math.max(0, task.attempt_count - 1),
          available_at: new Date(Date.now() + 300_000).toISOString(),
          lease_owner: null,
          lease_expires_at: null,
          last_error_code: "darkrisk_identity_v2_disabled",
        }).eq("id", task.id).eq("lease_owner", workerId);
        results.push({ task_id: task.id, status: "deferred_feature_disabled" });
        continue;
      }
      const lease = await admin.rpc("darkrisk_acquire_provider_lease_v2", {
        requested_provider: task.provider,
        worker_id: workerId,
        lease_seconds: 900,
      });
      if (lease.error) throw lease.error;
      providerLease = lease.data === true;
      if (!providerLease) {
        await admin.from("darkrisk_scan_tasks").update({
          status: "queued",
          attempt_count: Math.max(0, task.attempt_count - 1),
          available_at: new Date(Date.now() + 15_000).toISOString(),
          lease_owner: null,
          lease_expires_at: null,
          heartbeat_at: new Date().toISOString(),
        }).eq("id", task.id).eq("lease_owner", workerId);
        results.push({ task_id: task.id, status: "deferred_provider_busy" });
        continue;
      }

      await admin.from("darkrisk_scan_runs").update({
        status: "running",
        heartbeat_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
      }).eq("id", task.scan_run_id).eq("status", "queued");

      if (task.task_kind === "standard_search") {
        const apiKey = String(
          Deno.env.get("INTELX_SEARCH_API_KEY") ||
            Deno.env.get("INTELX_API_KEY") || "",
        ).trim();
        const adapter = new IntelXSearchAdapter({
          apiKey: apiKey || requiredEnv("INTELX_SEARCH_API_KEY"),
          userAgent: requiredEnv("INTELX_USER_AGENT"),
          maxResults: 1000,
        });
        const count = await adapter.count(selector);
        await admin.from("darkrisk_scan_tasks").update({
          status: "completed",
          result_summary: {
            selector: count.selector,
            count: count.count,
            at_least: count.atLeast,
          },
          completed_at: new Date().toISOString(),
          heartbeat_at: new Date().toISOString(),
          lease_owner: null,
          lease_expires_at: null,
        }).eq("id", task.id).eq("lease_owner", workerId);
        results.push({
          task_id: task.id,
          status: "completed",
          count: count.count,
          at_least: count.atLeast,
        });
      } else {
        const apiKey = String(
          Deno.env.get("INTELX_LEAKS_API_KEY") ||
            Deno.env.get("INTELX_API_KEY") || "",
        ).trim();
        const adapter = new IntelXLeaksAdapter({
          apiKey: apiKey || requiredEnv("INTELX_LEAKS_API_KEY"),
          userAgent: requiredEnv("INTELX_USER_AGENT"),
          limit: 1000,
        });
        let providerResult;
        let recordsWithSelector: Array<
          { selector: string; record: Record<string, unknown> }
        > = [];
        let occurrenceMatchType: "direct" | "correlated_from_ip" = "direct";
        let correlationSummary: Record<string, unknown> = {};
        try {
          providerResult = task.task_kind === "extended_accounts"
            ? await adapter.exportAccounts(selector)
            : await adapter.searchLines(selector);
          recordsWithSelector = providerResult.records.map((record) => ({
            selector,
            record,
          }));
        } catch (error) {
          const isInvalidIpSelector = task.task_kind === "extended_lines" &&
            task.payload.target_type === "ip" &&
            safeErrorCode(error) === "intelx_leaks_selector_invalid";
          if (!isInvalidIpSelector) throw error;

          const correlated = await resolveAuthorizedCorrelatedDomains(
            admin,
            task.organization_id,
            selector,
          );
          occurrenceMatchType = "correlated_from_ip";
          let droppedOutOfBucket = 0;
          let capped = false;
          for (const domain of correlated.authorized) {
            const domainResult = await adapter.searchLines(domain);
            droppedOutOfBucket += domainResult.droppedOutOfBucket;
            capped = capped || domainResult.capped;
            recordsWithSelector.push(
              ...domainResult.records.map((record) => ({
                selector: domain,
                record,
              })),
            );
          }
          providerResult = {
            selector,
            records: recordsWithSelector.map((entry) => entry.record),
            count: recordsWithSelector.length,
            droppedOutOfBucket,
            capped,
            terminalStatus: null,
          };
          correlationSummary = {
            fallback: "ip_to_authorized_domain",
            authorized_correlated_domains: correlated.authorized.length,
            rejected_candidate_domains: correlated.rejectedCount,
          };
          await admin.from("darkrisk_audit_log").insert({
            organization_id: task.organization_id,
            actor_id: null,
            action: "darkrisk_identity_ip_fallback_v2",
            entity_type: "darkrisk_scan_task",
            entity_id: task.id,
            metadata: {
              authorized_correlated_domains: correlated.authorized.length,
              rejected_candidate_domains: correlated.rejectedCount,
              result_count: recordsWithSelector.length,
            },
          });
        }
        const kek = parseKek(requiredEnv("DARKRISK_EVIDENCE_KEK_BASE64"));
        const keyVersion = requiredEnv("DARKRISK_EVIDENCE_KEY_VERSION");
        let persisted = 0;

        for (const entry of recordsWithSelector) {
          const record = entry.record;
          const recordKey = await intelXRecordFingerprint(
            entry.selector,
            record,
            { preferSystemId: task.task_kind !== "extended_accounts" },
          );
          const sourceDate = safeDate(record.date);
          let { data: canonical, error: canonicalError } = await admin
            .from("darkrisk_source_records")
            .insert({
              organization_id: task.organization_id,
              scan_run_id: task.scan_run_id,
              source: "intelx",
              source_record_key: recordKey,
              source_system_id: String(record.systemid || "").trim() || null,
              source_bucket: "leaks.private.general",
              source_type: task.task_kind,
              source_date: sourceDate,
              raw_metadata: {
                encrypted: true,
                schema_version: "2.0",
                selector_type: task.payload.target_type,
                match_type: occurrenceMatchType,
              },
              safe_preview: null,
              preview_hash: recordKey,
            })
            .select("id")
            .single();
          if (canonicalError?.code === "23505") {
            const existing = await admin.from("darkrisk_source_records")
              .select("id")
              .eq("organization_id", task.organization_id)
              .eq("source", "intelx")
              .eq("source_record_key", recordKey)
              .single();
            canonical = existing.data;
            canonicalError = existing.error;
          }
          if (canonicalError || !canonical) {
            throw canonicalError || new Error("canonical_record_missing");
          }

          const encrypted = await envelopeEncryptJson(record, kek, keyVersion);
          const { error: encryptedError } = await admin.from(
            "darkrisk_sensitive_payloads",
          ).upsert({
            organization_id: task.organization_id,
            source_record_id: canonical.id,
            algorithm: encrypted.algorithm,
            key_version: encrypted.keyVersion,
            encrypted_dek: encrypted.encryptedDek,
            dek_iv: encrypted.dekIv,
            ciphertext: encrypted.ciphertext,
            payload_iv: encrypted.payloadIv,
            sha256: encrypted.sha256,
          }, { onConflict: "source_record_id" });
          if (encryptedError) throw encryptedError;

          const occurrence = await admin.from(
            "darkrisk_source_record_occurrences",
          ).insert({
            organization_id: task.organization_id,
            scan_run_id: task.scan_run_id,
            task_id: task.id,
            source_record_id: canonical.id,
            scope_target_id: task.scope_target_id,
            match_type: occurrenceMatchType,
            metadata: { schema_version: "2.0" },
          });
          if (occurrence.error && occurrence.error.code !== "23505") {
            throw occurrence.error;
          }
          persisted += 1;
        }

        if (providerResult.droppedOutOfBucket > 0) {
          await admin.from("darkrisk_audit_log").insert({
            organization_id: task.organization_id,
            actor_id: null,
            action: "darkrisk_identity_out_of_bucket_dropped_v2",
            entity_type: "darkrisk_scan_task",
            entity_id: task.id,
            metadata: {
              scan_run_id: task.scan_run_id,
              dropped_count: providerResult.droppedOutOfBucket,
            },
          });
        }

        await admin.from("darkrisk_scan_tasks").update({
          status: "completed",
          result_summary: {
            selector: providerResult.selector,
            count: persisted,
            capped: providerResult.capped,
            dropped_out_of_bucket: providerResult.droppedOutOfBucket,
            ...correlationSummary,
          },
          completed_at: new Date().toISOString(),
          heartbeat_at: new Date().toISOString(),
          lease_owner: null,
          lease_expires_at: null,
        }).eq("id", task.id).eq("lease_owner", workerId);
        results.push({
          task_id: task.id,
          status: "completed",
          count: persisted,
        });
      }
    } catch (error) {
      const retryable = isRetryableProviderError(error) &&
        task.attempt_count < task.max_attempts;
      await admin.from("darkrisk_scan_tasks").update({
        status: retryable ? "queued" : "failed",
        available_at: retryable
          ? new Date(Date.now() + retryDelaySeconds(task.attempt_count) * 1000)
            .toISOString()
          : new Date().toISOString(),
        last_error_code: safeErrorCode(error),
        last_error_message:
          "Provider task failed; inspect protected runtime logs by correlation ID.",
        completed_at: retryable ? null : new Date().toISOString(),
        heartbeat_at: new Date().toISOString(),
        lease_owner: null,
        lease_expires_at: null,
      }).eq("id", task.id).eq("lease_owner", workerId);
      results.push({
        task_id: task.id,
        status: retryable ? "retry_scheduled" : "failed",
        code: safeErrorCode(error),
      });
    } finally {
      if (providerLease) {
        await admin.rpc("darkrisk_release_provider_lease_v2", {
          requested_provider: task.provider,
          worker_id: workerId,
        });
      }
    }

    const { data: providerTasks } = await admin.from("darkrisk_scan_tasks")
      .select("status")
      .eq("scan_run_id", task.scan_run_id)
      .in("provider", ["intelx_search", "intelx_leaks"]);
    const providerDone = (providerTasks || []).every((row) =>
      ["completed", "failed", "cancelled"].includes(row.status)
    );
    if (providerDone) {
      const hasFailures = (providerTasks || []).some((row) =>
        row.status === "failed"
      );
      const { data: run } = await admin.from("darkrisk_scan_runs").select(
        "mode",
      ).eq("id", task.scan_run_id).single();
      if (run?.mode === "extended") {
        await admin.from("darkrisk_scan_tasks").update({
          available_at: new Date().toISOString(),
        }).eq("scan_run_id", task.scan_run_id).eq(
          "task_kind",
          "extended_run_report",
        );
      }
      await admin.from("darkrisk_scan_runs").update({
        status: run?.mode === "standard"
          ? (hasFailures ? "completed_with_warnings" : "completed")
          : "running",
        completed_at: run?.mode === "standard"
          ? new Date().toISOString()
          : null,
        heartbeat_at: new Date().toISOString(),
      }).eq("id", task.scan_run_id);
    }
  }

  return json({ worker_id: workerId, claimed: tasks.length, results });
});
