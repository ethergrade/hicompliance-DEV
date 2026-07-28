import { z } from "zod";
import type {
	CredentialLeakPage,
	DarkRiskReport,
	DarkRiskRun,
	DarkRiskRunStatus,
	DarkRiskScope,
	DarkRiskWeeklySnapshot,
	ExtendedLeakRecord,
	ExtendedRunResult,
	StandardOverview,
} from "./contracts";
import { normalizeScopeValue } from "./scope";

const recordSchema = z.record(z.unknown());
const arrayEnvelopeSchema = z.union([
	z.array(z.unknown()),
	z.object({ data: z.array(z.unknown()).default([]) }).passthrough(),
]);

const objectValue = (value: unknown): Record<string, unknown> =>
	recordSchema.safeParse(value).success ? (value as Record<string, unknown>) : {};
const numberValue = (value: unknown, fallback = 0): number => {
	const parsed = typeof value === "number" ? value : Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};
const stringValue = (value: unknown, fallback = ""): string =>
	typeof value === "string" || typeof value === "number" ? String(value) : fallback;
const nullableString = (value: unknown): string | null => {
	const parsed = stringValue(value).trim();
	return parsed || null;
};

/** Mappa "chiave → conteggio" dai campi jsonb dello snapshot, scartando i valori non numerici. */
const countMap = (value: unknown): Record<string, number> => {
	const entries = Object.entries(objectValue(value))
		.map(([key, raw]) => [key, numberValue(raw, Number.NaN)] as const)
		.filter(([, count]) => Number.isFinite(count));
	return Object.fromEntries(entries);
};

export const unwrapApiData = (value: unknown): unknown => {
	const object = objectValue(value);
	return "data" in object ? object.data : value;
};

/**
 * `weekly_snapshot` è null finché non esiste una scansione completata, e anche
 * a snapshot presente i singoli campi jsonb possono essere null: ognuno va
 * difeso separatamente, non basta controllare l'oggetto che li contiene.
 */
export const parseWeeklySnapshot = (value: unknown): DarkRiskWeeklySnapshot | null => {
	const item = objectValue(value);
	if (!item.week_key) return null;

	const delta = objectValue(item.delta_vs_prev);
	const byAsset = Object.entries(objectValue(item.results_by_asset)).reduce<
		DarkRiskWeeklySnapshot["resultsByAsset"]
	>((acc, [asset, raw]) => {
		const row = objectValue(raw);
		acc[asset] = {
			total: numberValue(row.total),
			bySource: countMap(row.by_source),
			byFiletype: countMap(row.by_filetype),
		};
		return acc;
	}, {});

	return {
		weekKey: stringValue(item.week_key),
		weekStartDate: nullableString(item.week_start_date),
		tier: stringValue(item.tier, "standard"),
		totalRecords: numberValue(item.total_records),
		newRecordsThisWeek: numberValue(item.new_records_this_week),
		riskIndex: numberValue(item.risk_index),
		resultsBySource: countMap(item.results_by_source),
		resultsByFiletype: countMap(item.results_by_filetype),
		resultsByDay: countMap(item.results_by_day),
		resultsByAsset: byAsset,
		severityDistribution: countMap(item.severity_distribution),
		deltaVsPrev: {
			totalRecords: delta.total_records === undefined ? null : numberValue(delta.total_records),
			riskIndex: delta.risk_index === undefined ? null : numberValue(delta.risk_index),
			newBuckets: Array.isArray(delta.new_buckets)
				? delta.new_buckets.map((bucket) => stringValue(bucket)).filter(Boolean)
				: [],
			severityDelta: countMap(delta.severity_delta),
		},
		computedAt: nullableString(item.computed_at),
	};
};

/**
 * Risposta paginata di `darkrisk/credential-leaks`.
 *
 * La password in chiaro non fa parte del contratto: l'endpoint restituisce solo
 * `masked_value`, e lo smascheramento passa dal reveal audiato sull'evidenza.
 */
