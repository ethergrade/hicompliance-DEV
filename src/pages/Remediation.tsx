import React, { useState, useEffect, useCallback, useMemo } from "react";
import { remediationTasksApi } from "@/lib/api";
import type {
	RemediationTask,
	StoreRemediationTaskRequest,
	UpdateRemediationTaskRequest,
} from "@/types/api";
import { useClientOrganization } from "@/hooks/useClientOrganization";
import { useAuth } from "@/components/auth/AuthProvider";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { GanttChart, GanttTask } from "@/components/remediation/GanttChart";
import {
	format,
	addDays,
	addMonths,
	subMonths,
	differenceInDays,
	parseISO,
} from "date-fns";
import { cn } from "@/lib/utils";
import {
	AlertTriangle,
	Calendar,
	CheckCircle,
	Clock,
	FileText,
	TrendingUp,
	Users,
	Target,
	Wrench,
	BarChart3,
	CalendarDays,
	Plus,
	Calculator,
	Euro,
	Trash2,
	Settings,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { getErrorDetail } from "@/lib/api-client";

/* ─── Types ─── */
interface DbTask {
	id: string;
	task: string;
	category: string;
	start_date: string;
	end_date: string;
	progress: number;
	assignee: string | null;
	priority: string;
	color: string;
	budget: number | null;
	display_order: number | null;
	is_hidden: boolean | null;
	is_deleted: boolean | null;
	dependencies: string[] | null;
	organization_id: string | null;
}

/* ─── Demo seed data ─── */
const DEMO_TASKS = [
	{
		task: "Implementazione IAM centralizzato",
		category: "Gestione delle identità",
		start_date: "2026-01-15",
		end_date: "2026-03-01",
		progress: 65,
		assignee: "IT Security Team",
		priority: "critical",
		color: "#DC2626",
		budget: 16500,
	},
	{
		task: "Audit accessi privilegiati",
		category: "Gestione delle identità",
		start_date: "2026-01-20",
		end_date: "2026-02-15",
		progress: 100,
		assignee: "Security Auditor",
		priority: "critical",
		color: "#DC2626",
		budget: 8000,
	},
	{
		task: "Implementazione SAST/DAST",
		category: "Sviluppo software",
		start_date: "2026-02-01",
		end_date: "2026-04-01",
		progress: 40,
		assignee: "DevSecOps Team",
		priority: "high",
		color: "#EA580C",
		budget: 18000,
	},
	{
		task: "Training sviluppatori Secure Coding",
		category: "Sviluppo software",
		start_date: "2026-01-25",
		end_date: "2026-02-25",
		progress: 100,
		assignee: "HR & Security",
		priority: "high",
		color: "#EA580C",
		budget: 7500,
	},
	{
		task: "Assessment fornitori critici",
		category: "Gestione fornitori",
		start_date: "2026-02-15",
		end_date: "2026-03-15",
		progress: 80,
		assignee: "Procurement Team",
		priority: "medium",
		color: "#EAB308",
		budget: 4500,
	},
	{
		task: "Implementazione procedure backup",
		category: "Business Continuity",
		start_date: "2026-03-01",
		end_date: "2026-04-15",
		progress: 25,
		assignee: "Operations Team",
		priority: "high",
		color: "#EA580C",
		budget: 6000,
	},
	{
		task: "Implementazione Incident Response Plan",
		category: "Incident Management",
		start_date: "2026-02-10",
		end_date: "2026-03-20",
		progress: 50,
		assignee: "IT Security Team",
		priority: "high",
		color: "#EA580C",
		budget: 8000,
	},
	{
		task: "Deployment MFA aziendale",
		category: "Gestione delle identità",
		start_date: "2026-03-15",
		end_date: "2026-05-01",
		progress: 10,
		assignee: "IT Security Team",
		priority: "critical",
		color: "#DC2626",
		budget: 12000,
	},
	{
		task: "Penetration Test infrastruttura",
		category: "Network Security",
		start_date: "2026-04-01",
		end_date: "2026-05-15",
		progress: 0,
		assignee: "Security Auditor",
		priority: "high",
		color: "#EA580C",
		budget: 15000,
	},
	{
		task: "Revisione policy crittografia",
		category: "Crittografia",
		start_date: "2026-04-15",
		end_date: "2026-06-01",
		progress: 0,
		assignee: "Compliance Team",
		priority: "medium",
		color: "#EAB308",
		budget: 5000,
	},
	{
		task: "Implementazione SIEM / SOC",
		category: "Network Security",
		start_date: "2026-05-01",
		end_date: "2026-08-01",
		progress: 0,
		assignee: "IT Security Team",
		priority: "critical",
		color: "#DC2626",
		budget: 45000,
	},
	{
		task: "Hardening server e endpoint",
		category: "Manutenzione",
		start_date: "2026-05-15",
		end_date: "2026-07-15",
		progress: 0,
		assignee: "Operations Team",
		priority: "high",
		color: "#EA580C",
		budget: 9000,
	},
	{
		task: "Awareness training dipendenti Q3",
		category: "HR & Formazione",
		start_date: "2026-07-01",
		end_date: "2026-08-15",
		progress: 0,
		assignee: "HR & Training",
		priority: "medium",
		color: "#EAB308",
		budget: 6500,
	},
	{
		task: "Disaster Recovery test annuale",
		category: "Business Continuity",
		start_date: "2026-09-01",
		end_date: "2026-10-15",
		progress: 0,
		assignee: "Operations Team",
		priority: "high",
		color: "#EA580C",
		budget: 8000,
	},
	{
		task: "Certificazione ISO 27001 — audit fase 1",
		category: "Certificazioni",
		start_date: "2026-09-15",
		end_date: "2026-11-30",
		progress: 0,
		assignee: "Compliance Team",
		priority: "critical",
		color: "#DC2626",
		budget: 25000,
	},
	{
		task: "Revisione contratti fornitori IT",
		category: "Gestione fornitori",
		start_date: "2026-06-01",
		end_date: "2026-07-15",
		progress: 0,
		assignee: "Procurement Team",
		priority: "low",
		color: "#22C55E",
		budget: 3000,
	},
	{
		task: "Tabletop exercise — simulazione incidente",
		category: "Incident Management",
		start_date: "2026-10-01",
		end_date: "2026-11-01",
		progress: 0,
		assignee: "IT Security Team",
		priority: "high",
		color: "#EA580C",
		budget: 4000,
	},
	{
		task: "NIS2 gap remediation finale",
		category: "Governance",
		start_date: "2026-11-01",
		end_date: "2026-12-15",
		progress: 0,
		assignee: "Compliance Team",
		priority: "critical",
		color: "#DC2626",
		budget: 20000,
	},
];

const PRIORITY_DB_TO_IT: Record<string, string> = {
	critical: "Critica",
	high: "Alta",
	medium: "Media",
	low: "Bassa",
};
const PRIORITY_IT_TO_DB: Record<string, string> = {
	Critica: "critical",
	Alta: "high",
	Media: "medium",
	Bassa: "low",
	critica: "critical",
	alta: "high",
	media: "medium",
	bassa: "low",
};

// Gantt defaults: da 1 mese prima di oggi a 12 mesi dopo
// Le date sono ricomputate a ogni mount del componente
const GANTT_START = new Date();
const GANTT_END = new Date();
GANTT_START.setMonth(GANTT_START.getMonth() - 1);
GANTT_END.setMonth(GANTT_END.getMonth() + 12);

/* ─── Component ─── */
const Remediation: React.FC = () => {
	const { organizationId: orgId, groupId } = useClientOrganization();
	const { capabilities } = useAuth();
	const canEdit = capabilities?.["hicompliance.remediation_tasks.edit"] ?? true;
	const canUpdateProgress = capabilities?.["hicompliance.remediation_tasks.view"] ?? false;

	const defaultPrefs = useMemo(
		() => ({ selectedTimeframe: "90days", defaultView: "gantt" }),
		[],
	);
	const { preferences, updatePreferences } = useUserPreferences({
		preferenceKey: "remediation_filters",
		defaultPreferences: defaultPrefs,
		groupId,
	});

	const [selectedTimeframe, setSelectedTimeframeState] = useState("90days");
	const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
	const [tasks, setTasks] = useState<DbTask[]>([]);
	const [loading, setLoading] = useState(true);
	const [editingTask, setEditingTask] = useState<string | null>(null);
	const [editTaskData, setEditTaskData] = useState<DbTask | null>(null);
	const [newRemediation, setNewRemediation] = useState({
		category: "",
		priority: "",
		description: "",
		estimatedDays: "",
		estimatedBudget: "",
		assignedTeam: "",
		complexity: "medium",
		startDate: "",
	});

	useEffect(() => {
		if (preferences.selectedTimeframe)
			setSelectedTimeframeState(preferences.selectedTimeframe as string);
	}, [preferences.selectedTimeframe]);

	const setSelectedTimeframe = (value: string) => {
		setSelectedTimeframeState(value);
		updatePreferences({ selectedTimeframe: value });
	};

	/* ─── Mappers v2 (RemediationTask ↔ DbTask) ─── */
	const apiTaskToDbTask = useCallback(
		(task: RemediationTask, orgId: string): DbTask => ({
			id: task.id,
			task: task.task,
			category: task.category || "Altro",
			start_date: task.start_date,
			end_date: task.end_date,
			progress: typeof task.progress === "number" ? task.progress : 0,
			assignee: task.assignee ?? null,
			priority: task.priority,
			color: task.color,
			budget: task.budget ?? null,
			display_order: task.display_order ?? null,
			is_hidden: task.is_hidden,
			is_deleted: task.is_deleted,
			dependencies: task.dependencies ?? null,
			organization_id: orgId,
		}),
		[],
	);

	// Removed: dbTaskToApiPayload (not used — handlers pass partials directly to the API).

	/* ─── Load tasks from v2 API ─── */
	const loadTasks = useCallback(async () => {
		if (!orgId) {
			setLoading(false);
			setTasks([]);
			return;
		}
		setTasks([]); // Clear previous tasks while loading
		try {
			console.log("[Remediation] Loading v2 tasks for orgId:", orgId);
			const all = await remediationTasksApi.list(orgId, groupId);
			console.log(
				"[Remediation] Got tasks:",
				all.length,
				"for group:",
				groupId,
			);
			setTasks(all.map((t) => apiTaskToDbTask(t, orgId)));
		} catch (error) {
			console.error("[Remediation] Error loading tasks:", error);
			toast({
				title: "Errore",
				description: getErrorDetail(error) || "Impossibile caricare i task.",
				variant: "destructive",
			});
			setTasks([]);
		} finally {
			setLoading(false);
		}
	}, [orgId, groupId, apiTaskToDbTask]);

	useEffect(() => {
		loadTasks();
	}, [loadTasks]);

	/* ─── Derived data ─── */
	const activeTasks = tasks.filter(
		(t) => !t.is_deleted && t.organization_id === orgId,
	);
	const deletedTasksList = tasks.filter((t) => t.is_deleted);

	const ganttData: GanttTask[] = activeTasks.map((t) => {
		const totalDays = differenceInDays(GANTT_END, GANTT_START);
		const daysFromStart = differenceInDays(parseISO(t.start_date), GANTT_START);
		const duration = differenceInDays(
			parseISO(t.end_date),
			parseISO(t.start_date),
		);
		return {
			id: t.id,
			task: t.task,
			category: t.category,
			startDate: t.start_date,
			endDate: t.end_date,
			progress: t.progress,
			priority: PRIORITY_DB_TO_IT[t.priority] || "Media",
			color: t.color,
			assignee: t.assignee || "",
			isHidden: t.is_hidden || false,
			budget: t.budget || 0,
			startOffset: (daysFromStart / totalDays) * 100,
			width: (duration / totalDays) * 100,
			duration,
		};
	});

	const totalBudget = ganttData.reduce((sum, t) => sum + (t.budget || 0), 0);

	/* ─── DB mutation helpers ─── */
	// Optimistic update + per-task PUT against v2 API
	const updateTask = useCallback(
		async (taskId: string, updates: Record<string, unknown>) => {
			if (!orgId) return;
			let snapshot: DbTask[] = [];
			setTasks((prev) => {
				snapshot = prev;
				return prev.map((t) => (t.id === taskId ? { ...t, ...updates } : t));
			});
			try {
				const updated = await remediationTasksApi.update(
					orgId,
					taskId,
					updates as UpdateRemediationTaskRequest,
					groupId,
				);
				// Merge server-canonical fields (id, timestamps, color, source) back in
				setTasks((prev) =>
					prev.map((t) =>
						t.id === taskId ? apiTaskToDbTask(updated, orgId) : t,
					),
				);
			} catch (err: unknown) {
				// Rollback optimistic update
				setTasks(snapshot);
				console.error("[Remediation] Error updating task:", err);
				const detail = getErrorDetail(err);
				// 404 → task was deleted elsewhere; refetch silently
				if (err?.status === 404) {
					await loadTasks();
					return;
				}
				toast({
					title: "Errore",
					description: detail || "Impossibile salvare le modifiche.",
					variant: "destructive",
				});
				throw err;
			}
		},
		[orgId, apiTaskToDbTask, loadTasks],
	);

	/* ─── Handlers ─── */
	const handleDateChange = useCallback(
		async (taskId: string, startDate: string, endDate: string) => {
			await updateTask(taskId, { start_date: startDate, end_date: endDate });
			toast({
				title: "Date aggiornate",
				description: "Le date sono state salvate.",
			});
		},
		[updateTask],
	);

	const handleDeleteTask = useCallback(
		async (taskId: string) => {
			// Soft delete via PATCH-style update: keeps the row so the "Deleted" tab can restore it.
			// Backend uses PUT (per OpenAPI spec), we pass only the toggled field.
			await updateTask(taskId, { is_deleted: true });
			toast({
				title: "Task eliminato",
				description: "Il task è stato eliminato.",
			});
		},
		[updateTask],
	);

	const handleRestoreTask = useCallback(
		async (taskId: string) => {
			await updateTask(taskId, { is_deleted: false });
			toast({
				title: "Task ripristinato",
				description: "Il task è stato ripristinato.",
			});
		},
		[updateTask],
	);

	const handleToggleVisibility = useCallback(
		async (taskId: string) => {
			const task = tasks.find((t) => t.id === taskId);
			if (!task) return;
			await updateTask(taskId, { is_hidden: !task.is_hidden });
		},
		[tasks, updateTask],
	);

	const handleEditTask = useCallback((action: GanttTask) => {
		setEditingTask(action.id);
		setEditTaskData({
			task: action.task,
			category: action.category,
			assignee: action.assignee,
			priority: action.priority,
			progress: action.progress,
			budget: action.budget || 0,
			startDate: action.startDate,
			endDate: action.endDate,
		});
	}, []);

	const handleSaveEditedTask = useCallback(async () => {
		if (!editingTask || !editTaskData) return;
		try {
			await updateTask(editingTask, {
				task: editTaskData.task,
				category: editTaskData.category,
				assignee: editTaskData.assignee,
				priority: PRIORITY_IT_TO_DB[editTaskData.priority] || "medium",
				progress: editTaskData.progress,
				budget: Number(editTaskData.budget) || 0,
				start_date: editTaskData.startDate,
				end_date: editTaskData.endDate,
			});
			toast({
				title: "Task aggiornato",
				description: "Le modifiche sono state salvate.",
			});
			setEditingTask(null);
			setEditTaskData(null);
		} catch {
			// error already toasted in updateTask
		}
	}, [editingTask, editTaskData, updateTask]);

	const handleReorderTasks = useCallback(
		async (taskId: string, newIndex: number) => {
			if (!orgId) return;
			const currentOrder = activeTasks.map((t) => t.id);
			const currentIndex = currentOrder.indexOf(taskId);
			if (currentIndex === -1) return;
			currentOrder.splice(currentIndex, 1);
			currentOrder.splice(newIndex, 0, taskId);

			// Optimistic reorder — assign new display_order to each active task
			const previousOrder = activeTasks.map((t) => t.display_order);
			setTasks((prev) => {
				const reorderedActive = currentOrder.map((id, idx) => {
					const t = prev.find((task) => task.id === id)!;
					return { ...t, display_order: idx };
				});
				const deleted = prev.filter((t) => t.is_deleted);
				return [...reorderedActive, ...deleted];
			});

			// Persist display_order per task via PUT (v2 endpoint)
			const updates = currentOrder.map((id, idx) =>
				remediationTasksApi
					.update(orgId, id, { display_order: idx })
					.catch((err) => {
						console.error(`[Remediation] Reorder failed for ${id}:`, err);
						return null;
					}),
			);
			const results = await Promise.all(updates);
			const failures = results.filter((r) => r === null).length;
			if (failures > 0) {
				toast({
					title: "Alcuni riordini non salvati",
					description: `${failures} task non sono stati aggiornati sul server.`,
					variant: "destructive",
				});
			}
			// Suppress unused var lint
			void previousOrder;
		},
		[activeTasks, orgId],
	);

	const handleProgressChange = useCallback(
		async (taskId: string, progress: number) => {
			if (!orgId) return;
			setTasks((prev) =>
				prev.map((t) => (t.id === taskId ? { ...t, progress } : t)),
			);
			try {
				await remediationTasksApi.updateProgress(
					orgId,
					taskId,
					progress,
					groupId,
				);
			} catch (err) {
				await loadTasks();
				toast({
					title: "Errore",
					description:
						getErrorDetail(err) || "Impossibile aggiornare il progresso.",
					variant: "destructive",
				});
			}
		},
		[orgId, groupId, loadTasks],
	);

	/* ─── Create new task ─── */
	const calculateBudget = (days: number, complexity: string) => {
		const rates: Record<string, number> = { low: 300, medium: 500, high: 800 };
		return Math.round(days * (rates[complexity] || 500));
	};
	const calculateDays = (complexity: string, categoryType: string) => {
		const estimates: Record<string, Record<string, number>> = {
			identity_management: { low: 15, medium: 30, high: 45 },
			software_development: { low: 20, medium: 40, high: 60 },
			supplier_management: { low: 10, medium: 20, high: 30 },
			maintenance: { low: 12, medium: 25, high: 35 },
			governance: { low: 8, medium: 15, high: 25 },
		};
		return estimates[categoryType]?.[complexity] || 20;
	};
	// Map internal category key (used in calculateDays) to the display name
	// that the v2 backend expects and that the Gantt already shows.
	const CATEGORY_KEY_TO_LABEL: Record<string, string> = {
		identity_management: "Gestione delle identità",
		software_development: "Sviluppo software",
		supplier_management: "Gestione fornitori",
		maintenance: "Manutenzione continua",
		governance: "Governance",
		encryption: "Crittografia",
		incident_management: "Gestione incidenti",
		risk_management: "Gestione del rischio",
	};
	// Map team short key to full display name the backend uses.
	const TEAM_KEY_TO_LABEL: Record<string, string> = {
		"IT Security": "IT Security Team",
		Development: "Development Team",
		DevSecOps: "DevSecOps Team",
		Procurement: "Procurement Team",
		Operations: "Operations Team",
		Compliance: "Compliance Team",
		HR: "HR & Training",
	};

	const handleCreateRemediation = async () => {
		if (!orgId) {
			toast({
				title: "Errore",
				description: "Devi essere autenticato.",
				variant: "destructive",
			});
			return;
		}

		const estimatedDays =
			Number(newRemediation.estimatedDays) ||
			calculateDays(newRemediation.complexity, newRemediation.category);
		const estimatedBudget =
			Number(newRemediation.estimatedBudget) ||
			calculateBudget(estimatedDays, newRemediation.complexity);
		const startDate =
			newRemediation.startDate || format(new Date(), "yyyy-MM-dd");
		const endDate = format(
			addDays(new Date(startDate), estimatedDays),
			"yyyy-MM-dd",
		);

		const priorityColors: Record<string, string> = {
			critica: "#DC2626",
			alta: "#EA580C",
			media: "#EAB308",
			bassa: "#22C55E",
		};

		const payload: StoreRemediationTaskRequest = {
			task: newRemediation.description,
			category:
				CATEGORY_KEY_TO_LABEL[newRemediation.category] ||
				newRemediation.category,
			start_date: startDate,
			end_date: endDate,
			priority: (PRIORITY_IT_TO_DB[newRemediation.priority] ||
				"medium") as StoreRemediationTaskRequest["priority"],
			color: priorityColors[newRemediation.priority] || "#3b82f6",
			progress: 0,
			assignee:
				TEAM_KEY_TO_LABEL[newRemediation.assignedTeam] ||
				newRemediation.assignedTeam,
			budget: estimatedBudget,
			display_order: activeTasks.length,
			is_deleted: false,
			is_hidden: false,
			dependencies: [],
			source: "manual",
		};

		try {
			const created = await remediationTasksApi.create(orgId, payload, groupId);
			const mapped = apiTaskToDbTask(created, orgId);
			setTasks((prev) => [...prev, mapped]);
			toast({
				title: "Remediation creata",
				description: "Il task è stato salvato.",
			});
			setNewRemediation({
				category: "",
				priority: "",
				description: "",
				estimatedDays: "",
				estimatedBudget: "",
				assignedTeam: "",
				complexity: "medium",
				startDate: "",
			});
			setIsCreateModalOpen(false);
		} catch (err) {
			console.error("[Remediation] Error creating task:", err);
			toast({
				title: "Errore",
				description:
					getErrorDetail(err) || "Impossibile creare la remediation.",
				variant: "destructive",
			});
		}
	};

	/* ─── Static data ─── */
	const criticalCategories = [
		{
			name: "Gestione delle identità Gestione degli accessi",
			riskLevel: "Alto",
			priority: "Critica",
			completed: 5,
			total: 28,
			status: "not_started",
			estimatedDays: 45,
			assignedTeam: "IT Security",
			budget: "€16,500",
		},
		{
			name: "Sviluppo software",
			riskLevel: "Alto",
			priority: "Alta",
			completed: 1,
			total: 23,
			status: "planned_in_progress",
			estimatedDays: 60,
			assignedTeam: "Development",
			budget: "€18,000",
		},
		{
			name: "Gestione fornitori e acquisti",
			riskLevel: "Medio",
			priority: "Media",
			completed: 1,
			total: 19,
			status: "planned_in_progress",
			estimatedDays: 30,
			assignedTeam: "Procurement",
			budget: "€4,500",
		},
		{
			name: "Manutenzione e miglioramento continuo",
			riskLevel: "Medio",
			priority: "Media",
			completed: 1,
			total: 17,
			status: "planned_in_progress",
			estimatedDays: 35,
			assignedTeam: "Operations",
			budget: "€4,500",
		},
	];

	const getRiskColor = (level: string) => {
		switch (level) {
			case "Alto":
				return "text-red-500";
			case "Medio":
				return "text-yellow-500";
			case "Basso":
				return "text-green-500";
			default:
				return "text-gray-500";
		}
	};
	const getPriorityColor = (priority: string) => {
		switch (priority) {
			case "Critica":
				return "destructive";
			case "Alta":
				return "default";
			case "Media":
				return "secondary";
			default:
				return "outline";
		}
	};

	const criticalTasks = activeTasks.filter((t) => t.priority === "critical");
	const highPriorityTasks = activeTasks.filter((t) => t.priority === "high");
	const completedTasks = activeTasks.filter((t) => t.progress >= 100);
	const totalProgress =
		activeTasks.length > 0
			? Math.round(
					activeTasks.reduce((sum, t) => sum + (t.progress || 0), 0) /
						activeTasks.length,
				)
			: 0;
	const avgDaysRemaining =
		activeTasks.length > 0
			? Math.round(
					activeTasks.reduce((sum, t) => {
						const end = new Date(t.end_date);
						const diff = Math.max(
							0,
							Math.ceil((end.getTime() - Date.now()) / 86400000),
						);
						return sum + diff;
					}, 0) / activeTasks.length,
				)
			: 0;

	const actionableMetrics = {
		totalBudget: `€${totalBudget.toLocaleString("it-IT")}`,
		estimatedCompletion:
			activeTasks.length > 0 ? `${avgDaysRemaining} giorni` : "—",
		riskReduction: `${totalProgress}%`,
		complianceImprovement: `${Math.min(100, Math.round(totalProgress * 1.2))}%`,
		criticalIssues: criticalTasks.length,
		highPriorityActions: highPriorityTasks.length,
	};

	return (
		<DashboardLayout>
			<div className="space-y-6">
				<div className="flex items-center justify-between">
					<div>
						<h1 className="text-3xl font-bold text-foreground">
							Piano di Remediation
						</h1>
						<p className="text-muted-foreground">
							Azioni prioritarie per mitigare i rischi critici identificati
							nell'assessment
						</p>
					</div>
					<div className="flex space-x-2">
						<Dialog
							open={isCreateModalOpen}
							onOpenChange={setIsCreateModalOpen}
						>
							{canEdit && (
								<DialogTrigger asChild>
									<Button className="bg-green-600 hover:bg-green-700 text-white">
										<Plus className="w-4 h-4 mr-2" />
										Crea Remediation
									</Button>
								</DialogTrigger>
							)}
							<DialogContent className="max-w-2xl">
								<DialogHeader>
									<DialogTitle className="flex items-center">
										<Calculator className="w-5 h-5 mr-2" />
										Crea Nuova Remediation
									</DialogTitle>
								</DialogHeader>
								<div className="space-y-6 py-4">
									<div className="grid grid-cols-2 gap-4">
										<div className="space-y-2">
											<Label>Categoria Assessment</Label>
											<Select
												value={newRemediation.category}
												onValueChange={(v) =>
													setNewRemediation((p) => ({ ...p, category: v }))
												}
											>
												<SelectTrigger>
													<SelectValue placeholder="Seleziona categoria" />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="identity_management">
														Gestione delle identità
													</SelectItem>
													<SelectItem value="software_development">
														Sviluppo software
													</SelectItem>
													<SelectItem value="supplier_management">
														Gestione fornitori
													</SelectItem>
													<SelectItem value="maintenance">
														Manutenzione continua
													</SelectItem>
													<SelectItem value="governance">Governance</SelectItem>
													<SelectItem value="encryption">
														Crittografia
													</SelectItem>
													<SelectItem value="incident_management">
														Gestione incidenti
													</SelectItem>
													<SelectItem value="risk_management">
														Gestione del rischio
													</SelectItem>
												</SelectContent>
											</Select>
										</div>
										<div className="space-y-2">
											<Label>Priorità</Label>
											<Select
												value={newRemediation.priority}
												onValueChange={(v) =>
													setNewRemediation((p) => ({ ...p, priority: v }))
												}
											>
												<SelectTrigger>
													<SelectValue placeholder="Seleziona priorità" />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="critica">Critica</SelectItem>
													<SelectItem value="alta">Alta</SelectItem>
													<SelectItem value="media">Media</SelectItem>
													<SelectItem value="bassa">Bassa</SelectItem>
												</SelectContent>
											</Select>
										</div>
									</div>
									<div className="space-y-2">
										<Label>Descrizione Remediation</Label>
										<Textarea
											value={newRemediation.description}
											onChange={(e) =>
												setNewRemediation((p) => ({
													...p,
													description: e.target.value,
												}))
											}
											placeholder="Descrivi le azioni..."
											rows={3}
										/>
									</div>
									<div className="grid grid-cols-3 gap-4">
										<div className="space-y-2">
											<Label>Complessità</Label>
											<Select
												value={newRemediation.complexity}
												onValueChange={(v) =>
													setNewRemediation((p) => ({ ...p, complexity: v }))
												}
											>
												<SelectTrigger>
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="low">Bassa (€300/gg)</SelectItem>
													<SelectItem value="medium">
														Media (€500/gg)
													</SelectItem>
													<SelectItem value="high">Alta (€800/gg)</SelectItem>
												</SelectContent>
											</Select>
										</div>
										<div className="space-y-2">
											<Label>Giorni Stimati</Label>
											<Input
												type="number"
												value={newRemediation.estimatedDays}
												onChange={(e) =>
													setNewRemediation((p) => ({
														...p,
														estimatedDays: e.target.value,
													}))
												}
												placeholder={`Auto: ${calculateDays(newRemediation.complexity, newRemediation.category)}`}
											/>
										</div>
										<div className="space-y-2">
											<Label>Budget Stimato (€)</Label>
											<Input
												type="number"
												value={newRemediation.estimatedBudget}
												onChange={(e) =>
													setNewRemediation((p) => ({
														...p,
														estimatedBudget: e.target.value,
													}))
												}
												placeholder={`Auto: €${calculateBudget(Number(newRemediation.estimatedDays) || calculateDays(newRemediation.complexity, newRemediation.category), newRemediation.complexity).toLocaleString()}`}
											/>
										</div>
									</div>
									<div className="space-y-2">
										<Label>Team Assegnato</Label>
										<Select
											value={newRemediation.assignedTeam}
											onValueChange={(v) =>
												setNewRemediation((p) => ({ ...p, assignedTeam: v }))
											}
										>
											<SelectTrigger>
												<SelectValue placeholder="Seleziona team" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="IT Security">
													IT Security Team
												</SelectItem>
												<SelectItem value="Development">
													Development Team
												</SelectItem>
												<SelectItem value="DevSecOps">
													DevSecOps Team
												</SelectItem>
												<SelectItem value="Procurement">
													Procurement Team
												</SelectItem>
												<SelectItem value="Operations">
													Operations Team
												</SelectItem>
												<SelectItem value="Compliance">
													Compliance Team
												</SelectItem>
												<SelectItem value="HR">HR & Training</SelectItem>
											</SelectContent>
										</Select>
									</div>
									<div className="space-y-2">
										<Label>Data Inizio</Label>
										<Popover>
											<PopoverTrigger asChild>
												<Button
													variant="outline"
													className={cn(
														"w-full justify-start text-left font-normal",
														!newRemediation.startDate &&
															"text-muted-foreground",
													)}
												>
													<Calendar className="mr-2 h-4 w-4" />
													{newRemediation.startDate
														? format(new Date(newRemediation.startDate), "PPP")
														: "Seleziona data (default: oggi)"}
												</Button>
											</PopoverTrigger>
											<PopoverContent className="w-auto p-0" align="start">
												<CalendarComponent
													mode="single"
													selected={
														newRemediation.startDate
															? new Date(newRemediation.startDate)
															: undefined
													}
													onSelect={(date) =>
														setNewRemediation((p) => ({
															...p,
															startDate: date ? format(date, "yyyy-MM-dd") : "",
														}))
													}
												/>
											</PopoverContent>
										</Popover>
									</div>
									<Card className="bg-muted/50">
										<CardContent className="p-4">
											<h4 className="font-medium mb-3 flex items-center">
												<Euro className="w-4 h-4 mr-2" />
												Stima Automatica
											</h4>
											<div className="grid grid-cols-3 gap-4 text-sm">
												<div>
													<span className="text-muted-foreground">Giorni:</span>
													<p className="font-medium">
														{newRemediation.estimatedDays ||
															calculateDays(
																newRemediation.complexity,
																newRemediation.category,
															)}{" "}
														giorni
													</p>
												</div>
												<div>
													<span className="text-muted-foreground">Budget:</span>
													<p className="font-medium">
														€
														{(
															Number(newRemediation.estimatedBudget) ||
															calculateBudget(
																Number(newRemediation.estimatedDays) ||
																	calculateDays(
																		newRemediation.complexity,
																		newRemediation.category,
																	),
																newRemediation.complexity,
															)
														).toLocaleString()}
													</p>
												</div>
												<div>
													<span className="text-muted-foreground">
														Tariffa/gg:
													</span>
													<p className="font-medium">
														€
														{newRemediation.complexity === "low"
															? "300"
															: newRemediation.complexity === "high"
																? "800"
																: "500"}
													</p>
												</div>
											</div>
										</CardContent>
									</Card>
									<div className="flex justify-end space-x-2">
										<Button
											variant="outline"
											onClick={() => setIsCreateModalOpen(false)}
										>
											Annulla
										</Button>
										<Button
											onClick={handleCreateRemediation}
											className="bg-green-600 hover:bg-green-700"
										>
											Crea Remediation
										</Button>
									</div>
								</div>
							</DialogContent>
						</Dialog>

						{/* Edit Task Dialog */}
						<Dialog
							open={editingTask !== null}
							onOpenChange={(open) => {
								if (!open) {
									setEditingTask(null);
									setEditTaskData(null);
								}
							}}
						>
							<DialogContent className="max-w-2xl">
								<DialogHeader>
									<DialogTitle className="flex items-center">
										<Settings className="w-5 h-5 mr-2" />
										Modifica Attività
									</DialogTitle>
								</DialogHeader>
								{editTaskData && (
									<div className="space-y-4 py-4">
										<div className="space-y-2">
											<Label>Descrizione Attività</Label>
											<Textarea
												value={editTaskData.task}
												onChange={(e) =>
													setEditTaskData((p) => ({
														...p,
														task: e.target.value,
													}))
												}
												rows={3}
											/>
										</div>
										<div className="grid grid-cols-2 gap-4">
											<div className="space-y-2">
												<Label>Categoria</Label>
												<Select
													value={editTaskData.category}
													onValueChange={(v) =>
														setEditTaskData((p) => ({ ...p, category: v }))
													}
												>
													<SelectTrigger>
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="Gestione delle identità">
															Gestione delle identità
														</SelectItem>
														<SelectItem value="Sviluppo software">
															Sviluppo software
														</SelectItem>
														<SelectItem value="Gestione fornitori">
															Gestione fornitori
														</SelectItem>
														<SelectItem value="Business Continuity">
															Business Continuity
														</SelectItem>
														<SelectItem value="Incident Management">
															Incident Management
														</SelectItem>
														<SelectItem value="Network Security">
															Network Security
														</SelectItem>
														<SelectItem value="Crittografia">
															Crittografia
														</SelectItem>
														<SelectItem value="Manutenzione">
															Manutenzione
														</SelectItem>
														<SelectItem value="HR & Formazione">
															HR & Formazione
														</SelectItem>
														<SelectItem value="Certificazioni">
															Certificazioni
														</SelectItem>
														<SelectItem value="Governance">
															Governance
														</SelectItem>
													</SelectContent>
												</Select>
											</div>
											<div className="space-y-2">
												<Label>Priorità</Label>
												<Select
													value={editTaskData.priority}
													onValueChange={(v) =>
														setEditTaskData((p) => ({ ...p, priority: v }))
													}
												>
													<SelectTrigger>
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="Critica">Critica</SelectItem>
														<SelectItem value="Alta">Alta</SelectItem>
														<SelectItem value="Media">Media</SelectItem>
														<SelectItem value="Bassa">Bassa</SelectItem>
													</SelectContent>
												</Select>
											</div>
										</div>
										<div className="grid grid-cols-2 gap-4">
											<div className="space-y-2">
												<Label>Team Assegnato</Label>
												<Select
													value={editTaskData.assignee}
													onValueChange={(v) =>
														setEditTaskData((p) => ({ ...p, assignee: v }))
													}
												>
													<SelectTrigger>
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="IT Security Team">
															IT Security Team
														</SelectItem>
														<SelectItem value="Security Auditor">
															Security Auditor
														</SelectItem>
														<SelectItem value="DevSecOps Team">
															DevSecOps Team
														</SelectItem>
														<SelectItem value="HR & Security">
															HR & Security
														</SelectItem>
														<SelectItem value="Procurement Team">
															Procurement Team
														</SelectItem>
														<SelectItem value="Operations Team">
															Operations Team
														</SelectItem>
														<SelectItem value="Compliance Team">
															Compliance Team
														</SelectItem>
														<SelectItem value="HR & Training">
															HR & Training
														</SelectItem>
													</SelectContent>
												</Select>
											</div>
											<div className="space-y-2">
												<Label>Progresso (%)</Label>
												<Input
													type="number"
													min="0"
													max="100"
													value={editTaskData.progress}
													onChange={(e) =>
														setEditTaskData((p) => ({
															...p,
															progress: Number(e.target.value),
														}))
													}
												/>
											</div>
										</div>
										<div className="space-y-2">
											<Label>Budget Allocato (€)</Label>
											<Input
												type="number"
												min="0"
												step="100"
												value={editTaskData.budget || 0}
												onChange={(e) =>
													setEditTaskData((p) => ({
														...p,
														budget: Number(e.target.value),
													}))
												}
											/>
										</div>
										<div className="grid grid-cols-2 gap-4">
											<div className="space-y-2">
												<Label>Data Inizio</Label>
												<Popover>
													<PopoverTrigger asChild>
														<Button
															variant="outline"
															className={cn(
																"w-full justify-start text-left font-normal",
																!editTaskData.startDate &&
																	"text-muted-foreground",
															)}
														>
															<Calendar className="mr-2 h-4 w-4" />
															{editTaskData.startDate
																? format(
																		new Date(editTaskData.startDate),
																		"PPP",
																	)
																: "Seleziona data"}
														</Button>
													</PopoverTrigger>
													<PopoverContent className="w-auto p-0" align="start">
														<CalendarComponent
															mode="single"
															selected={
																editTaskData.startDate
																	? new Date(editTaskData.startDate)
																	: undefined
															}
															onSelect={(date) =>
																setEditTaskData((p) => ({
																	...p,
																	startDate: date
																		? format(date, "yyyy-MM-dd")
																		: "",
																}))
															}
														/>
													</PopoverContent>
												</Popover>
											</div>
											<div className="space-y-2">
												<Label>Data Fine</Label>
												<Popover>
													<PopoverTrigger asChild>
														<Button
															variant="outline"
															className={cn(
																"w-full justify-start text-left font-normal",
																!editTaskData.endDate &&
																	"text-muted-foreground",
															)}
														>
															<Calendar className="mr-2 h-4 w-4" />
															{editTaskData.endDate
																? format(new Date(editTaskData.endDate), "PPP")
																: "Seleziona data"}
														</Button>
													</PopoverTrigger>
													<PopoverContent className="w-auto p-0" align="start">
														<CalendarComponent
															mode="single"
															selected={
																editTaskData.endDate
																	? new Date(editTaskData.endDate)
																	: undefined
															}
															onSelect={(date) =>
																setEditTaskData((p) => ({
																	...p,
																	endDate: date
																		? format(date, "yyyy-MM-dd")
																		: "",
																}))
															}
														/>
													</PopoverContent>
												</Popover>
											</div>
										</div>
										<div className="flex justify-end space-x-2 pt-4">
											<Button
												variant="outline"
												onClick={() => {
													setEditingTask(null);
													setEditTaskData(null);
												}}
											>
												Annulla
											</Button>
											<Button
												onClick={handleSaveEditedTask}
												className="bg-primary"
											>
												Salva Modifiche
											</Button>
										</div>
									</div>
								)}
							</DialogContent>
						</Dialog>

						<Button variant="outline">
							<FileText className="w-4 h-4 mr-2" />
							Esporta Piano
						</Button>
						<Button className="bg-primary text-primary-foreground">
							<CalendarDays className="w-4 h-4 mr-2" />
							Pianifica Revisione
						</Button>
					</div>
				</div>

				{/* Executive Summary Metrics */}
				<div className="grid grid-cols-1 md:grid-cols-6 gap-4">
					<Card className="border-border">
						<CardContent className="p-4">
							<div className="flex items-center justify-between">
								<div>
									<p className="text-sm text-muted-foreground">Budget Totale</p>
									<p className="text-xl font-bold text-foreground">
										{actionableMetrics.totalBudget}
									</p>
								</div>
								<Target className="w-6 h-6 text-primary" />
							</div>
						</CardContent>
					</Card>
					<Card className="border-border">
						<CardContent className="p-4">
							<div className="flex items-center justify-between">
								<div>
									<p className="text-sm text-muted-foreground">Tempo Stimato</p>
									<p className="text-xl font-bold text-foreground">
										{actionableMetrics.estimatedCompletion}
									</p>
								</div>
								<Clock className="w-6 h-6 text-yellow-500" />
							</div>
						</CardContent>
					</Card>
					<Card className="border-border">
						<CardContent className="p-4">
							<div className="flex items-center justify-between">
								<div>
									<p className="text-sm text-muted-foreground">
										Riduzione Rischio
									</p>
									<p className="text-xl font-bold text-green-500">
										{actionableMetrics.riskReduction}
									</p>
								</div>
								<TrendingUp className="w-6 h-6 text-green-500" />
							</div>
						</CardContent>
					</Card>
					<Card className="border-border">
						<CardContent className="p-4">
							<div className="flex items-center justify-between">
								<div>
									<p className="text-sm text-muted-foreground">
										Miglioramento Compliance
									</p>
									<p className="text-xl font-bold text-blue-500">
										{actionableMetrics.complianceImprovement}
									</p>
								</div>
								<CheckCircle className="w-6 h-6 text-blue-500" />
							</div>
						</CardContent>
					</Card>
					<Card className="border-border">
						<CardContent className="p-4">
							<div className="flex items-center justify-between">
								<div>
									<p className="text-sm text-muted-foreground">Criticità</p>
									<p className="text-xl font-bold text-red-500">
										{actionableMetrics.criticalIssues}
									</p>
								</div>
								<AlertTriangle className="w-6 h-6 text-red-500" />
							</div>
						</CardContent>
					</Card>
					<Card className="border-border">
						<CardContent className="p-4">
							<div className="flex items-center justify-between">
								<div>
									<p className="text-sm text-muted-foreground">
										Azioni Prioritarie
									</p>
									<p className="text-xl font-bold text-orange-500">
										{actionableMetrics.highPriorityActions}
									</p>
								</div>
								<Wrench className="w-6 h-6 text-orange-500" />
							</div>
						</CardContent>
					</Card>
				</div>

				<Tabs defaultValue="gantt" className="w-full">
					<TabsList className="grid w-full grid-cols-2">
						<TabsTrigger value="gantt">GANTT Operativo</TabsTrigger>
						<TabsTrigger value="deleted" className="relative">
							Azioni Eliminate
							{deletedTasksList.length > 0 && (
								<Badge
									variant="destructive"
									className="ml-2 h-5 px-1.5 text-xs"
								>
									{deletedTasksList.length}
								</Badge>
							)}
						</TabsTrigger>
					</TabsList>
					<TabsContent value="gantt" className="space-y-6">
						{loading ? (
							<Card>
								<CardContent className="p-12 text-center">
									<p className="text-muted-foreground">Caricamento task...</p>
								</CardContent>
							</Card>
						) : (
							<GanttChart
								tasks={ganttData}
								ganttStartDate={GANTT_START}
								ganttEndDate={GANTT_END}
								onDateChange={handleDateChange}
								onEditTask={handleEditTask}
								onToggleVisibility={handleToggleVisibility}
								onDeleteTask={handleDeleteTask}
								onReorderTasks={handleReorderTasks}
								onProgressChange={handleProgressChange}
								canEdit={canEdit}
								canUpdateProgress={canUpdateProgress}
							/>
						)}
					</TabsContent>

					<TabsContent value="deleted" className="space-y-6">
						<Card className="border-border">
							<CardHeader>
								<CardTitle className="flex items-center">
									<Trash2 className="w-5 h-5 mr-2 text-destructive" />
									Azioni Eliminate - Storico Remediation
								</CardTitle>
							</CardHeader>
							<CardContent>
								{deletedTasksList.length === 0 ? (
									<div className="text-center py-12">
										<Trash2 className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
										<p className="text-muted-foreground">
											Nessuna azione eliminata
										</p>
										<p className="text-sm text-muted-foreground/70 mt-2">
											Le azioni eliminate appariranno qui e potranno essere
											ripristinate
										</p>
									</div>
								) : (
									<div className="space-y-3">
										{deletedTasksList.map((t) => (
											<div
												key={t.id}
												className="flex items-center justify-between p-4 bg-destructive/5 rounded-lg border border-destructive/20 hover:bg-destructive/10 transition-colors"
											>
												<div className="flex items-center space-x-4 flex-1">
													<div className="p-2 rounded-lg bg-destructive/10">
														<Trash2 className="w-5 h-5 text-destructive" />
													</div>
													<div className="flex-1">
														<h4 className="font-medium text-foreground line-through">
															{t.task}
														</h4>
														<div className="flex items-center space-x-3 mt-1">
															<span className="text-sm text-muted-foreground">
																Categoria: {t.category}
															</span>
															<span className="text-sm text-muted-foreground">
																•
															</span>
															<span className="text-sm text-muted-foreground">
																Team: {t.assignee}
															</span>
															<span className="text-sm text-muted-foreground">
																•
															</span>
															<Badge
																variant={
																	t.priority === "critical"
																		? "destructive"
																		: t.priority === "high"
																			? "default"
																			: "secondary"
																}
																className="opacity-60"
															>
																{PRIORITY_DB_TO_IT[t.priority] || t.priority}
															</Badge>
														</div>
														<div className="flex items-center space-x-3 mt-2 text-xs text-muted-foreground">
															<span>
																Date:{" "}
																{format(parseISO(t.start_date), "dd/MM/yyyy")} -{" "}
																{format(parseISO(t.end_date), "dd/MM/yyyy")}
															</span>
															<span>•</span>
															<span>
																Budget: €{(t.budget || 0).toLocaleString()}
															</span>
															<span>•</span>
															<span>Progress: {t.progress}%</span>
														</div>
													</div>
												</div>
												<Button
													onClick={() => handleRestoreTask(t.id)}
													variant="outline"
													size="sm"
													className="border-primary/30 hover:bg-primary hover:text-primary-foreground"
												>
													<CheckCircle className="w-4 h-4 mr-2" />
													Ripristina
												</Button>
											</div>
										))}
									</div>
								)}
							</CardContent>
						</Card>
					</TabsContent>
				</Tabs>
			</div>
		</DashboardLayout>
	);
};

export default Remediation;
