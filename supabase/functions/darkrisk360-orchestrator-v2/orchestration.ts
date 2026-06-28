export type DarkRiskMode = "standard" | "extended";
export type DarkRiskWorkflow = "scan" | "monthly_report";

export interface OrchestrationRequest {
  organizationId: string;
  mode: DarkRiskMode;
  workflow: DarkRiskWorkflow;
  triggerType: string;
  periodKey: string | null;
  idempotencyKey: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_PATTERN = /^[a-z0-9][a-z0-9:._-]{7,199}$/i;

export function parseOrchestrationRequest(
  body: Record<string, unknown>,
  headerIdempotencyKey = "",
): OrchestrationRequest {
  const organizationId = String(body.organization_id ?? "").trim();
  const mode = String(body.mode ?? "standard").trim() as DarkRiskMode;
  const workflow = String(body.workflow ?? "scan").trim() as DarkRiskWorkflow;
  const triggerType = String(body.trigger_type ?? "manual").trim();
  const periodKeyRaw = String(body.period_key ?? "").trim();
  const idempotencyKey = String(
    headerIdempotencyKey || body.idempotency_key || "",
  ).trim();

  if (!UUID_PATTERN.test(organizationId)) {
    throw new Error("invalid_organization_id");
  }
  if (mode !== "standard" && mode !== "extended") {
    throw new Error("invalid_mode");
  }
  if (workflow !== "scan" && workflow !== "monthly_report") {
    throw new Error("invalid_workflow");
  }
  if (workflow === "monthly_report" && mode !== "standard") {
    throw new Error("extended_reports_are_run_scoped");
  }
  if (!triggerType || triggerType.length > 64) {
    throw new Error("invalid_trigger_type");
  }
  if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
    throw new Error("invalid_idempotency_key");
  }
  if (periodKeyRaw && !/^\d{4}-(?:W\d{2}|\d{2})$/.test(periodKeyRaw)) {
    throw new Error("invalid_period_key");
  }

  return {
    organizationId,
    mode,
    workflow,
    triggerType,
    periodKey: periodKeyRaw || null,
    idempotencyKey,
  };
}

function isoWeek(date: Date): { year: number; week: number } {
  const utc = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return {
    year: utc.getUTCFullYear(),
    week: Math.ceil(
      (((utc.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7,
    ),
  };
}

export type DarkRiskScheduleDue =
  | { kind: "weekly_standard"; periodKey: string }
  | { kind: "monthly_report"; periodKey: string }
  | null;

export function getEuropeRomeScheduleDue(now: Date): DarkRiskScheduleDue {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  const year = Number(part("year"));
  const month = Number(part("month"));
  const day = Number(part("day"));
  const hour = Number(part("hour"));
  const weekday = part("weekday");

  if (weekday === "Mon" && hour === 2) {
    const localDate = new Date(Date.UTC(year, month - 1, day));
    const week = isoWeek(localDate);
    return {
      kind: "weekly_standard",
      periodKey: `${week.year}-W${String(week.week).padStart(2, "0")}`,
    };
  }

  if (day === 1 && hour === 3) {
    const previousMonth = new Date(Date.UTC(year, month - 2, 1));
    return {
      kind: "monthly_report",
      periodKey: `${previousMonth.getUTCFullYear()}-${
        String(previousMonth.getUTCMonth() + 1).padStart(2, "0")
      }`,
    };
  }

  return null;
}

export function buildTaskRows(
  request: OrchestrationRequest,
  runId: string,
  scope: Array<
    { id: string; target_type: "domain" | "ip"; normalized_value: string }
  >,
) {
  if (request.workflow === "monthly_report") {
    return [{
      organization_id: request.organizationId,
      scan_run_id: runId,
      scope_target_id: null,
      task_kind: "standard_monthly_report",
      provider: "report",
      payload: { period_key: request.periodKey },
    }];
  }

  const taskRows = scope.flatMap((target) => {
    if (request.mode === "standard") {
      return [{
        organization_id: request.organizationId,
        scan_run_id: runId,
        scope_target_id: target.id,
        task_kind: "standard_search",
        provider: "intelx_search",
        payload: {
          selector: target.normalized_value,
          target_type: target.target_type,
        },
      }];
    }

    const tasks: Array<Record<string, unknown>> = [{
      organization_id: request.organizationId,
      scan_run_id: runId,
      scope_target_id: target.id,
      task_kind: "extended_lines",
      provider: "intelx_leaks",
      payload: {
        selector: target.normalized_value,
        target_type: target.target_type,
      },
    }];
    if (target.target_type === "domain") {
      tasks.push({
        organization_id: request.organizationId,
        scan_run_id: runId,
        scope_target_id: target.id,
        task_kind: "extended_accounts",
        provider: "intelx_leaks",
        payload: {
          selector: target.normalized_value,
          target_type: target.target_type,
        },
      });
    }
    return tasks;
  });

  if (request.mode === "extended") {
    taskRows.push({
      organization_id: request.organizationId,
      scan_run_id: runId,
      scope_target_id: null,
      task_kind: "extended_run_report",
      provider: "report",
      available_at: "9999-12-31T23:59:59.000Z",
      payload: { waits_for_provider_tasks: true },
    });
  }
  return taskRows;
}
