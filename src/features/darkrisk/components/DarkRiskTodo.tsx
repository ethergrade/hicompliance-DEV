import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { darkRiskGateway } from "../api/darkRiskGateway";
import { EVIDENCE_PARAM } from "./DarkRiskEvidenceSheet";

const SEVERITY_LABEL: Record<string, string> = { critical: "Critica", high: "Alta" };

/**
 * «Da fare»: le evidenze critiche o alte senza presa visione, al massimo tre,
 * ognuna con «Apri evidenza». Un errore resta un errore, mai «nessuna».
 */
export function DarkRiskTodo({
	companyId,
	groupId,
	scope = "standard",
	onShowAll,
}: {
	companyId: string;
	groupId: string | null | undefined;
	scope?: "standard" | "extended";
	onShowAll: () => void;
}) {
	const [params, setParams] = useSearchParams();
	const query = useQuery({
		queryKey: ["darkrisk-todo", companyId, groupId, scope],
		queryFn: () =>
			darkRiskGateway.getFindings(companyId, groupId, {
				"severity[]": "critical,high",
				ack: "exclude",
				per_page: 3,
				...(scope === "extended" ? { scope } : {}),
			}),
		staleTime: 60_000,
	});

	const open = (id: string) => {
		const next = new URLSearchParams(params);
		next.set(EVIDENCE_PARAM, id);
		setParams(next);
	};

	return (
		<section aria-labelledby="darkrisk-todo-title" className="space-y-2">
			<div className="flex items-center justify-between gap-2">
				<h2 id="darkrisk-todo-title" className="text-lg font-semibold">
					Da fare
				</h2>
				<Button variant="link" size="sm" className="h-auto p-0" onClick={onShowAll}>
					Tutte le evidenze
				</Button>
			</div>
			{query.isLoading ? (
				<p className="flex items-center gap-2 text-sm text-muted-foreground">
					<Loader2 className="h-4 w-4 animate-spin" /> Caricamento…
				</p>
			) : query.isError ? (
				<div className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/40 p-3 text-sm" role="alert">
					<span>Non è stato possibile caricare le evidenze da gestire: il dato non è disponibile.</span>
					<Button size="sm" variant="outline" onClick={() => void query.refetch()}>
						Riprova
					</Button>
				</div>
			) : (query.data?.rows.length ?? 0) === 0 ? (
				<p className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
					Nessuna evidenza critica o alta in attesa di presa visione nei dati disponibili.
				</p>
			) : (
				<ul className="divide-y divide-border rounded-lg border border-border">
					{query.data!.rows.map((f) => (
						<li key={f.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between">
							<div className="min-w-0">
								<div className="flex flex-wrap items-center gap-2">
									<span className="text-sm font-medium">{f.title}</span>
									<Badge variant="outline">{SEVERITY_LABEL[f.severity] ?? f.severity}</Badge>
								</div>
								<p className="text-xs text-muted-foreground">
									{f.asset ? `Cita ${f.asset}` : "Asset da attribuire"} · {f.assignee ?? "Da assegnare"}
								</p>
							</div>
							<Button size="sm" variant="outline" className="shrink-0 self-start" onClick={() => open(f.id)} aria-label={`Apri evidenza: ${f.title}`}>
								Apri evidenza
							</Button>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
