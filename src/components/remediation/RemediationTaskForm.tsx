import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { ProductCombobox } from "@/components/remediation/ProductCombobox";
import { Calendar, Euro } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

/**
 * Forma canonica dei dati della modale remediation, condivisa tra creazione e
 * modifica. Priorità in italiano capitalizzato ("Critica"…), team come label
 * completa ("IT Security Team"…): il mapping verso i valori DB avviene nei
 * handler della pagina.
 */
export interface RemediationTaskFormData {
	category: string;
	product: string;
	priority: string;
	description: string;
	assignee: string;
	complexity: string;
	estimatedDays: string;
	budget: string;
	startDate: string;
	endDate: string;
	progress: number;
}

/** Opzioni condivise: un'unica fonte di verità per entrambe le modali. */
const PRIORITY_OPTIONS = ["Critica", "Alta", "Media", "Bassa"] as const;
const TEAM_OPTIONS = [
	"IT Security Team",
	"Development Team",
	"DevSecOps Team",
	"Security Auditor",
	"Procurement Team",
	"Operations Team",
	"Compliance Team",
	"HR & Training",
] as const;

const composeTask = (category: string, product: string): string =>
	product.trim() ? `${category} - ${product.trim()}` : category;

interface Props {
	value: RemediationTaskFormData;
	onChange: (updater: (prev: RemediationTaskFormData) => RemediationTaskFormData) => void;
	categories: string[];
	productsByCategory: Record<string, string[]>;
	calculateDays: (complexity: string, category: string) => number;
	calculateBudget: (days: number, complexity: string) => number;
}

