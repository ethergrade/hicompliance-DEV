import { useQuery } from "@tanstack/react-query";
import { useClientOrganization } from "@/hooks/useClientOrganization";
import { assessmentV2Api } from "@/lib/api/assessment-v2";
import { loadV2AssessmentData, mapToUiStatus } from "@/lib/assessmentV2Mapper";
import {
	buildCategoryScore,
	computeOverallScore,
	isQuestionVisible,
} from "@/lib/assessment/scoring";
import {
	calculateCategoryScore,
	getRiskFromScore,
	type AssessmentCategory,
	type AssessmentResponse,
} from "@/data/assessmentQuestions";
import { remediationTasksApi } from "@/lib/api";
import { assetInventoryApi } from "@/lib/api/asset-inventory";
import { parseAiCategoryAdvice, type AiCategoryAdvice } from "@/lib/report/parseAiCategories";
import type { RemediationTask, AssetInventoryResource } from "@/types/api";

export interface ReportCategorySummary {
	name: string;
	score: number;
	riskLabel: string;
	total: number;
	answered: number;
	counts: {
		completato: number;
		pianificato_in_corso: number;
		non_iniziato: number;
		non_applicabile: number;
	};
	isNotApplicable: boolean;
}

export interface ReportAssessmentData {
	categories: AssessmentCategory[];
	responses: Record<number, AssessmentResponse>;
	overallScore: number;
	overallRiskLabel: string;
	categorySummaries: ReportCategorySummary[];
	radar: { category: string; fullName: string; compliance: number; target: number }[];
	/** Ultima modifica dell'assessment (max updated_at delle risposte). */
	assessmentDate: string | null;
}

export interface ReportRemediationTask {
	id: string;
	task: string;
	category: string;
	start_date: string;
	end_date: string;
	progress: number;
	priority: string;
	assignee: string | null;
	budget: number | null;
}

export interface ReportRemediationData {
	tasks: ReportRemediationTask[];
	counters: {
		totalBudget: string;
		estimatedCompletion: string;
		riskReduction: string;
		complianceImprovement: string;
		criticalIssues: number;
		highPriorityActions: number;
	};
}

export interface FullReportData {
	assessment: ReportAssessmentData | null;
	remediation: ReportRemediationData | null;
	consistenze: AssetInventoryResource | null;
	/** Data dell'ultimo snapshot (= "Elaborazione assessment"). */
	elaborazioneDate: string | null;
	/** Consigli per categoria estratti dal report OpenAI dell'ultimo snapshot. */
	aiCategoryAdvice: AiCategoryAdvice[];
	isLoading: boolean;
}

async function loadAssessment(
	organizationId: string,
	groupId: string | null,
): Promise<ReportAssessmentData> {
	const { categories, indexToUuid } = await loadV2AssessmentData(groupId);
	const items = await assessmentV2Api.responses(organizationId, groupId);

	const uuidToIndex: Record<string, number> = {};
	Object.entries(indexToUuid).forEach(([idx, uuid]) => {
		uuidToIndex[uuid] = Number(idx);
	});
	const responses: Record<number, AssessmentResponse> = {};
	items.forEach((it) => {
		const idx = uuidToIndex[it.question_id];
		if (idx) responses[idx] = mapToUiStatus(it.status);
	});

	const overallScore = computeOverallScore(categories, responses);

	const categorySummaries: ReportCategorySummary[] = categories.map((cat) => {
		const base = buildCategoryScore(cat, responses, categories);
		const counts = {
			completato: 0,
			pianificato_in_corso: 0,
			non_iniziato: 0,
			non_applicabile: 0,
		};
		let total = 0;
		for (const q of cat.questions) {
			if (!isQuestionVisible(q, responses, categories)) continue;
			total++;
			const r = responses[q.id];
			if (r && counts[r] !== undefined) counts[r]++;
		}
		return {
			name: cat.name,
			score: base.score,
			riskLabel: getRiskFromScore(base.score).label,
			total,
			answered: base.answered,
			counts,
			isNotApplicable: base.isNotApplicable,
		};
	});

	const radar = categorySummaries
		.filter((c) => !c.isNotApplicable)
		.map((c) => ({
			category: c.name.length > 14 ? `${c.name.substring(0, 12)}…` : c.name,
			fullName: c.name,
			compliance: Number.isFinite(c.score) ? c.score : 0,
			target: 90,
		}));

	const assessmentDate = items.reduce<string | null>((max, it) => {
		const d = it.updated_at;
		return d && (!max || d > max) ? d : max;
	}, null);

	return {
		categories,
		responses,
		overallScore,
		overallRiskLabel: getRiskFromScore(overallScore).label,
		categorySummaries,
		radar,
		assessmentDate,
	};
}

