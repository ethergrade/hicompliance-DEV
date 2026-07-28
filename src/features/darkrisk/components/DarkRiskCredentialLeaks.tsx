// Credenziali esposte (profilo Esteso).
//
// Il backend restituisce solo il valore mascherato: non esiste un modo di
// mostrare la password in chiaro da questa tabella. Lo sblocco passa dal
// reveal sull'evidenza, che richiede motivazione, è consentito ai soli
// admin e viene registrato su darkrisk_audit_log (documento operativo §9.3).
import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Check, Copy, Search, Unlock } from "lucide-react";
import type { CredentialLeak } from "../domain/contracts";

const BUCKET_LABELS: Record<string, string> = {
	"leaks.logs": "Leaks Logs",
	"leaks.private.general": "Leaks Private",
	"leaks.public.general": "Leaks Public",
	"leaks.restricted": "Leaks Restricted",
};

const PASSWORD_TYPE_VARIANT: Record<string, "destructive" | "secondary" | "outline"> = {
	Plaintext: "destructive",
	MD5: "secondary",
	Hash: "secondary",
};

interface Props {
	records: CredentialLeak[];
	total?: number;
	/** Assente quando l'utente non può richiedere lo sblocco (ruolo non abilitato). */
	onReveal?: (record: CredentialLeak) => void;
	limit?: number;
}

export function DarkRiskCredentialLeaks({ records, total, onReveal, limit = 50 }: Props) {
	const [search, setSearch] = useState("");
	const [copied, setCopied] = useState<string | null>(null);

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return records;
		return records.filter(
			(record) =>
				record.selector.toLowerCase().includes(q) ||
				(record.assetScope ?? "").toLowerCase().includes(q) ||
				(record.bucketDisplay ?? record.bucketCanonical ?? "").toLowerCase().includes(q),
		);
	}, [records, search]);

	const visible = filtered.slice(0, limit);

	const copyAccount = async (account: string) => {
		try {
			await navigator.clipboard.writeText(account);
			setCopied(account);
			setTimeout(() => setCopied(null), 2000);
		} catch {
			/* clipboard non disponibile: nessun fallback, non è un'azione critica */
		}
	};

	if (!records.length) {
		return (
			<Card className="bg-card">
				<CardHeader className="pb-3">
					<CardTitle className="flex items-center gap-2 text-sm font-medium">
						<AlertTriangle className="h-4 w-4 text-muted-foreground" />
						Credenziali Esposte
					</CardTitle>
				</CardHeader>
				<CardContent className="pt-0 text-xs text-muted-foreground">
					Nessuna credenziale esposta rilevata per il perimetro monitorato.
				</CardContent>
			</Card>
		);
	}

	return (
		<Card className="border-destructive/30 bg-card">
			<CardHeader className="pb-3">
				<CardTitle className="flex items-center gap-2 text-sm font-medium">
					<AlertTriangle className="h-4 w-4 text-destructive" />
					Credenziali Esposte
					<Badge variant="destructive" className="text-xs">
						{total ?? records.length}
					</Badge>
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-3 pt-0">
				<div className="relative">
					<Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						placeholder="Filtra per account, dominio o bucket..."
						className="h-8 pl-8 text-xs"
					/>
				</div>

				<div className="overflow-x-auto rounded-md border border-border">
					<table className="w-full text-xs">
						<thead>
							<tr className="border-b border-border bg-muted/50">
								<th className="px-3 py-2 text-left font-medium text-muted-foreground">Account</th>
								<th className="px-3 py-2 text-left font-medium text-muted-foreground">Password</th>
								<th className="hidden px-3 py-2 text-left font-medium text-muted-foreground sm:table-cell">
									Tipo
								</th>
								<th className="hidden px-3 py-2 text-left font-medium text-muted-foreground md:table-cell">
									Bucket
								</th>
								<th className="hidden px-3 py-2 text-left font-medium text-muted-foreground lg:table-cell">
									Sorgente
								</th>
								<th className="hidden px-3 py-2 text-left font-medium text-muted-foreground lg:table-cell">
									Data
								</th>
								<th className="w-16 px-3 py-2" />
							</tr>
						</thead>
						<tbody>
							{visible.map((record) => {
								const bucket = record.bucketCanonical ?? record.bucketDisplay;
								const date = record.evidenceDate ?? record.createdAt;
								return (
									<tr
										key={record.id}
										className="border-b border-border/50 transition-colors hover:bg-muted/30"
									>
										<td className="max-w-[200px] px-3 py-2 font-mono">
											<span className="block truncate">{record.selector || record.assetScope || "—"}</span>
										</td>
										<td className="px-3 py-2 font-mono text-muted-foreground">{record.maskedValue}</td>
										<td className="hidden px-3 py-2 sm:table-cell">
											{record.passwordType && (
												<Badge
													variant={PASSWORD_TYPE_VARIANT[record.passwordType] ?? "outline"}
													className="px-1.5 text-[10px]"
												>
													{record.passwordType}
												</Badge>
											)}
										</td>
										<td className="hidden px-3 py-2 md:table-cell">
											{bucket && (
												<Badge variant="outline" className="px-1.5 text-[10px]">
													{BUCKET_LABELS[bucket] ?? record.bucketDisplay ?? bucket}
												</Badge>
											)}
										</td>
										<td className="hidden max-w-[160px] px-3 py-2 text-muted-foreground lg:table-cell">
											<span className="block truncate" title={record.sourceLong ?? undefined}>
												{record.sourceShort ?? record.collectionName ?? "—"}
											</span>
										</td>
										<td className="hidden px-3 py-2 text-muted-foreground lg:table-cell">
											{date ? new Date(date).toLocaleDateString("it-IT") : "—"}
										</td>
										<td className="px-3 py-2">
											<div className="flex items-center gap-1">
												<Button
													variant="ghost"
													size="icon"
													className="h-6 w-6"
													onClick={() => copyAccount(record.selector)}
													title="Copia account"
												>
													{copied === record.selector ? (
														<Check className="h-3 w-3 text-green-500" />
													) : (
														<Copy className="h-3 w-3" />
													)}
												</Button>
												{onReveal && record.evidenceId && (
													<Button
														variant="ghost"
														size="icon"
														className="h-6 w-6"
														onClick={() => onReveal(record)}
														title="Richiedi sblocco evidenza (richiede motivazione, viene registrato)"
													>
														<Unlock className="h-3 w-3" />
													</Button>
												)}
											</div>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
					{filtered.length > visible.length && (
						<div className="border-t border-border py-2 text-center text-xs text-muted-foreground">
							Mostrate {visible.length} di {filtered.length} credenziali. Usa il filtro per restringere.
						</div>
					)}
				</div>

				<p className="text-[11px] leading-snug text-muted-foreground">
					Le password sono sempre mascherate. Lo sblocco dell'evidenza in chiaro richiede una
					motivazione, è riservato ai ruoli autorizzati e viene registrato nel log di audit.
				</p>
			</CardContent>
		</Card>
	);
}