export const RemediationTaskForm: React.FC<Props> = ({
	value,
	onChange,
	categories,
	productsByCategory,
	calculateDays,
	calculateBudget,
}) => {
	// Tolleranza: se il valore corrente non è tra le opzioni (task legacy con
	// categoria/team fuori catalogo), lo aggiungiamo in testa così resta visibile.
	const categoryOptions =
		value.category && !categories.includes(value.category)
			? [value.category, ...categories]
			: categories;
	const teamOptions =
		value.assignee && !TEAM_OPTIONS.includes(value.assignee as (typeof TEAM_OPTIONS)[number])
			? [value.assignee, ...TEAM_OPTIONS]
			: [...TEAM_OPTIONS];

	const autoDays =
		Number(value.estimatedDays) || calculateDays(value.complexity, value.category);
	const autoBudget =
		Number(value.budget) || calculateBudget(autoDays, value.complexity);
	const rate =
		value.complexity === "low" ? "300" : value.complexity === "high" ? "800" : "500";

	return (
		<div className="space-y-4 py-4">
			<div className="grid grid-cols-2 gap-4">
				<div className="space-y-2">
					<Label>Categoria Assessment</Label>
					<Select
						value={value.category}
						onValueChange={(v) =>
							onChange((p) => ({
								...p,
								category: v,
								product: "",
								description: composeTask(v, ""),
							}))
						}
					>
						<SelectTrigger>
							<SelectValue placeholder="Seleziona categoria" />
						</SelectTrigger>
						<SelectContent>
							{categoryOptions.map((c) => (
								<SelectItem key={c} value={c}>
									{c}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="space-y-2">
					<Label>Prodotto</Label>
					<ProductCombobox
						value={value.product}
						options={productsByCategory[value.category] ?? []}
						onChange={(v) =>
							onChange((p) => ({
								...p,
								product: v,
								description: composeTask(p.category, v),
							}))
						}
					/>
				</div>
			</div>

			<div className="space-y-2">
				<Label>Priorità</Label>
				<Select
					value={value.priority}
					onValueChange={(v) => onChange((p) => ({ ...p, priority: v }))}
				>
					<SelectTrigger>
						<SelectValue placeholder="Seleziona priorità" />
					</SelectTrigger>
					<SelectContent>
						{PRIORITY_OPTIONS.map((pr) => (
							<SelectItem key={pr} value={pr}>
								{pr}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<div className="space-y-2">
				<Label>Descrizione</Label>
				<Textarea
					value={value.description}
					onChange={(e) =>
						onChange((p) => ({ ...p, description: e.target.value }))
					}
					placeholder="Descrivi le azioni..."
					rows={3}
				/>
			</div>

			<div className="grid grid-cols-3 gap-4">
				<div className="space-y-2">
					<Label>Complessità</Label>
					<Select
						value={value.complexity}
						onValueChange={(v) => onChange((p) => ({ ...p, complexity: v }))}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="low">Bassa (€300/gg)</SelectItem>
							<SelectItem value="medium">Media (€500/gg)</SelectItem>
							<SelectItem value="high">Alta (€800/gg)</SelectItem>
						</SelectContent>
					</Select>
				</div>
				<div className="space-y-2">
					<Label>Giorni Stimati</Label>
					<Input
						type="number"
						value={value.estimatedDays}
						onChange={(e) =>
							onChange((p) => ({ ...p, estimatedDays: e.target.value }))
						}
						placeholder={`Auto: ${calculateDays(value.complexity, value.category)}`}
					/>
				</div>
				<div className="space-y-2">
					<Label>Budget (€)</Label>
					<Input
						type="number"
						min="0"
						step="100"
						value={value.budget}
						onChange={(e) =>
							onChange((p) => ({ ...p, budget: e.target.value }))
						}
						placeholder={`Auto: €${autoBudget.toLocaleString()}`}
					/>
				</div>
			</div>

			<div className="space-y-2">
				<Label>Team Assegnato</Label>
				<Select
					value={value.assignee}
					onValueChange={(v) => onChange((p) => ({ ...p, assignee: v }))}
				>
					<SelectTrigger>
						<SelectValue placeholder="Seleziona team" />
					</SelectTrigger>
					<SelectContent>
						{teamOptions.map((t) => (
							<SelectItem key={t} value={t}>
								{t}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
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
									!value.startDate && "text-muted-foreground",
								)}
							>
								<Calendar className="mr-2 h-4 w-4" />
								{value.startDate
									? format(new Date(value.startDate), "PPP")
									: "Seleziona data (default: oggi)"}
							</Button>
						</PopoverTrigger>
						<PopoverContent className="w-auto p-0" align="start">
							<CalendarComponent
								mode="single"
								selected={
									value.startDate ? new Date(value.startDate) : undefined
								}
								onSelect={(date) =>
									onChange((p) => ({
										...p,
										startDate: date ? format(date, "yyyy-MM-dd") : "",
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
									!value.endDate && "text-muted-foreground",
								)}
							>
								<Calendar className="mr-2 h-4 w-4" />
								{value.endDate
									? format(new Date(value.endDate), "PPP")
									: "Auto (inizio + giorni)"}
							</Button>
						</PopoverTrigger>
						<PopoverContent className="w-auto p-0" align="start">
							<CalendarComponent
								mode="single"
								selected={value.endDate ? new Date(value.endDate) : undefined}
								onSelect={(date) =>
									onChange((p) => ({
										...p,
										endDate: date ? format(date, "yyyy-MM-dd") : "",
									}))
								}
							/>
						</PopoverContent>
					</Popover>
				</div>
			</div>

			<div className="space-y-2">
				<Label>Progresso (%)</Label>
				<Input
					type="number"
					min="0"
					max="100"
					value={value.progress}
					onChange={(e) =>
						onChange((p) => ({ ...p, progress: Number(e.target.value) }))
					}
				/>
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
							<p className="font-medium">{autoDays} giorni</p>
						</div>
						<div>
							<span className="text-muted-foreground">Budget:</span>
							<p className="font-medium">€{autoBudget.toLocaleString()}</p>
						</div>
						<div>
							<span className="text-muted-foreground">Tariffa/gg:</span>
							<p className="font-medium">€{rate}</p>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
};
