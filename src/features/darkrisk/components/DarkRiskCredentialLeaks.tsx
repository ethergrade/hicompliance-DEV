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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, History, Search } from "lucide-react";
import { useCapabilities } from "@/hooks/useCapabilities";
import type { CredentialLeak } from "../domain/contracts";
import { AckDialog, AckHistoryDialog, type AckTarget } from "./DarkRiskAckDialogs";

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
	/** Per riconoscere (ACK) le credenziali: senza, la colonna resta di sola lettura. */
	companyId?: string;
	groupId?: string | null;
	/** Ricarica dopo un ACK o una revoca. */
	onChanged?: () => void;
}

/** La data del leak dichiarata dalla fonte, come yyyy-mm-dd confrontabile con un input date. */
const leakDay = (record: CredentialLeak): string | null => {
	if (!record.evidenceDate) return null;
	const d = new Date(record.evidenceDate);
	return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

export function DarkRiskCredentialLeaks({ records, total, onExport, limit = 50, companyId, groupId, onChanged }: Props) {
	const { hasCapability } = useCapabilities();
	const canAck = Boolean(companyId) && hasCapability("darkrisk.findings.ack");

	const [search, setSearch] = useState("");
	const [passwordType, setPasswordType] = useState("all");
	const [ack, setAck] = useState("all");
	const [dateFrom, setDateFrom] = useState("");
	const [dateTo, setDateTo] = useState("");
	const [ackTarget, setAckTarget] = useState<AckTarget | null>(null);
	const [historyTarget, setHistoryTarget] = useState<{ findingId: string; title: string } | null>(null);

	const passwordTypes = useMemo(
		() => Array.from(new Set(records.map((r) => r.passwordType).filter((t): t is string => Boolean(t)))).sort(),
		[records],
	);

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		return records.filter((record) => {
			if (
				q &&
				!(
					record.selector.toLowerCase().includes(q) ||
					(record.clearAccount ?? "").toLowerCase().includes(q) ||
					(record.assetScope ?? "").toLowerCase().includes(q) ||
					(record.bucketDisplay ?? record.bucketCanonical ?? "").toLowerCase().includes(q)
				)
			) {
				return false;
			}
			if (passwordType !== "all" && record.passwordType !== passwordType) return false;
			if (ack === "only" && !record.acknowledged) return false;
			if (ack === "exclude" && record.acknowledged) return false;
			if (dateFrom || dateTo) {
				const day = leakDay(record);
				if (!day) return false;
				if (dateFrom && day < dateFrom) return false;
				if (dateTo && day > dateTo) return false;
			}
			return true;
		});
	}, [records, search, passwordType, ack, dateFrom, dateTo]);

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
				<div className="grid gap-2 md:grid-cols-5">
					<div className="relative md:col-span-2 self-end">
						<Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							placeholder="Filtra per account, dominio o bucket..."
							className="h-8 pl-8 text-xs"
						/>
					</div>
					<div className="space-y-1">
						<Label className="text-[11px]">Tipo di password</Label>
						<Select value={passwordType} onValueChange={setPasswordType}>
							<SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
							<SelectContent>
								<SelectItem value="all">Tutti</SelectItem>
								{passwordTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-1">
						<Label className="text-[11px]">Riconoscimento</Label>
						<Select value={ack} onValueChange={setAck}>
							<SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
							<SelectContent>
								<SelectItem value="all">Tutte</SelectItem>
								<SelectItem value="exclude">Da gestire</SelectItem>
								<SelectItem value="only">Riconosciute</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="grid grid-cols-2 gap-1">
						<div className="space-y-1">
							<Label className="text-[11px]">Leak dal</Label>
							<Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 text-xs" />
						</div>
						<div className="space-y-1">
							<Label className="text-[11px]">al</Label>
							<Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 text-xs" />
						</div>
					</div>
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
									Data del leak
								</th>
								<th className="px-3 py-2 text-left font-medium text-muted-foreground">Riconoscimento</th>
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
										<td className="px-3 py-2">
											<div className="flex items-center gap-1">
												{record.acknowledged ? (
													<span
														className="inline-flex items-center gap-1 text-emerald-500"
														title={[record.acknowledgedBy, record.acknowledgedAt ? new Date(record.acknowledgedAt).toLocaleDateString("it-IT") : null, record.acknowledgementNote].filter(Boolean).join(" · ")}
													>
														<CheckCircle2 className="h-3.5 w-3.5" /> Riconosciuta
													</span>
												) : (
													<span className="text-muted-foreground">Da gestire</span>
												)}
												{canAck && record.ackFindingId && (
													<Button
														size="sm"
														variant="ghost"
														className="h-6 px-2 text-[11px]"
														onClick={() => setAckTarget({ findingId: record.ackFindingId!, title: account, acknowledged: record.acknowledged })}
													>
														{record.acknowledged ? "Revoca" : "Riconosci"}
													</Button>
												)}
												{record.ackFindingId && (
													<Button
														size="sm"
														variant="ghost"
														className="h-6 w-6 p-0"
														aria-label="Storico"
														onClick={() => setHistoryTarget({ findingId: record.ackFindingId!, title: account })}
													>
														<History className="h-3.5 w-3.5" />
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
					Profilo Esteso: account e password sono mostrati in chiaro. Le righe senza account
					provengono da scansioni precedenti e riportano il dominio o l'email cercata. Il
					riconoscimento vale per l'evidenza: si applica a tutte le credenziali dello stesso leak.
				</p>

				{companyId && (
					<>
						<AckDialog
							companyId={companyId}
							groupId={groupId}
							target={ackTarget}
							onClose={() => setAckTarget(null)}
							onDone={() => onChanged?.()}
						/>
						<AckHistoryDialog companyId={companyId} groupId={groupId} target={historyTarget} onClose={() => setHistoryTarget(null)} />
					</>
				)}
			</CardContent>
		</Card>
	);
}