export const parseCredentialLeaks = (value: unknown): CredentialLeakPage => {
	const envelope = objectValue(unwrapApiData(value));
	const rows = Array.isArray(envelope.data) ? envelope.data : [];

	return {
		records: rows.map((row) => {
			const item = objectValue(row);
			return {
				id: stringValue(item.id),
				selector: stringValue(item.selector_value),
				assetScope: nullableString(item.asset_scope),
				maskedValue: stringValue(item.masked_value),
				passwordType: nullableString(item.password_type),
				bucketCanonical: nullableString(item.bucket_canonical),
				bucketDisplay: nullableString(item.bucket_display),
				sourceShort: nullableString(item.source_short ?? item.source_label),
				sourceLong: nullableString(item.source_long),
				collectionName: nullableString(item.collection_name),
				confidence: stringValue(item.confidence, "medium"),
				evidenceDate: nullableString(item.evidence_date),
				createdAt: nullableString(item.created_at),
				evidenceId: nullableString(item.evidence_id),
				findingId: nullableString(item.finding_id),
			};
		}),
		total: numberValue(envelope.total, rows.length),
		currentPage: numberValue(envelope.current_page, 1),
		lastPage: numberValue(envelope.last_page, 1),
		forbidden: false,
	};
};

export const parseScope = (value: unknown): DarkRiskScope => {
	const unwrapped = unwrapApiData(value);
	const object = objectValue(unwrapped);
	const rawTargets = Array.isArray(unwrapped)
		? unwrapped
		: Array.isArray(object.targets)
			? object.targets
			: [];
	const targets = rawTargets.flatMap((raw, index) => {
		const item = objectValue(raw);
		const candidate = stringValue(item.target || item.value || item.scope || item.selector).replace(/^@+/, "");
		try {
			const normalized = normalizeScopeValue(candidate);
			return [{
				id: stringValue(item.id, `${normalized.type}:${normalized.value}:${index}`),
				...normalized,
				enabled: item.enabled !== false,
			}];
		} catch {
			return [];
		}
	});
	return { targets: targets.slice(0, 4) };
};

export const parseRun = (value: unknown, mode: "standard" | "extended"): DarkRiskRun => {
	const item = objectValue(unwrapApiData(value));
	const rawStatus = stringValue(item.status, "queued").toLowerCase();
	const allowed: DarkRiskRunStatus[] = ["queued", "running", "completed", "partial", "failed"];
	const status = allowed.includes(rawStatus as DarkRiskRunStatus)
		? (rawStatus as DarkRiskRunStatus)
		: "queued";
	return {
		id: stringValue(item.id || item.run_id),
		status,
		mode,
		startedAt: nullableString(item.started_at || item.created_at),
		completedAt: nullableString(item.completed_at),
	};
};

export const parseRuns = (value: unknown, mode: "standard" | "extended"): DarkRiskRun[] => {
	const parsed = arrayEnvelopeSchema.safeParse(unwrapApiData(value));
	if (!parsed.success) return [];
	const rows = Array.isArray(parsed.data) ? parsed.data : parsed.data.data;
	return rows.map((row) => parseRun(row, mode)).filter((run) => run.id);
};

