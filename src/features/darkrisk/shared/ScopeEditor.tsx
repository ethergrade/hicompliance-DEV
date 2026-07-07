import { useEffect, useState } from "react";
import { Globe2, Plus, Save, Server, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	DARKRISK_SCOPE_LIMIT,
	DARKRISK_SCOPE_LIMIT_SUPERADMIN,
	type DarkRiskScope,
	type DarkRiskScopeTarget,
} from "../domain/contracts";
import { normalizeScopeTargets, normalizeScopeValue } from "../domain/scope";
import { useUserRoles } from "@/hooks/useUserRoles";

interface ScopeEditorProps {
	scope: DarkRiskScope;
	canManage: boolean;
	isLoading?: boolean;
	isSaving?: boolean;
	onSave: (scope: DarkRiskScope) => Promise<unknown>;
}

export const ScopeEditor = ({ scope, canManage, isLoading, isSaving, onSave }: ScopeEditorProps) => {
	const [targets, setTargets] = useState<DarkRiskScopeTarget[]>(scope.targets);
	const [candidate, setCandidate] = useState("");
	const { isSuperAdmin } = useUserRoles();
	const limit = isSuperAdmin
		? DARKRISK_SCOPE_LIMIT_SUPERADMIN
		: DARKRISK_SCOPE_LIMIT;

	useEffect(() => setTargets(scope.targets), [scope.targets]);

	const addTarget = () => {
		try {
			if (targets.length >= limit) {
				throw new Error(`Hai raggiunto il limite di ${limit} target`);
			}
			const normalized = normalizeScopeValue(candidate);
			if (targets.some((target) => target.type === normalized.type && target.value === normalized.value)) {
				throw new Error("Target già presente nello scope");
			}
			setTargets((current) => [
				...current,
				{ id: `${normalized.type}:${normalized.value}`, ...normalized, enabled: true },
			]);
			setCandidate("");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Target non valido");
		}
	};

	const save = async () => {
		try {
			await onSave({ targets: normalizeScopeTargets(targets.map((target) => target.value), limit) });
			toast.success("Scope DarkRisk360 aggiornato");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Impossibile aggiornare lo scope");
		}
	};

	return (
		<Card className="border-cyan-500/15 bg-card/80">
			<CardHeader className="pb-3">
				<div className="flex items-center justify-between gap-3">
					<CardTitle className="text-base">Scope esterno condiviso</CardTitle>
					<Badge variant="outline">{targets.length}/{limit} target</Badge>
				</div>
				<p className="text-xs text-muted-foreground">
					Domini senza @ e IPv4 pubblici. Lo stesso scope alimenta SurfaceScan360 e i moduli DarkRisk attivi.
				</p>
			</CardHeader>
			<CardContent className="space-y-3">
				{isLoading ? <p className="text-sm text-muted-foreground">Caricamento scope…</p> : null}
				{targets.map((target) => (
					<div key={`${target.type}:${target.value}`} className="flex items-center gap-3 rounded-md border border-border/70 bg-background/45 px-3 py-2">
						{target.type === "domain" ? <Globe2 className="h-4 w-4 text-cyan-400" /> : <Server className="h-4 w-4 text-violet-400" />}
						<span className="min-w-0 flex-1 truncate font-mono text-sm">{target.value}</span>
						<Badge variant="secondary" className="uppercase">{target.type}</Badge>
						{canManage ? (
							<Button type="button" variant="ghost" size="icon" aria-label={`Rimuovi ${target.value}`} onClick={() => setTargets((current) => current.filter((item) => item.value !== target.value))}>
								<Trash2 className="h-4 w-4" />
							</Button>
						) : null}
					</div>
				))}
				{targets.length === 0 && !isLoading ? <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">Nessun target configurato.</p> : null}
				{canManage ? (
					<div className="flex flex-col gap-2 sm:flex-row">
						<Input
							value={candidate}
							onChange={(event) => setCandidate(event.target.value)}
							onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addTarget(); } }}
							placeholder="azienda.it oppure 203.40.9.1"
							autoComplete="off"
						/>
						<Button type="button" variant="outline" onClick={addTarget} disabled={!candidate.trim() || targets.length >= limit}>
							<Plus className="mr-2 h-4 w-4" /> Aggiungi
						</Button>
						<Button type="button" onClick={save} disabled={isSaving}>
							<Save className="mr-2 h-4 w-4" /> {isSaving ? "Salvataggio…" : "Salva scope"}
						</Button>
					</div>
				) : null}
			</CardContent>
		</Card>
	);
};
