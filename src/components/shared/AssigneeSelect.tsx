import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getAssignableUsers } from "@/lib/api/assignable-users";

const NONE = "__none__";

/**
 * Assegnatario scelto tra gli utenti dell'azienda. Se l'assegnatario attuale
 * non è più tra gli utenti attivi, resta visibile con il suo nome.
 */
export function AssigneeSelect({
	id,
	companyId,
	groupId,
	value,
	currentName,
	onChange,
}: {
	id: string;
	companyId: string;
	groupId: string | null | undefined;
	value: string | null;
	currentName?: string | null;
	onChange: (userId: string | null) => void;
}) {
	const query = useQuery({
		queryKey: ["assignable-users", companyId, groupId],
		queryFn: () => getAssignableUsers(companyId, groupId),
		staleTime: 5 * 60_000,
	});
	const users = query.data ?? [];
	const missing = value && !users.some((u) => u.id === value);

	return (
		<div className="space-y-1">
		<Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)} disabled={query.isLoading}>
			<SelectTrigger id={id}>
				<SelectValue placeholder={query.isLoading ? "Caricamento…" : "Da assegnare"} />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value={NONE}>Da assegnare</SelectItem>
				{missing && <SelectItem value={value}>{currentName ?? "Utente non più attivo"}</SelectItem>}
				{users.map((u) => (
					<SelectItem key={u.id} value={u.id}>
						{u.name}
						{u.email ? <span className="ml-1 text-muted-foreground">· {u.email}</span> : null}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
		{query.isError && <p className="text-xs text-destructive">Elenco utenti non disponibile.</p>}
		{!query.isLoading && !query.isError && users.length === 0 && (
			<p className="text-xs text-muted-foreground">Nessun utente collegato a questa azienda.</p>
		)}
		</div>
	);
}