export const parseStandardOverview = (value: unknown): StandardOverview => {
	const item = objectValue(unwrapApiData(value));
	const kpis = objectValue(item.kpis);
	const credentials = objectValue(kpis.credential_leaks);
	const risk = objectValue(kpis.risk_score);
	const lastScan = objectValue(item.latest_scan);
	const weekly = Array.isArray(item.historical_weeks) ? item.historical_weeks : [];
	const total = numberValue(item.total_leaks ?? item.total_records ?? credentials.value);
	return {
		totalLeaks: total,
		isMinimum: item.is_minimum === true || item.limit_reached === true,
		newLeaks: numberValue(item.new_leaks ?? item.new_this_week ?? credentials.delta),
		riskScore: numberValue(item.risk_score ?? risk.value),
		riskLevel: stringValue(item.risk_level ?? risk.level, "Non calcolato"),
		lastScanAt: nullableString(item.last_scan_at || lastScan.completed_at || lastScan.started_at),
		monitoredTargets: numberValue(item.monitored_targets ?? objectValue(kpis.monitored_domains).value),
		weeklyTrend: weekly.map((row) => {
			const point = objectValue(row);
			return {
				period: stringValue(point.period || point.week_key),
				total: numberValue(point.total || point.total_records),
				newLeaks: numberValue(point.new_leaks || point.new_this_week),
			};
		}),
		snapshot: parseWeeklySnapshot(item.weekly_snapshot),
		// Contatore aggregato: è l'unico dato sulle credenziali che lo Standard
		// può mostrare, il dettaglio sta dietro l'endpoint riservato all'Esteso.
		credentialLeaks: numberValue(
			objectValue(objectValue(item.dti).sensitive_totals).passwords ?? credentials.value,
		),
	};
};

export const parseReports = (value: unknown): DarkRiskReport[] => {
	const parsed = arrayEnvelopeSchema.safeParse(unwrapApiData(value));
	if (!parsed.success) return [];
	const rows = Array.isArray(parsed.data) ? parsed.data : parsed.data.data;
	return rows.flatMap((raw) => {
		const item = objectValue(raw);
		const id = stringValue(item.id || item.report_id);
		if (!id) return [];
		const rawMode = stringValue(item.mode || item.report_mode || item.type).toLowerCase();
		const rawDownloadUrl = nullableString(item.download_url || item.signed_url || item.url);
		const downloadUrl = rawDownloadUrl && (
			rawDownloadUrl.startsWith("/") || /^https:\/\//i.test(rawDownloadUrl)
		) ? rawDownloadUrl : null;
		return [{
			id,
			mode: rawMode.includes("extend") || rawMode.includes("esteso") ? "extended" : "standard",
			period: nullableString(item.period || item.period_key || item.month),
			status: stringValue(item.status, "ready"),
			createdAt: nullableString(item.created_at || item.generated_at),
			downloadUrl,
			runId: nullableString(item.run_id || item.scan_run_id),
		} satisfies DarkRiskReport];
	});
};

const parseExtendedRecord = (value: unknown): ExtendedLeakRecord | null => {
	const item = objectValue(value);
	const bucket = stringValue(item.bucket || item.bucketname);
	if (bucket !== "leaks.private.general") return null;
	const selector = stringValue(item.selector || item.query_term || item.asset_scope);
	const user = stringValue(item.user || item.username || item.email);
	const date = nullableString(item.date || item.created_at);
	const sourceShort = stringValue(item.sourceshort || item.source_short || item.source);
	const id = stringValue(item.id || item.systemid || item.fingerprint) || `${selector}:${user}:${date ?? ""}:${sourceShort}`;
	return {
		id,
		selector,
		user,
		password: stringValue(item.password || item.credential_password),
		passwordType: stringValue(item.passwordtype || item.password_type),
		bucket: "leaks.private.general",
		date,
		sourceShort,
		sourceLong: stringValue(item.sourcelong || item.source_long),
		matchType: item.correlated_from_ip === true || item.match_type === "correlated_from_ip"
			? "correlated_from_ip"
			: "direct",
	};
};

export const parseExtendedResults = (value: unknown): ExtendedRunResult => {
	const unwrapped = unwrapApiData(value);
	const object = objectValue(unwrapped);
	const rows = Array.isArray(unwrapped)
		? unwrapped
		: Array.isArray(object.records)
			? object.records
			: Array.isArray(object.results)
				? object.results
				: Array.isArray(object.findings)
					? object.findings
					: [];
	const records = rows.map(parseExtendedRecord).filter((row): row is ExtendedLeakRecord => row !== null);
	return {
		run: object.run ? parseRun(object.run, "extended") : null,
		records,
		discardedBucketRecords: Math.max(0, rows.length - records.length),
	};
};