async function loadRemediation(
	organizationId: string,
	groupId: string | null,
): Promise<ReportRemediationData> {
	const all: RemediationTask[] = await remediationTasksApi.list(organizationId, groupId);
	const active = all.filter((t) => !t.is_deleted);

	const tasks: ReportRemediationTask[] = active.map((t) => ({
		id: t.id,
		task: t.task,
		category: t.category || "Altro",
		start_date: t.start_date,
		end_date: t.end_date,
		progress: typeof t.progress === "number" ? t.progress : 0,
		priority: t.priority,
		assignee: t.assignee ?? null,
		budget: t.budget ?? null,
	}));

	const totalBudget = tasks.reduce((s, t) => s + (t.budget || 0), 0);
	const critical = tasks.filter((t) => t.priority === "critical");
	const high = tasks.filter((t) => t.priority === "high");
	const totalProgress =
		tasks.length > 0
			? Math.round(tasks.reduce((s, t) => s + (t.progress || 0), 0) / tasks.length)
			: 0;
	const avgDaysRemaining =
		tasks.length > 0
			? Math.round(
					tasks.reduce((s, t) => {
						const days = Math.ceil(
							(new Date(t.end_date).getTime() - Date.now()) / 86_400_000,
						);
						return s + Math.max(0, days);
					}, 0) / tasks.length,
				)
			: 0;

	return {
		tasks,
		counters: {
			totalBudget: `€${totalBudget.toLocaleString("it-IT")}`,
			estimatedCompletion: tasks.length > 0 ? `${avgDaysRemaining} giorni` : "—",
			riskReduction: `${totalProgress}%`,
			complianceImprovement: `${Math.min(100, Math.round(totalProgress * 1.2))}%`,
			criticalIssues: critical.length,
			highPriorityActions: high.length,
		},
	};
}

/**
 * Aggrega i dati "data-driven" del report cliente (assessment + remediation).
 * Le sezioni SurfaceScan/DarkRisk sono rese da componenti self-contained che
 * caricano i propri dati; la readiness complessiva è data da useIsFetching.
 */
export function useFullReportData(): FullReportData {
	const { organizationId, groupId } = useClientOrganization();
	const enabled = !!organizationId;

	const assessmentQuery = useQuery({
		queryKey: ["report-assessment", organizationId, groupId],
		enabled,
		queryFn: () => loadAssessment(organizationId!, groupId),
	});

	const remediationQuery = useQuery({
		queryKey: ["report-remediation", organizationId, groupId],
		enabled,
		queryFn: () => loadRemediation(organizationId!, groupId),
	});

	const consistenzeQuery = useQuery({
		queryKey: ["report-consistenze", organizationId, groupId],
		enabled,
		queryFn: () => assetInventoryApi.getByOrganization(organizationId!, groupId ?? undefined),
	});

	const snapshotQuery = useQuery({
		queryKey: ["report-snapshot", organizationId, groupId],
		enabled,
		queryFn: async () => {
			const snaps = await assessmentV2Api.snapshots(organizationId!, groupId);
			if (!snaps || snaps.length === 0) return null;
			return [...snaps].sort(
				(a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
			)[0];
		},
	});

	const latestSnapshot = snapshotQuery.data ?? null;

	/**
	 * I consigli per categoria, dalla struttura quando c'è.
	 *
	 * Gli snapshot mai rielaborati hanno ancora il markdown del vecchio flusso e
	 * passano dal parser, che resta solo per loro: appena il ciclo viene riconfermato
	 * il report legge il JSON e nessuno deve più indovinare dove finisce una sezione.
	 */
	function categoryAdvice(snapshot: typeof latestSnapshot): AiCategoryAdvice[] {
		if (!snapshot) return [];

		if (snapshot.analysis?.categories?.length) {
			return snapshot.analysis.categories.map((c) => ({
				category: c.category_name,
				advice: c.advice,
			}));
		}

		return parseAiCategoryAdvice(snapshot.openai_data);
	}

	return {
		assessment: assessmentQuery.data ?? null,
		remediation: remediationQuery.data ?? null,
		consistenze: consistenzeQuery.data ?? null,
		elaborazioneDate: latestSnapshot?.created_at ?? null,
		aiCategoryAdvice: categoryAdvice(latestSnapshot),
		isLoading:
			assessmentQuery.isLoading ||
			remediationQuery.isLoading ||
			consistenzeQuery.isLoading ||
			snapshotQuery.isLoading,
	};
}
