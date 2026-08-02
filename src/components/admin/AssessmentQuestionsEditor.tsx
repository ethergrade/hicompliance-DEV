import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Pencil, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { assessmentV2Api } from "@/lib/api/assessment-v2";
import type { AssessmentQuestion, UpdateAssessmentQuestionRequest } from "@/types/api";

/** Campi modificabili. Struttura, ordinamento e categoria restano immutabili. */
interface EditableFields {
	question_text: string;
	description: string;
	priority: string;
	gantt_priority: string;
	deadline: string;
	solution_1: string;
	solution_2: string;
	solution_3: string;
}

const toForm = (q: AssessmentQuestion): EditableFields => ({
	question_text: q.question_text ?? "",
	description: q.description ?? "",
	priority: q.priority ?? "",
	gantt_priority: q.gantt_priority != null ? String(q.gantt_priority) : "",
	deadline: q.deadline ?? "",
	solution_1: q.solution_1 ?? "",
	solution_2: q.solution_2 ?? "",
	solution_3: q.solution_3 ?? "",
});

/** Invia solo i campi effettivamente cambiati: il backend traccia ogni modifica. */
const toPayload = (
	form: EditableFields,
	original: AssessmentQuestion,
): UpdateAssessmentQuestionRequest => {
	const initial = toForm(original);
	const payload: UpdateAssessmentQuestionRequest = {};

	if (form.question_text !== initial.question_text) payload.question_text = form.question_text.trim();
	if (form.description !== initial.description) payload.description = form.description.trim() || null;
	if (form.priority !== initial.priority) {
		payload.priority = (form.priority || null) as UpdateAssessmentQuestionRequest["priority"];
	}
	if (form.gantt_priority !== initial.gantt_priority) {
		payload.gantt_priority = form.gantt_priority === "" ? null : Number(form.gantt_priority);
	}
	if (form.deadline !== initial.deadline) payload.deadline = form.deadline.trim() || null;
	if (form.solution_1 !== initial.solution_1) payload.solution_1 = form.solution_1.trim() || null;
	if (form.solution_2 !== initial.solution_2) payload.solution_2 = form.solution_2.trim() || null;
	if (form.solution_3 !== initial.solution_3) payload.solution_3 = form.solution_3.trim() || null;

	return payload;
};

