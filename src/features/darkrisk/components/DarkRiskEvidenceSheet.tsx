import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AssigneeSelect } from "@/components/shared/AssigneeSelect";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCapabilities } from "@/hooks/useCapabilities";
import { darkRiskGateway } from "../api/darkRiskGateway";
import type { DarkRiskFinding, DarkRiskFindingEvent } from "../domain/contracts";

/** Parametro dell'URL che apre la scheda (link da notifica, report o priorità). */
export const EVIDENCE_PARAM = "evidenza";

const SEVERITY_LABEL: Record<string, string> = {
	critical: "Critica",
	high: "Alta",
	medium: "Media",
	low: "Bassa",
	info: "Informativa",
};

const ACTION_LABEL: Record<string, string> = {
	da_fare: "Da fare",
	in_corso: "In corso",
	da_verificare: "Da verificare",
};

const EVENT_LABEL: Record<string, string> = {
	darkrisk_finding_acknowledged: "Presa visione",
	darkrisk_finding_acknowledgement_revoked: "Presa visione revocata",
	darkrisk_finding_status_changed: "Cambio di stato",
	darkrisk_finding_action_updated: "Assegnatario o verifica aggiornati",
};

const fmtDay = (value: string | null): string | null =>
	value ? new Date(value).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }) : null;

/** Prossimo passo per tipo di evidenza, senza promettere nulla che il dato non dice. */
const nextStep = (f: DarkRiskFinding): string => {
	if (!f.asset) return "Verificare la pertinenza: l'evidenza cita il perimetro ma non è ancora attribuita a un asset. Chiudere con una decisione motivata.";
	if (f.findingType.includes("identity") || f.findingType.includes("credential"))
		return "Il referente delle identità valuta l'esposizione e documenta le misure applicate (cambio credenziali, MFA, verifica degli accessi).";
	return "Valutare l'esposizione sull'asset indicato, decidere l'intervento e registrarne l'esito.";
};

const Row = ({ label, value }: { label: string; value: ReactNode }) => (
	<div className="grid grid-cols-[150px_1fr] gap-3 py-1.5 text-sm">
		<dt className="text-muted-foreground">{label}</dt>
		<dd className="min-w-0 break-words">{value}</dd>
	</div>
);

/**
 * Scheda di un'evidenza DarkRisk360: perché riguarda il cliente, date della
 * fonte e delle nostre osservazioni, prossimo passo e chi lo fa. Lo storico
 * delle decisioni (presa visione, verifica) è separato dalle osservazioni.
 */
