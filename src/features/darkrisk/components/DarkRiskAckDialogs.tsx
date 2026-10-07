// Dialoghi condivisi per il riconoscimento (ACK) di un'evidenza DarkRisk: dare
// o revocare l'ACK con una nota, e vederne lo storico. Usati dall'elenco delle
// evidenze e dalla tabella delle credenziali dell'Esteso.
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
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { darkRiskGateway } from "../api/darkRiskGateway";

const ACTION_LABEL: Record<string, string> = {
	darkrisk_finding_acknowledged: "Riconosciuta",
	darkrisk_finding_acknowledgement_revoked: "Riconoscimento revocato",
	darkrisk_finding_status_changed: "Stato cambiato",
};

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
	target: { findingId: string; title: string } | null;
	onClose: () => void;
}

/** Storico di riconoscimenti, revoche e cambi di stato di un'evidenza. */
export function AckHistoryDialog({ companyId, groupId, target, onClose }: HistoryDialogProps) {
	const query = useQuery({
		queryKey: ["darkrisk-finding-history", companyId, groupId, target?.findingId],
		enabled: target !== null,
		queryFn: () => darkRiskGateway.getFindingHistory(companyId, groupId, target!.findingId),
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
									<Badge variant={e.action === "darkrisk_finding_acknowledged" ? "default" : "outline"}>
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
