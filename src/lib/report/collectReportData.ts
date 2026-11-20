/**
 * Dati del report PDF: un unico input, letto e congelato al click.
 *
 * Prima il report montava fuori schermo i componenti della Console e aspettava
 * che `useIsFetching()` tornasse a zero più 600 ms: una fonte lenta o in errore
 * finiva nel PDF come zero o sezione vuota, e i componenti che non passano da
 * react-query non venivano nemmeno aspettati. Qui ogni fonte ha un esito
 * esplicito (ok, vuota, errore, tempo scaduto, servizio non attivo) e il
 * renderer lo stampa così com'è.
 */
import { ApiError } from "@/lib/api-client";
import { assessmentV2Api } from "@/lib/api/assessment-v2";
import { assetInventoryApi } from "@/lib/api/asset-inventory";
import { darkRiskApi } from "@/lib/api/darkrisk";
import { remediationTasksApi } from "@/lib/api/remediation-tasks";
import { surfaceScan360Api, type SurfaceScanHistoryEntry, type SurfaceScanJob } from "@/lib/api/surface-scan360";
import { loadV2AssessmentData, mapToUiStatus } from "@/lib/assessmentV2Mapper";
import { buildCategoryScore, computeOverallScore, type CategoryScore } from "@/lib/assessment/scoring";
import { buildMailSecurityRows, type MailSecRow } from "@/lib/surfacescan/mailSecurity";
import { asSurfaceRiskLevel, surfaceRiskLevelFromPoints, type SurfaceRiskLevel } from "@/lib/surfacescan/riskLevel";
import {
	combineSurfaceFindings,
	countSurfaceFindings,
	mapSurfaceFinding,
	type SurfaceFindingRow,
	type SurfaceOpenPortRow,
} from "@/hooks/useSurfaceScanFindings";
import type { SurfaceMonitoredScopeRule } from "@/lib/surfaceScopeGuard";
import type { AssessmentCategory, AssessmentResponse } from "@/data/assessmentQuestions";
import type {
	AssessmentCampaignsResponse,
	AssessmentSnapshot,
	AssetInventoryResource,
	RemediationTask,
} from "@/types/api";

export type SourceStatus = "ok" | "empty" | "error" | "timeout" | "not_active";

export interface SourceResult<T> {
	status: SourceStatus;
	data: T | null;
	fetchedAt: string;
	/** Motivo leggibile quando la fonte non ha dati utilizzabili. */
	reason: string | null;
}

/** Anagrafica dall'organizzazione selezionata (campi opzionali). */
export interface ReportOrganization {
	name?: string;
	legal_name?: string | null;
	vat_number?: string | null;
	industry?: string | null;
	business_sector?: string | null;
	customer_sectors?: unknown;
	implemented_technologies?: unknown;
}

export interface ReportAssessment {
	categories: AssessmentCategory[];
	responses: Record<number, AssessmentResponse>;
	scores: CategoryScore[];
	overallScore: number;
	/** Ultima risposta modificata. */
	assessmentDate: string | null;
}

export interface ReportSurfaceScan {
	findings: SurfaceFindingRow[];
	counts: ReturnType<typeof countSurfaceFindings>;
	postureScore: number | null;
	riskLevel: SurfaceRiskLevel | null;
	riskPoints: number | null;
	lastScanAt: string | null;
	scopeRules: number;
	history: SurfaceScanHistoryEntry[];
	mail: MailSecRow[];
}

export interface ReportData {
	organizationId: string;
	companyName: string;
	org: ReportOrganization | null;
	generatedAt: Date;
	assessment: SourceResult<ReportAssessment>;
	campaigns: SourceResult<AssessmentCampaignsResponse>;
	snapshots: SourceResult<AssessmentSnapshot[]>;
	remediation: SourceResult<RemediationTask[]>;
	inventory: SourceResult<AssetInventoryResource>;
	surfaceScan: SourceResult<ReportSurfaceScan>;
	darkRisk: SourceResult<Record<string, unknown>>;
}