export function DarkRiskEvidenceSheet({
	companyId,
	groupId,
	scope = "standard",
}: {
	companyId: string;
	groupId: string | null | undefined;
	scope?: "standard" | "extended";
}) {
	const [params, setParams] = useSearchParams();
	const id = params.get(EVIDENCE_PARAM);
	const { hasCapability } = useCapabilities();
	const canEdit = hasCapability("darkrisk.findings.edit");

	const [finding, setFinding] = useState<DarkRiskFinding | null>(null);
	const [events, setEvents] = useState<DarkRiskFindingEvent[]>([]);
	const [state, setState] = useState<"idle" | "loading" | "missing" | "error">("idle");
	const [assigneeUserId, setAssigneeUserId] = useState<string | null>(null);
	const [actionStatus, setActionStatus] = useState("");
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		setFinding(null);
		setEvents([]);
		if (!id) {
			setState("idle");
			return;
		}
		let cancelled = false;
		setState("loading");
		Promise.all([
			darkRiskGateway.getFinding(companyId, groupId, id, scope),
			darkRiskGateway.getFindingHistory(companyId, groupId, id).catch(() => []),
		])
			.then(([f, history]) => {
				if (cancelled) return;
				setFinding(f);
				setEvents(history);
				setAssigneeUserId(f.assigneeUserId);
				setActionStatus(f.actionStatus ?? "");
				setState("idle");
			})
			.catch((error: { status?: number }) => {
				if (!cancelled) setState(error?.status === 404 ? "missing" : "error");
			});
		return () => {
			cancelled = true;
		};
	}, [id, companyId, groupId, scope]);

	const close = () => {
		const next = new URLSearchParams(params);
		next.delete(EVIDENCE_PARAM);
		setParams(next);
	};

	const save = async () => {
		if (!id) return;
		setSaving(true);
		try {
			const updated = await darkRiskGateway.updateFindingAction(companyId, groupId, id, {
				assignee_user_id: assigneeUserId,
				action_status: actionStatus || null,
			});
			setFinding(updated);
			setEvents(await darkRiskGateway.getFindingHistory(companyId, groupId, id).catch(() => events));
			toast.success("Evidenza aggiornata");
		} catch {
			toast.error("Non è stato possibile salvare");
		} finally {
			setSaving(false);
		}
	};

	return (
		<Sheet open={Boolean(id)} onOpenChange={(open) => !open && close()}>
			<SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
				{state === "loading" && (
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<Loader2 className="h-4 w-4 animate-spin" /> Caricamento…
					</div>
				)}
				{state === "missing" && (
					<SheetHeader>
						<SheetTitle>Evidenza non disponibile</SheetTitle>
						<SheetDescription>Il collegamento non corrisponde a un'evidenza visibile per questo cliente.</SheetDescription>
					</SheetHeader>
				)}
				{state === "error" && (
					<SheetHeader>
						<SheetTitle>Dettaglio non disponibile</SheetTitle>
						<SheetDescription>Non è stato possibile caricare l'evidenza. Riprova tra poco.</SheetDescription>
					</SheetHeader>
				)}
				{finding && state === "idle" && (
					<div className="space-y-5">
						<SheetHeader>
							<SheetTitle>{finding.title}</SheetTitle>
							<SheetDescription>Evidenza DarkRisk360</SheetDescription>
						</SheetHeader>

						<div className="flex flex-wrap gap-2">
							<Badge variant="outline">Gravità {SEVERITY_LABEL[finding.severity] ?? finding.severity}</Badge>
							<Badge variant="outline">{finding.acknowledged ? "Presa visione registrata" : "Presa visione da fare"}</Badge>
						</div>

						<dl className="divide-y divide-border">
							<Row label="Perché riguarda il cliente" value={finding.asset ? `Cita ${finding.asset}` : "Asset da attribuire"} />
							<Row
								label="Tipo di esposizione"
								value={finding.compromiseType === "direct" ? "Diretta (perimetro del cliente)" : finding.compromiseType === "indirect" ? "Indiretta (terze parti)" : "Non determinata"}
							/>
							<Row label="Data della fonte" value={fmtDay(finding.leakDate) ?? "Data fonte non verificata"} />
							<Row label="Prima osservazione" value={fmtDay(finding.firstSeenAt) ?? "Non disponibile"} />
							<Row label="Ultima osservazione" value={fmtDay(finding.lastSeenAt) ?? "Non disponibile"} />
							<Row label="Assegnatario" value={finding.assignee ?? "Da assegnare"} />
							<Row label="Verifica" value={ACTION_LABEL[finding.actionStatus ?? ""] ?? "Da valutare"} />
							{finding.surfaceFindingId && (
								<Row
									label="Rilievo d'origine"
									value={
										<Link className="text-primary underline-offset-4 hover:underline" to={`/surface-scan?vista=azioni&finding=${encodeURIComponent(finding.surfaceFindingId)}`}>
											Apri in SurfaceScan360
										</Link>
									}
								/>
							)}
						</dl>

						<div>
							<p className="mb-1 text-sm font-medium">Prossimo passo</p>
							<p className="text-sm text-muted-foreground">{nextStep(finding)}</p>
						</div>

						{canEdit && (
							<form
								className="space-y-3 rounded-md border border-border p-3"
								onSubmit={(event) => {
									event.preventDefault();
									save();
								}}
							>
								<div className="space-y-1">
									<Label htmlFor="evidence-assignee">Assegnatario</Label>
									<AssigneeSelect
										id="evidence-assignee"
										companyId={companyId}
										groupId={groupId}
										value={assigneeUserId}
										currentName={finding.assignee}
										onChange={setAssigneeUserId}
									/>
								</div>
								<div className="space-y-1">
									<Label htmlFor="evidence-action-status">Stato della verifica</Label>
									<Select value={actionStatus || "none"} onValueChange={(v) => setActionStatus(v === "none" ? "" : v)}>
										<SelectTrigger id="evidence-action-status">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="none">Da valutare</SelectItem>
											{Object.entries(ACTION_LABEL).map(([value, label]) => (
												<SelectItem key={value} value={value}>
													{label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<Button type="submit" size="sm" disabled={saving}>
									{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
									Salva
								</Button>
							</form>
						)}

						<div>
							<p className="mb-2 text-sm font-medium">Storico delle decisioni</p>
							{events.length === 0 ? (
								<p className="text-sm text-muted-foreground">Nessuna decisione registrata.</p>
							) : (
								<ul className="space-y-2 text-sm">
									{events.map((e, i) => (
										<li key={`${e.action}-${e.createdAt}-${i}`} className="rounded border border-border p-2">
											<div className="font-medium">{EVENT_LABEL[e.action] ?? e.action}</div>
											<div className="text-xs text-muted-foreground">
												{e.actor ?? "Sistema"} · {fmtDay(e.createdAt) ?? "—"}
											</div>
											{e.note && <div className="mt-1 text-xs italic">{e.note}</div>}
										</li>
									))}
								</ul>
							)}
							<p className="mt-2 text-xs text-muted-foreground">
								Le osservazioni della fonte (prima e ultima) sono riportate sopra e non compaiono in questo storico.
							</p>
						</div>
					</div>
				)}
			</SheetContent>
		</Sheet>
	);
}
