import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AssigneeSelect } from "@/components/shared/AssigneeSelect";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { surfaceScan360Api } from "@/lib/api/surface-scan360";
import { useClientOrganization } from "@/hooks/useClientOrganization";
import { toCvss } from "@/lib/surfacescan/normalize";

/** Parametro dell'URL che apre la scheda: il link funziona anche da notifica o report. */
export const FINDING_PARAM = "finding";

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

const FINDING_STATUS_LABEL: Record<string, string> = {
	open: "Aperto",
	resolved: "Risolto (non confermato dall'ultima verifica)",
	suppressed: "Soppresso",
	false_positive: "Falso positivo",
	accepted_risk: "Rischio accettato",
};

const fmt = (value: unknown): string | null => {
	if (!value) return null;
	const d = new Date(String(value));
	return Number.isNaN(d.getTime())
		? null
		: d.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const fmtDay = (value: unknown): string | null => {
	if (!value) return null;
	const d = new Date(String(value));
	return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
};

/** Titolo orientato all'intervento per i casi noti; altrimenti il titolo del finding. */
const actionTitle = (f: Record<string, unknown>): string => {
	const type = String(f.finding_type ?? "");
	if (type.startsWith("ssl_certificate_")) return "Rinnovare il certificato TLS";
	return String(f.title ?? "Intervento");
};

/** Le prime 20 CVE, poi quante ne restano: un servizio può averne decine. */
const cveList = (cves: string[]): string =>
	cves.length > 20 ? `${cves.slice(0, 20).join(", ")} e altre ${cves.length - 20}` : cves.join(", ");

const Row: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
	<div className="grid grid-cols-[140px_1fr] gap-3 py-1.5 text-sm">
		<dt className="text-muted-foreground">{label}</dt>
		<dd className="min-w-0 break-words">{value}</dd>
	</div>
);

/**
 * Scheda azione di un finding SurfaceScan360: cosa è stato osservato, dove,
 * quando, chi interviene e come si verifica la chiusura. Si apre da
 * `?finding=<id>`; un ID inesistente o di un altro cliente dà una vista neutra.
 */
