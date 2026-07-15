import React, { useState, useEffect, useCallback, useRef } from "react";
import { remediationTasksApi } from "@/lib/api";
import type {
	RemediationTask,
	StoreRemediationTaskRequest,
	UpdateRemediationTaskRequest,
} from "@/types/api";
import { useClientOrganization } from "@/hooks/useClientOrganization";
import { useRemediationCatalog } from "@/hooks/useRemediationCatalog";
import {
	RemediationTaskForm,
	type RemediationTaskFormData,
} from "@/components/remediation/RemediationTaskForm";
import { RemediationPlanTable } from "@/components/remediation/RemediationPlanTable";
import { exportRemediationPlanPdf } from "@/lib/report/exportRemediationPlanPdf";
import { useAuth } from "@/components/auth/AuthProvider";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { GanttChart, GanttTask } from "@/components/remediation/GanttChart";
import { format, addDays, differenceInDays, parseISO } from "date-fns";
import {
	AlertTriangle,
	Calendar,
	CheckCircle,
	Clock,
	FileText,
	TrendingUp,
	Target,
	Wrench,
	CalendarDays,
	Plus,
	Calculator,
	Trash2,
	Settings,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
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

/**
 * Task remediation salvato come "Categoria - Prodotto" (retrocompatibilità col
 * vecchio custom gantt). Il prodotto è tutto ciò che segue il prefisso categoria,
 * col separatore " - " oppure ": " (es. "…accessi: Zero Trust - HiZTNA").
 */
const splitProduct = (task: string, category: string): string => {
	if (category && task.startsWith(category)) {
		return task
			.slice(category.length)
			.replace(/^[\s:–—-]+/, "")
			.trim();
	}
	return "";
};
const composeTask = (category: string, product: string): string =>
	product.trim() ? `${category} - ${product.trim()}` : category;


const createGanttWindow = () => {
	const start = new Date();
	const end = new Date();
	start.setMonth(start.getMonth() - 1);
	end.setMonth(end.getMonth() + 30);
	return { start, end };
};

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

const PRIORITY_COLORS: Record<string, string> = {
	Critica: "#DC2626",
	Alta: "#EA580C",
	Media: "#EAB308",
	Bassa: "#22C55E",
};

const EMPTY_FORM: RemediationTaskFormData = {
	category: "",
	product: "",
	priority: "",
	description: "",
	assignee: "",
	complexity: "medium",
	estimatedDays: "",
	budget: "",
	startDate: "",
	endDate: "",
	progress: 0,
};

/* ─── Component ─── */
const Remediation: React.FC = () => {
	const {
		organizationId: orgId,
		groupId,
		selectedOrganization,
	} = useClientOrganization();
	const planRef = useRef<HTMLDivElement>(null);
	const [exportingPlan, setExportingPlan] = useState(false);
	const planCompanyName =
		(selectedOrganization as { legal_name?: string; name?: string } | null)
			?.legal_name ||
		(selectedOrganization as { legal_name?: string; name?: string } | null)
			?.name ||
		"Cliente";

	const handleExportPlan = useCallback(async () => {
		if (!planRef.current) return;
		setExportingPlan(true);
		try {
			await exportRemediationPlanPdf({
				companyName: planCompanyName,
				element: planRef.current,
			});
		} catch {
			toast({
				title: "Errore",
				description: "Impossibile esportare il piano.",
				variant: "destructive",
			});
		} finally {
			setExportingPlan(false);
		}
	}, [planCompanyName]);
	const { capabilities } = useAuth();
	const canEdit = capabilities?.["hicompliance.remediation_tasks.edit"] ?? true;
	const canUpdateProgress =
		capabilities?.["hicompliance.remediation_tasks.view"] ?? false;
	const [ganttWindow] = useState(createGanttWindow);

	const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
	const [tasks, setTasks] = useState<DbTask[]>([]);
	const [loading, setLoading] = useState(true);
	const [editingTask, setEditingTask] = useState<string | null>(null);
	const [editTaskData, setEditTaskData] =
		useState<RemediationTaskFormData | null>(null);
	const { categories: catalogCategories, productsByCategory } =
		useRemediationCatalog();
	const [newRemediation, setNewRemediation] =
		useState<RemediationTaskFormData>(EMPTY_FORM);

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
		const totalDays = differenceInDays(ganttWindow.end, ganttWindow.start);
		const daysFromStart = differenceInDays(
			parseISO(t.start_date),
			ganttWindow.start,
		);
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
				if (
					typeof err === "object" &&
					err !== null &&
					"status" in err &&
					(err as { status?: number }).status === 404
				) {
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
		const days = Math.max(
			1,
			differenceInDays(parseISO(action.endDate), parseISO(action.startDate)),
		);
		setEditingTask(action.id);
		setEditTaskData({
			category: action.category,
			product: splitProduct(action.task, action.category),
			// action.priority è già "Critica"/"Alta"/… (mappato in ganttData)
			priority: action.priority,
			description: action.task,
			assignee: action.assignee || "",
			complexity: "medium",
			estimatedDays: String(days),
			budget: String(action.budget || 0),
			startDate: action.startDate,
			endDate: action.endDate,
			progress: action.progress,
		});
	}, []);

	const handleSaveEditedTask = useCallback(async () => {
		if (!editingTask || !editTaskData) return;
		try {
			await updateTask(editingTask, {
				task: editTaskData.description,
				category: editTaskData.category,
				assignee: editTaskData.assignee,
				priority: PRIORITY_IT_TO_DB[editTaskData.priority] || "medium",
				progress: Number(editTaskData.progress) || 0,
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
			Number(newRemediation.budget) ||
			calculateBudget(estimatedDays, newRemediation.complexity);
		const startDate =
			newRemediation.startDate || format(new Date(), "yyyy-MM-dd");
		// Data fine esplicita se indicata, altrimenti inizio + giorni stimati.
		const endDate =
			newRemediation.endDate ||
			format(addDays(new Date(startDate), estimatedDays), "yyyy-MM-dd");

		const payload: StoreRemediationTaskRequest = {
			task: newRemediation.description,
			category:
				CATEGORY_KEY_TO_LABEL[newRemediation.category] ||
				newRemediation.category,
			start_date: startDate,
			end_date: endDate,
			priority: (PRIORITY_IT_TO_DB[newRemediation.priority] ||
				"medium") as StoreRemediationTaskRequest["priority"],
			color: PRIORITY_COLORS[newRemediation.priority] || "#3b82f6",
			progress: Number(newRemediation.progress) || 0,
			assignee: newRemediation.assignee,
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
			setNewRemediation(EMPTY_FORM);
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

	const criticalTasks = activeTasks.filter((t) => t.priority === "critical");
	const highPriorityTasks = activeTasks.filter((t) => t.priority === "high");
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
								<RemediationTaskForm
									value={newRemediation}
									onChange={(fn) => setNewRemediation(fn)}
									categories={catalogCategories}
									productsByCategory={productsByCategory}
									calculateDays={calculateDays}
									calculateBudget={calculateBudget}
								/>
								<div className="flex justify-end space-x-2 pt-2">
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
									<>
										<RemediationTaskForm
											value={editTaskData}
											onChange={(fn) =>
												setEditTaskData((prev) => (prev ? fn(prev) : prev))
											}
											categories={catalogCategories}
											productsByCategory={productsByCategory}
											calculateDays={calculateDays}
											calculateBudget={calculateBudget}
										/>
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
											<Button onClick={handleSaveEditedTask} className="bg-primary">
												Salva Modifiche
											</Button>
										</div>
									</>
								)}
							</DialogContent>
						</Dialog>

						<Button
							variant="outline"
							onClick={handleExportPlan}
							disabled={exportingPlan}
						>
							<FileText className="w-4 h-4 mr-2" />
							{exportingPlan ? "Esportazione…" : "Esporta Piano"}
						</Button>
						<Button className="bg-primary text-primary-foreground">
							<CalendarDays className="w-4 h-4 mr-2" />
							Pianifica Revisione
						</Button>
					</div>
				</div>

				{/* Sorgente offscreen per l'export PDF del Piano di Remediation */}
				<div
					style={{
						position: "fixed",
						left: -10000,
						top: 0,
						pointerEvents: "none",
					}}
					aria-hidden
				>
					<RemediationPlanTable ref={planRef} tasks={activeTasks} />
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
								ganttStartDate={ganttWindow.start}
								ganttEndDate={ganttWindow.end}
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