export interface CollectReportInput {
	organizationId: string;
	groupId: string | null;
	companyName: string;
	org: ReportOrganization | null;
	signal?: AbortSignal;
	/** Tempo massimo per fonte (ms). */
	timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 45_000;

class SourceTimeout extends Error {}
export class ReportAborted extends Error {
	constructor() {
		super("Generazione annullata: è cambiato il cliente selezionato.");
	}
}

const withTimeout = <T,>(promise: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> =>
	new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(new SourceTimeout()), ms);
		const onAbort = () => {
			clearTimeout(timer);
			reject(new ReportAborted());
		};
		signal?.addEventListener("abort", onAbort, { once: true });
		promise.then(
			(value) => {
				clearTimeout(timer);
				signal?.removeEventListener("abort", onAbort);
				resolve(value);
			},
			(error) => {
				clearTimeout(timer);
				signal?.removeEventListener("abort", onAbort);
				reject(error);
			},
		);
	});

const now = () => new Date().toISOString();

async function source<T>(
	load: () => Promise<T | null>,
	isEmpty: (value: T) => boolean,
	timeoutMs: number,
	signal?: AbortSignal,
): Promise<SourceResult<T>> {
	try {
		const data = await withTimeout(load(), timeoutMs, signal);
		if (data === null || data === undefined || isEmpty(data)) {
			return { status: "empty", data: data ?? null, fetchedAt: now(), reason: "Nessun dato disponibile" };
		}
		return { status: "ok", data, fetchedAt: now(), reason: null };
	} catch (error) {
		if (error instanceof ReportAborted) throw error;
		if (error instanceof SourceTimeout) {
			return { status: "timeout", data: null, fetchedAt: now(), reason: "La fonte non ha risposto in tempo" };
		}
		// Servizio non attivo per il cliente o non visibile al ruolo: la sezione si omette.
		if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
			return { status: "not_active", data: null, fetchedAt: now(), reason: "Servizio non attivo" };
		}
		return {
			status: "error",
			data: null,
			fetchedAt: now(),
			reason: error instanceof Error && error.message ? error.message : "Errore nel caricamento",
		};
	}
}

async function loadAssessment(organizationId: string, groupId: string | null): Promise<ReportAssessment> {
	const { categories, indexToUuid } = await loadV2AssessmentData(groupId);
	const items = await assessmentV2Api.responses(organizationId, groupId);

	const uuidToIndex: Record<string, number> = {};
	Object.entries(indexToUuid).forEach(([idx, uuid]) => {
		uuidToIndex[uuid as string] = Number(idx);
	});
	const responses: Record<number, AssessmentResponse> = {};
	items.forEach((it) => {
		const idx = uuidToIndex[it.question_id];
		if (idx) responses[idx] = mapToUiStatus(it.status);
	});

	const assessmentDate = items.reduce<string | null>((max, it) => {
		const d = it.updated_at;
		return d && (!max || d > max) ? d : max;
	}, null);

	return {
		categories,
		responses,
		scores: categories.map((c) => buildCategoryScore(c, responses, categories)),
		overallScore: computeOverallScore(categories, responses),
		assessmentDate,
	};
}

