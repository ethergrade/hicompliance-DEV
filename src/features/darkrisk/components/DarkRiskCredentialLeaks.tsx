// Credenziali esposte (profilo Esteso).
//
// Nel profilo Esteso il backend manda account e password in chiaro
// (`clearAccount`, `clearValue`) a tutti gli utenti del gruppo. Sugli hit
// ingeriti prima che l'account venisse conservato `clearAccount` è null e la
// riga mostra il selector (dominio o email cercata). Nessun reveal né copia:
// i valori sono già leggibili e l'export Excel li porta fuori tutti insieme.
import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, FileSpreadsheet, Search } from "lucide-react";
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
	/** Export Excel di tutti i record (non solo quelli filtrati/visibili). */
	onExport?: () => void;
	limit?: number;
}

export function DarkRiskCredentialLeaks({ records, total, onExport, limit = 50 }: Props) {
	const [search, setSearch] = useState("");

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return records;
		return records.filter(
			(record) =>
				record.selector.toLowerCase().includes(q) ||
				(record.clearAccount ?? "").toLowerCase().includes(q) ||
				(record.assetScope ?? "").toLowerCase().includes(q) ||
				(record.bucketDisplay ?? record.bucketCanonical ?? "").toLowerCase().includes(q),
		);
	}, [records, search]);

	const visible = filtered.slice(0, limit);

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
					{onExport && (
						<Button size="sm" variant="outline" className="ml-auto" onClick={onExport}>
							<FileSpreadsheet className="mr-2 h-4 w-4" />
							Esporta Excel
						</Button>
					)}
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
							</tr>
						</thead>
						<tbody>
							{visible.map((record) => {
								const bucket = record.bucketCanonical ?? record.bucketDisplay;
								const date = record.evidenceDate ?? record.createdAt;
								const account = record.clearAccount || record.selector || record.assetScope || "—";
								return (
									<tr
										key={record.id}
										className="border-b border-border/50 transition-colors hover:bg-muted/30"
									>
										<td className="max-w-[200px] px-3 py-2 font-mono">
											<span className="block truncate" title={account}>{account}</span>
										</td>
										<td className="px-3 py-2 font-mono">
											{record.clearValue ? (
												<code className="rounded bg-red-500/10 px-1.5 py-0.5 text-red-200">
													{record.clearValue}
												</code>
											) : (
												<span className="text-muted-foreground">{record.maskedValue}</span>
											)}
										</td>
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
					Profilo Esteso: account e password sono mostrati in chiaro. Le righe senza account
					provengono da scansioni precedenti e riportano il dominio o l'email cercata.
				</p>
			</CardContent>
		</Card>
	);
}
