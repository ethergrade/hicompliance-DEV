// Dialoghi per il riconoscimento (ACK) DarkRisk: dare o revocare l'ACK con una
// nota, e vederne lo storico. Per le evidenze (elenco delle evidenze) e per le
// credenziali dell'Esteso, che si riconoscono una per una.
import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { darkRiskGateway } from "../api/darkRiskGateway";
import type { CredentialLeak } from "../domain/contracts";

const ACTION_LABEL: Record<string, string> = {
	darkrisk_finding_acknowledged: "Riconosciuta",
	darkrisk_finding_acknowledgement_revoked: "Riconoscimento revocato",
	darkrisk_finding_status_changed: "Stato cambiato",
	darkrisk_credential_acknowledged: "Riconosciuta",
	darkrisk_credential_acknowledgement_revoked: "Riconoscimento revocato",
};

const ACKNOWLEDGED_ACTIONS = new Set(["darkrisk_finding_acknowledged", "darkrisk_credential_acknowledged"]);

const fmtDateTime = (v: string | null) => {
	if (!v) return "—";
	const d = new Date(v);
	return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("it-IT");
};

export interface AckTarget {
	findingId: string;
	title: string;
	acknowledged: boolean;
}

interface AckDialogProps {
	companyId: string;
	groupId?: string | null;
	target: AckTarget | null;
	onClose: () => void;
	onDone: () => void;
}

