import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Command,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";

interface ProductComboboxProps {
	value: string;
	onChange: (value: string) => void;
	options: string[];
	placeholder?: string;
	disabled?: boolean;
}

/**
 * Dropdown editabile: mostra subito la lista dei prodotti (selezione visibile)
 * e consente anche di scrivere a mano un valore libero ("Usa «...»").
 * Il filtro è manuale (shouldFilter=false) così la lista riflette sempre le
 * `options` correnti quando cambia la categoria.
 */
export function ProductCombobox({
	value,
	onChange,
	options,
	placeholder = "Seleziona o scrivi un prodotto…",
	disabled,
}: ProductComboboxProps) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");

	const commit = (v: string) => {
		onChange(v);
		setSearch("");
		setOpen(false);
	};

	const trimmed = search.trim();
	const q = trimmed.toLowerCase();
	const filtered = q
		? options.filter((o) => o.toLowerCase().includes(q))
		: options;
	const hasExact = options.some((o) => o.toLowerCase() === q);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					role="combobox"
					aria-expanded={open}
					disabled={disabled}
					className="w-full justify-between font-normal"
				>
					<span className={cn("truncate", !value && "text-muted-foreground")}>
						{value || placeholder}
					</span>
					<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				className="p-0"
				align="start"
				style={{ width: "var(--radix-popover-trigger-width)" }}
			>
				<Command shouldFilter={false}>
					<CommandInput
						placeholder="Cerca o scrivi…"
						value={search}
						onValueChange={setSearch}
					/>
					<CommandList>
						{trimmed && !hasExact && (
							<CommandItem value={`use:${trimmed}`} onSelect={() => commit(trimmed)}>
								Usa «{trimmed}»
							</CommandItem>
						)}
						{filtered.length === 0 && !trimmed && (
							<div className="px-2 py-3 text-center text-sm text-muted-foreground">
								Nessun prodotto per questa categoria. Scrivi per aggiungerne uno.
							</div>
						)}
						{filtered.length > 0 && (
							<CommandGroup>
								{filtered.map((opt) => (
									<CommandItem key={opt} value={opt} onSelect={() => commit(opt)}>
										<Check
											className={cn(
												"mr-2 h-4 w-4",
												value === opt ? "opacity-100" : "opacity-0",
											)}
										/>
										{opt}
									</CommandItem>
								))}
							</CommandGroup>
						)}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