export const SurfaceFindingSheet: React.FC<{ canManage: boolean }> = ({ canManage }) => {
	const [params, setParams] = useSearchParams();
	const findingId = params.get(FINDING_PARAM);
	const { organizationId, groupId } = useClientOrganization();

	const [finding, setFinding] = useState<Record<string, unknown> | null>(null);
	const [state, setState] = useState<"idle" | "loading" | "missing" | "error">("idle");
	const [assigneeUserId, setAssigneeUserId] = useState<string | null>(null);
	const [actionStatus, setActionStatus] = useState<string>("");
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		setFinding(null);
		if (!findingId || !organizationId) {
			setState("idle");
			return;
		}
		let cancelled = false;
		setState("loading");
		surfaceScan360Api
			.getFinding(organizationId, findingId, groupId)
			.then((data) => {
				if (cancelled) return;
				setFinding(data);
				setAssigneeUserId(data.assignee_user_id ? String(data.assignee_user_id) : null);
				setActionStatus(String(data.action_status ?? ""));
				setState("idle");
			})
			.catch((error: { status?: number }) => {
				if (!cancelled) setState(error?.status === 404 ? "missing" : "error");
			});
		return () => {
			cancelled = true;
		};
	}, [findingId, organizationId, groupId]);

	const close = () => {
		const next = new URLSearchParams(params);
		next.delete(FINDING_PARAM);
		setParams(next);
	};

	const save = async () => {
		if (!organizationId || !findingId) return;
		setSaving(true);
		try {
			const updated = await surfaceScan360Api.updateFindingAction(
				organizationId,
				findingId,
				{ assignee_user_id: assigneeUserId, action_status: actionStatus || null },
				groupId,
			);
			setFinding(updated);
			toast.success("Intervento aggiornato");
		} catch {
			toast.error("Non è stato possibile salvare");
		} finally {
			setSaving(false);
		}
	};

	const evidence = (finding?.evidence ?? {}) as Record<string, unknown>;
	const isTls = String(finding?.finding_type ?? "").startsWith("ssl_certificate_");
	const resolved = String(finding?.status ?? "") === "resolved";
	const cvss = toCvss(finding?.cvss);
	const host = String(finding?.affected_asset ?? finding?.ip ?? "");
	const port = finding?.port ? `:${finding.port}` : "";

	return (
		<Sheet open={Boolean(findingId)} onOpenChange={(open) => !open && close()}>
			<SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
				{state === "loading" && (
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<Loader2 className="h-4 w-4 animate-spin" /> Caricamento…
					</div>
				)}
				{state === "missing" && (
					<SheetHeader>
						<SheetTitle>Finding non disponibile</SheetTitle>
						<SheetDescription>Il collegamento non corrisponde a un finding di questo cliente.</SheetDescription>
					</SheetHeader>
				)}
				{state === "error" && (
					<SheetHeader>
						<SheetTitle>Dettaglio non disponibile</SheetTitle>
						<SheetDescription>Non è stato possibile caricare il finding. Riprova tra poco.</SheetDescription>
					</SheetHeader>
				)}
				{finding && state === "idle" && (
					<div className="space-y-5">
						<SheetHeader>
							<SheetTitle>{actionTitle(finding)}</SheetTitle>
							<SheetDescription>{String(finding.title ?? "")}</SheetDescription>
						</SheetHeader>

						<div className="flex flex-wrap gap-2">
							<Badge variant="outline">Gravità {SEVERITY_LABEL[String(finding.severity)] ?? String(finding.severity)}</Badge>
							<Badge variant="outline">{FINDING_STATUS_LABEL[String(finding.status)] ?? String(finding.status)}</Badge>
						</div>

						<dl className="divide-y divide-border">
							<Row label="Endpoint" value={host ? `${host}${port}` : "Non indicato"} />
							<Row label="Ultima rilevazione" value={fmt(finding.last_seen_at) ?? fmt(finding.created_at) ?? "Data non acquisita"} />
							{isTls && <Row label="Scadenza" value={fmtDay(evidence.valid_to) ?? "Data non acquisita"} />}
							{isTls && evidence.issuer ? <Row label="Emittente" value={String(evidence.issuer)} /> : null}
							{cvss !== null && <Row label="CVSS" value={cvss.toLocaleString("it-IT", { maximumFractionDigits: 1 })} />}
							{Array.isArray(finding.cve) && finding.cve.length > 0 && <Row label="CVE" value={cveList(finding.cve as string[])} />}
							<Row label="Assegnatario" value={String(finding.assignee ?? "").trim() || "Da assegnare"} />
							<Row label="Intervento" value={ACTION_LABEL[String(finding.action_status ?? "")] ?? "Da valutare"} />
						</dl>

						{finding.remediation ? (
							<div>
								<p className="mb-1 text-sm font-medium">Cosa fare</p>
								<p className="text-sm text-muted-foreground">{String(finding.remediation)}</p>
							</div>
						) : null}

						<div>
							<p className="mb-1 text-sm font-medium">Come si verifica la chiusura</p>
							<p className="text-sm text-muted-foreground">
								{resolved
									? "L'ultima verifica non ha più confermato il problema."
									: "Il finding si chiude quando una nuova scansione dello stesso endpoint non lo conferma. Se la verifica non è disponibile, l'esito precedente resta da verificare."}
							</p>
						</div>

						{canManage && (
							<form
								className="space-y-3 rounded-md border border-border p-3"
								onSubmit={(event) => {
									event.preventDefault();
									save();
								}}
							>
								<div className="space-y-1">
									<Label htmlFor="finding-assignee">Assegnatario</Label>
									<AssigneeSelect
										id="finding-assignee"
										companyId={organizationId!}
										groupId={groupId}
										value={assigneeUserId}
										currentName={finding.assignee ? String(finding.assignee) : null}
										onChange={setAssigneeUserId}
									/>
								</div>
								<div className="space-y-1">
									<Label htmlFor="finding-action-status">Stato dell'intervento</Label>
									<Select value={actionStatus || "none"} onValueChange={(v) => setActionStatus(v === "none" ? "" : v)}>
										<SelectTrigger id="finding-action-status">
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
					</div>
				)}
			</SheetContent>
		</Sheet>
	);
};

export default SurfaceFindingSheet;