/** Riconosce l'evidenza, o revoca il riconoscimento se è già riconosciuta. */
export function AckDialog({ companyId, groupId, target, onClose, onDone }: AckDialogProps) {
	const [note, setNote] = useState("");
	const [saving, setSaving] = useState(false);

	const revoking = target?.acknowledged ?? false;

	const submit = async () => {
		if (!target) return;
		setSaving(true);
		try {
			if (revoking) {
				await darkRiskGateway.revokeFindingAcknowledgement(companyId, groupId, target.findingId, note);
				toast.success("Riconoscimento revocato");
			} else {
				await darkRiskGateway.acknowledgeFinding(companyId, groupId, target.findingId, note);
				toast.success("Evidenza riconosciuta");
			}
			setNote("");
			onDone();
			onClose();
		} catch (error) {
			toast.error(`Operazione non riuscita: ${(error as Error)?.message ?? "errore"}`);
		} finally {
			setSaving(false);
		}
	};

	return (
		<Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{revoking ? "Revoca il riconoscimento" : "Riconosci l'evidenza"}</DialogTitle>
					<DialogDescription>
						{revoking
							? "L'evidenza torna da gestire. Il riconoscimento precedente resta nello storico."
							: "Dichiari di aver preso in carico l'evidenza (per esempio: credenziale già cambiata). Restano registrati chi e quando."}
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-2">
					<p className="text-sm font-medium">{target?.title}</p>
					<Textarea
						value={note}
						onChange={(e) => setNote(e.target.value)}
						maxLength={500}
						placeholder="Nota facoltativa (es. password cambiata il 03/10)"
					/>
					<p className="text-xs text-muted-foreground">
						Non scrivere password, credenziali o dati personali nella nota.
					</p>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={onClose} disabled={saving}>
						Annulla
					</Button>
					<Button onClick={submit} disabled={saving} variant={revoking ? "destructive" : "default"}>
						{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
						{revoking ? "Revoca" : "Riconosci"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

interface HistoryDialogProps {
	companyId: string;
	groupId?: string | null;
	/** Un'evidenza (findingId) o una credenziale dell'Esteso (credentialKey). */
	target: { findingId?: string; credentialKey?: string; title: string } | null;
	onClose: () => void;
}

/** Storico di riconoscimenti, revoche e cambi di stato di un'evidenza o di una credenziale. */
export function AckHistoryDialog({ companyId, groupId, target, onClose }: HistoryDialogProps) {
	const query = useQuery({
		queryKey: ["darkrisk-ack-history", companyId, groupId, target?.findingId ?? target?.credentialKey],
		enabled: target !== null,
		queryFn: () =>
			target!.credentialKey
				? darkRiskGateway.getCredentialHistory(companyId, groupId, target!.credentialKey)
				: darkRiskGateway.getFindingHistory(companyId, groupId, target!.findingId!),
	});

	return (
		<Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>Storico</DialogTitle>
					<DialogDescription>{target?.title}</DialogDescription>
				</DialogHeader>
				{query.isLoading ? (
					<Loader2 className="h-4 w-4 animate-spin" />
				) : (query.data ?? []).length === 0 ? (
					<p className="text-sm text-muted-foreground">Nessuna azione registrata.</p>
				) : (
					<ul className="space-y-3">
						{(query.data ?? []).map((e, i) => (
							<li key={`${e.createdAt}-${i}`} className="border-l-2 pl-3">
								<div className="flex items-center gap-2 text-sm">
									<Badge variant={ACKNOWLEDGED_ACTIONS.has(e.action) ? "default" : "outline"}>
										{ACTION_LABEL[e.action] ?? e.action}
									</Badge>
									<span className="text-muted-foreground">{fmtDateTime(e.createdAt)}</span>
								</div>
								<div className="mt-1 text-xs text-muted-foreground">{e.actor ?? "Utente non disponibile"}</div>
								{e.note && <p className="mt-1 text-sm">{e.note}</p>}
							</li>
						))}
					</ul>
				)}
			</DialogContent>
		</Dialog>
	);
}

const accountOf = (r: CredentialLeak) => r.clearAccount || r.selector || r.assetScope || "—";

function AccountList({ rows, max = 8 }: { rows: CredentialLeak[]; max?: number }) {
	return (
		<ul className="max-h-40 space-y-0.5 overflow-y-auto rounded-md border p-2 font-mono text-xs">
			{rows.slice(0, max).map((r) => <li key={r.credentialKey} className="truncate">{accountOf(r)}</li>)}
			{rows.length > max && <li className="text-muted-foreground">e altre {rows.length - max}</li>}
		</ul>
	);
}

export interface CredentialAckTarget {
	mode: "ack" | "revoke";
	/** Le credenziali scelte: una riga o quelle spuntate. */
	rows: CredentialLeak[];
	/** Per una riga sola: le altre credenziali dello stesso leak, da includere solo se lo si sceglie. */
	sameLeak?: CredentialLeak[];
}

/**
 * Riconosce o revoca le credenziali scelte, e solo quelle: il conteggio e gli
 * account sono nella conferma. Le altre dello stesso leak si aggiungono solo
 * spuntando l'opzione apposita.
 */
export function CredentialAckDialog({ companyId, groupId, target, onClose, onDone }: {
	companyId: string;
	groupId?: string | null;
	target: CredentialAckTarget | null;
	onClose: () => void;
	onDone: () => void;
}) {
	const [note, setNote] = useState("");
	const [withLeak, setWithLeak] = useState(false);
	const [saving, setSaving] = useState(false);

	const revoking = target?.mode === "revoke";
	const sameLeak = (!revoking && target?.sameLeak) || [];
	const rows = target ? [...target.rows, ...(withLeak ? sameLeak : [])] : [];
	const n = rows.length;
	const close = () => { setNote(""); setWithLeak(false); onClose(); };

	const submit = async () => {
		if (!n) return;
		setSaving(true);
		try {
			const keys = rows.map((r) => r.credentialKey);
			const done = revoking
				? await darkRiskGateway.revokeCredentialAcknowledgements(companyId, groupId, keys, note)
				: await darkRiskGateway.acknowledgeCredentials(companyId, groupId, keys, note);
			toast.success(revoking
				? (done === 1 ? "Riconoscimento revocato" : `${done} riconoscimenti revocati`)
				: (done === 1 ? "Credenziale riconosciuta" : `${done} credenziali riconosciute`));
			onDone();
			close();
		} catch (error) {
			toast.error(`Operazione non riuscita: ${(error as Error)?.message ?? "errore"}`);
		} finally {
			setSaving(false);
		}
	};

	return (
		<Dialog open={target !== null} onOpenChange={(open) => !open && close()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{revoking
							? (n === 1 ? "Revoca il riconoscimento" : `Revoca il riconoscimento di ${n} credenziali`)
							: (n === 1 ? "Riconosci la credenziale" : `Riconosci ${n} credenziali`)}
					</DialogTitle>
					<DialogDescription>
						{revoking
							? `${n === 1 ? "La credenziale torna" : `Le ${n} credenziali tornano`} da gestire. Il riconoscimento precedente resta nello storico.`
							: `Dichiari di aver preso in carico ${n === 1 ? "solo questa credenziale" : `queste ${n} credenziali`} (per esempio: password già cambiata). Le altre non cambiano. Restano registrati chi e quando.`}
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-3">
					<AccountList rows={target?.rows ?? []} />
					{sameLeak.length > 0 && (
						<div className="space-y-2 rounded-md border border-dashed p-2">
							<label className="flex items-center gap-2 text-sm">
								<Checkbox checked={withLeak} onCheckedChange={(v) => setWithLeak(v === true)} />
								Riconosci anche le altre {sameLeak.length} credenziali dello stesso leak
							</label>
							{withLeak && <AccountList rows={sameLeak} />}
						</div>
					)}
					<Textarea
						value={note}
						onChange={(e) => setNote(e.target.value)}
						maxLength={500}
						placeholder="Nota facoltativa (es. password cambiata il 03/10)"
					/>
					<p className="text-xs text-muted-foreground">
						Non scrivere password, credenziali o dati personali nella nota.
					</p>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={close} disabled={saving}>Annulla</Button>
					<Button onClick={submit} disabled={saving || !n} variant={revoking ? "destructive" : "default"}>
						{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
						{revoking ? "Revoca" : "Riconosci"}{n > 1 ? ` (${n})` : ""}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