async function loadSurfaceScan(organizationId: string, groupId: string | null): Promise<ReportSurfaceScan> {
	// L'exposure summary decide se il servizio è attivo: se risponde 403 la
	// sezione si omette invece di stampare zeri.
	const summary = (await surfaceScan360Api.getExposureSummary(organizationId, undefined, groupId)) as Record<string, unknown> | null;

	const [jobs, direct, openPorts, aiReports, scope, history, observations] = await Promise.all([
		surfaceScan360Api.listJobs(organizationId, { page: 1 }, groupId),
		surfaceScan360Api.getFindings(organizationId, { per_page: 500 }, groupId),
		surfaceScan360Api.getOpenPorts(organizationId, { per_page: 500 }, groupId),
		surfaceScan360Api.listAiReports(organizationId, { page: 1 }, groupId),
		surfaceScan360Api.listMonitoredIps(organizationId, groupId),
		surfaceScan360Api.listHistory(organizationId, 12, groupId),
		surfaceScan360Api
			.getObservations(organizationId, { module: "mail_config,connectsecure", observation_type: "mail_config_summary,mail_security_summary" }, groupId)
			.catch(() => []),
	]);

	const completed = (jobs as SurfaceScanJob[]).filter((j) => j.status === "completed").slice(0, 10);
	const perJob = await Promise.allSettled(
		completed.map((job) => surfaceScan360Api.getJobFindings(organizationId, job.id, { page: 1 }, groupId)),
	);
	const jobFindings: SurfaceFindingRow[] = [];
	const seen = new Set<string>();
	for (const result of perJob) {
		if (result.status !== "fulfilled" || !Array.isArray(result.value)) continue;
		for (const raw of result.value as Record<string, unknown>[]) {
			const row = mapSurfaceFinding(raw);
			if (row && !seen.has(row.id)) {
				seen.add(row.id);
				jobFindings.push(row);
			}
		}
	}

	const findings = combineSurfaceFindings({
		jobFindings,
		directFindings: ((direct || []) as Record<string, unknown>[])
			.map((raw) => mapSurfaceFinding(raw))
			.filter((row): row is SurfaceFindingRow => Boolean(row)),
		openPorts: (openPorts || []) as SurfaceOpenPortRow[],
		aiReports: (aiReports || []) as unknown as Record<string, any>[], // eslint-disable-line @typescript-eslint/no-explicit-any
		jobs: jobs as SurfaceScanJob[],
		scopeRules: (scope || []) as SurfaceMonitoredScopeRule[],
	});

	const posture = summary?.posture_score;
	const postureScore = posture === null || posture === undefined ? null : Number(posture);
	const riskPoints = summary?.risk_points === null || summary?.risk_points === undefined ? null : Number(summary.risk_points);

	const lastScanAt = (jobs as SurfaceScanJob[])
		.filter((j) => ["completed", "partial", "completed_with_warnings"].includes(String(j.status)))
		.map((j) => j.completed_at || j.created_at)
		.filter(Boolean)
		.sort()
		.pop() ?? null;

	return {
		findings,
		counts: countSurfaceFindings(findings),
		postureScore: Number.isFinite(postureScore) ? postureScore : null,
		riskLevel: postureScore === null ? null : asSurfaceRiskLevel(summary?.risk_level) ?? surfaceRiskLevelFromPoints(riskPoints),
		riskPoints: Number.isFinite(riskPoints) ? riskPoints : null,
		lastScanAt,
		scopeRules: (scope || []).length,
		history: history || [],
		mail: buildMailSecurityRows((observations || []) as unknown[] as any[], jobs as unknown[] as any[]), // eslint-disable-line @typescript-eslint/no-explicit-any
	};
}

export async function collectReportData(input: CollectReportInput): Promise<ReportData> {
	const { organizationId, groupId, signal } = input;
	const timeout = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const generatedAt = new Date();

	if (signal?.aborted) throw new ReportAborted();

	const [assessment, campaigns, snapshots, remediation, inventory, surfaceScan, darkRisk] = await Promise.all([
		source(() => loadAssessment(organizationId, groupId), (a) => a.categories.length === 0, timeout, signal),
		source(() => assessmentV2Api.campaigns(organizationId, groupId), () => false, timeout, signal),
		source(() => assessmentV2Api.snapshots(organizationId, groupId), (s) => s.length === 0, timeout, signal),
		source(
			async () => (await remediationTasksApi.list(organizationId, groupId)).filter((t) => !t.is_deleted && !t.is_hidden),
			(t) => t.length === 0,
			timeout,
			signal,
		),
		source(() => assetInventoryApi.getByOrganization(organizationId, groupId ?? undefined), () => false, timeout, signal),
		source(() => loadSurfaceScan(organizationId, groupId), () => false, timeout, signal),
		source(
			async () => (await darkRiskApi.getOverview(organizationId, groupId)) as Record<string, unknown>,
			(o) => o.enabled === false,
			timeout,
			signal,
		),
	]);

	// Il tenant è quello del click: se nel frattempo è cambiato, niente PDF misto.
	if (signal?.aborted) throw new ReportAborted();

	return {
		organizationId,
		companyName: input.companyName,
		org: input.org,
		generatedAt,
		assessment,
		campaigns,
		snapshots,
		remediation,
		inventory,
		surfaceScan,
		darkRisk,
	};
}
