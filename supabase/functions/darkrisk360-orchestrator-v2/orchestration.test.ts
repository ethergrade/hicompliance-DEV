import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildTaskRows,
  getEuropeRomeScheduleDue,
  parseOrchestrationRequest,
} from "./orchestration.ts";

Deno.test("orchestrator request requires stable idempotency and valid workflow", () => {
  assertEquals(
    parseOrchestrationRequest({
      organization_id: "550e8400-e29b-41d4-a716-446655440000",
      mode: "standard",
      workflow: "scan",
      trigger_type: "cron_weekly",
      period_key: "2026-W27",
      idempotency_key: "standard:550e8400-e29b-41d4-a716-446655440000:2026-W27",
    }).mode,
    "standard",
  );
  assertThrows(
    () =>
      parseOrchestrationRequest({
        organization_id: "550e8400-e29b-41d4-a716-446655440000",
        mode: "extended",
        workflow: "monthly_report",
        idempotency_key: "extended:invalid-monthly",
      }),
    Error,
    "extended_reports_are_run_scoped",
  );
});

Deno.test("Europe/Rome schedule is DST-safe and uses previous month for reports", () => {
  assertEquals(getEuropeRomeScheduleDue(new Date("2026-06-29T00:00:00Z")), {
    kind: "weekly_standard",
    periodKey: "2026-W27",
  });
  assertEquals(getEuropeRomeScheduleDue(new Date("2026-07-01T01:00:00Z")), {
    kind: "monthly_report",
    periodKey: "2026-06",
  });
  assertEquals(
    getEuropeRomeScheduleDue(new Date("2026-07-01T00:00:00Z")),
    null,
  );
});

Deno.test("extended plan uses lines for IP and accounts only for domains", () => {
  const request = parseOrchestrationRequest({
    organization_id: "550e8400-e29b-41d4-a716-446655440000",
    mode: "extended",
    workflow: "scan",
    trigger_type: "manual",
    idempotency_key:
      "extended:550e8400-e29b-41d4-a716-446655440000:request-001",
  });
  const rows = buildTaskRows(request, "run-1", [
    { id: "domain-1", target_type: "domain", normalized_value: "example.com" },
    { id: "ip-1", target_type: "ip", normalized_value: "203.0.113.10" },
  ]);
  assertEquals(rows.map((row) => row.task_kind), [
    "extended_lines",
    "extended_accounts",
    "extended_lines",
    "extended_run_report",
  ]);
});