export function AssessmentQuestionsEditor() {
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const [editing, setEditing] = useState<AssessmentQuestion | null>(null);
	const [form, setForm] = useState<EditableFields | null>(null);

	const questionsQuery = useQuery({
		queryKey: ["assessment-catalog-questions"],
		queryFn: () => assessmentV2Api.questions(),
		staleTime: 60_000,
	});

	const save = useMutation({
		mutationFn: async () => {
			if (!editing || !form) return;
			const payload = toPayload(form, editing);
			if (Object.keys(payload).length === 0) return;
			return assessmentV2Api.updateQuestion(editing.id, payload);
		},
		onSuccess: () => {
			toast.success("Domanda aggiornata");
			// Il catalogo alimenta anche la pagina Assessment e i report.
			void queryClient.invalidateQueries({ queryKey: ["assessment-catalog-questions"] });
			setEditing(null);
			setForm(null);
		},
		onError: (error: unknown) => {
			const status = (error as { status?: number })?.status;
			toast.error(
				status === 403
					? "Solo un super-admin può modificare il catalogo."
					: "Impossibile salvare la modifica.",
			);
		},
	});

	const byCategory = useMemo(() => {
		const term = search.trim().toLowerCase();
		const filtered = (questionsQuery.data ?? []).filter(
			(q) =>
				!term ||
				q.question_text.toLowerCase().includes(term) ||
				(q.category_name ?? "").toLowerCase().includes(term),
		);

		const groups = new Map<string, AssessmentQuestion[]>();
		for (const q of filtered) {
			const key = q.category_name ?? "Senza categoria";
			groups.set(key, [...(groups.get(key) ?? []), q]);
		}
		for (const list of groups.values()) {
			list.sort((a, b) => a.order_index - b.order_index);
		}
		return [...groups.entries()];
	}, [questionsQuery.data, search]);

	const openEditor = (question: AssessmentQuestion) => {
		setEditing(question);
		setForm(toForm(question));
	};

	const setField = (field: keyof EditableFields, value: string) =>
		setForm((prev) => (prev ? { ...prev, [field]: value } : prev));

	if (questionsQuery.isLoading) {
		return (
			<div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
				<Loader2 className="h-4 w-4 animate-spin" />
				Caricamento del catalogo…
			</div>
		);
	}

	if (questionsQuery.isError) {
		return (
			<Card>
				<CardContent className="p-6 text-sm text-muted-foreground">
					Impossibile caricare il catalogo delle domande.
				</CardContent>
			</Card>
		);
	}

	const total = questionsQuery.data?.length ?? 0;

	return (
		<div className="space-y-4">
			<div className="rounded-md border border-amber-500/25 bg-amber-500/5 p-3 text-sm text-amber-200">
				<strong>Il catalogo è condiviso da tutti i clienti.</strong> Le modifiche hanno
				effetto immediato sugli assessment in corso e sui punteggi. Le risposte già date
				non vengono toccate; ordinamento, dipendenze e categoria non sono modificabili da
				qui.
			</div>

			<div className="relative">
				<Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					value={search}
					onChange={(event) => setSearch(event.target.value)}
					placeholder={`Cerca fra ${total} domande, per testo o categoria…`}
					className="pl-9"
				/>
			</div>

			{byCategory.length === 0 && (
				<p className="p-4 text-sm text-muted-foreground">Nessuna domanda corrisponde alla ricerca.</p>
			)}

			{byCategory.map(([category, questions]) => (
				<Card key={category}>
					<CardHeader className="pb-3">
						<CardTitle className="flex items-center justify-between text-base">
							<span>{category}</span>
							<span className="text-xs font-normal text-muted-foreground">
								{questions.length} domande
							</span>
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-2 pt-0">
						{questions.map((question) => (
							<div
								key={question.id}
								className="flex items-start justify-between gap-4 rounded-md border border-border p-3"
							>
								<div className="min-w-0">
									<p className="text-sm">{question.question_text}</p>
									<div className="mt-1 flex flex-wrap items-center gap-2">
										<Badge variant="outline" className="text-[10px]">
											#{question.order_index}
										</Badge>
										{question.priority && (
											<Badge variant="outline" className="text-[10px]">
												{question.priority}
											</Badge>
										)}
										{question.gantt_priority != null && (
											<Badge variant="outline" className="text-[10px]">
												Gantt {question.gantt_priority}
											</Badge>
										)}
										{question.updated_at && (
											<span className="text-[10px] text-muted-foreground">
												modificata il{" "}
												{new Date(question.updated_at).toLocaleDateString("it-IT")}
											</span>
										)}
									</div>
								</div>
								<Button variant="outline" size="sm" onClick={() => openEditor(question)}>
									<Pencil className="mr-2 h-3.5 w-3.5" />
									Modifica
								</Button>
							</div>
						))}
					</CardContent>
				</Card>
			))}

			<Dialog
				open={editing !== null}
				onOpenChange={(open) => {
					if (!open) {
						setEditing(null);
						setForm(null);
					}
				}}
			>
				<DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
					<DialogHeader>
						<DialogTitle>Modifica domanda</DialogTitle>
						<DialogDescription>
							{editing?.category_name ?? "Senza categoria"} · posizione #{editing?.order_index}
						</DialogDescription>
					</DialogHeader>

					{form && (
						<div className="space-y-4">
							<div className="space-y-1.5">
								<Label htmlFor="question_text">Testo della domanda</Label>
								<Textarea
									id="question_text"
									value={form.question_text}
									onChange={(event) => setField("question_text", event.target.value)}
									rows={3}
								/>
							</div>

							<div className="space-y-1.5">
								<Label htmlFor="description">Descrizione</Label>
								<Textarea
									id="description"
									value={form.description}
									onChange={(event) => setField("description", event.target.value)}
									rows={2}
								/>
							</div>

							<div className="grid gap-4 sm:grid-cols-3">
								<div className="space-y-1.5">
									<Label>Priorità</Label>
									<Select
										value={form.priority || "—"}
										onValueChange={(value) => setField("priority", value === "—" ? "" : value)}
									>
										<SelectTrigger>
											<SelectValue placeholder="Non impostata" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="—">Non impostata</SelectItem>
											<SelectItem value="ALTA">ALTA</SelectItem>
											<SelectItem value="MEDIA">MEDIA</SelectItem>
											<SelectItem value="BASSA">BASSA</SelectItem>
										</SelectContent>
									</Select>
								</div>

								<div className="space-y-1.5">
									<Label htmlFor="gantt_priority">Priorità Gantt</Label>
									<Input
										id="gantt_priority"
										type="number"
										min={0}
										max={100}
										value={form.gantt_priority}
										onChange={(event) => setField("gantt_priority", event.target.value)}
									/>
									<p className="text-[11px] text-muted-foreground">
										È un ordine, non una severità: <strong>1 = pianificata per
										prima</strong>, valori più alti la spostano più avanti nel
										tempo. <strong>0 la esclude</strong> dal piano di remediation.
									</p>
								</div>

								<div className="space-y-1.5">
									<Label htmlFor="deadline">Scadenza</Label>
									<Input
										id="deadline"
										value={form.deadline}
										onChange={(event) => setField("deadline", event.target.value)}
										placeholder="Es. Sep-26"
									/>
								</div>
							</div>

							<div className="space-y-1.5">
								<Label>Soluzioni proposte</Label>
								<p className="text-[11px] text-muted-foreground">
									Alimentano la generazione del piano di remediation.
								</p>
								{(["solution_1", "solution_2", "solution_3"] as const).map((field, index) => (
									<Input
										key={field}
										value={form[field]}
										onChange={(event) => setField(field, event.target.value)}
										placeholder={`Soluzione ${index + 1}`}
									/>
								))}
							</div>
						</div>
					)}

					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setEditing(null);
								setForm(null);
							}}
						>
							Annulla
						</Button>
						<Button onClick={() => save.mutate()} disabled={save.isPending}>
							{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
							Salva
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
