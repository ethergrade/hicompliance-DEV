// Credenziali esposte (profilo Esteso).
//
// Nel profilo Esteso il backend manda l'account intero e la password con i soli
// primi tre caratteri
// (`clearAccount`, `clearValue`) a tutti gli utenti del gruppo. Sugli hit
// ingeriti prima che l'account venisse conservato `clearAccount` è null e la
// riga mostra il selector (dominio o email cercata). Nessun reveal né copia:
// i valori sono già leggibili e l'export Excel li porta fuori.
//
// Una riga per credenziale (account + password), anche se la vedono più
// scansioni. Il riconoscimento vale per la credenziale: una riga, quelle
// spuntate, o tutte quelle dello stesso leak solo se lo si sceglie.
import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, History, Search, X } from "lucide-react";
import { useCapabilities } from "@/hooks/useCapabilities";
import type { CredentialLeak } from "../domain/contracts";
import { AckHistoryDialog, CredentialAckDialog, type CredentialAckTarget } from "./DarkRiskAckDialogs";
import {
	EMPTY_FILTERS,
	filterCredentialLeaks,
	formatDay,
	hasActiveFilters,
	invalidRange,
	leakDay,
	type CredentialLeakFilters,
} from "../shared/credentialLeakFilters";

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

const ND = <span className="text-muted-foreground/70">Non disponibile</span>;

interface Props {
	records: CredentialLeak[];
	/** Export Excel delle righe filtrate (tutte, senza filtri). */
	onExport?: (records: CredentialLeak[]) => void;
	limit?: number;
	/** Per riconoscere (ACK) le credenziali: senza, la colonna resta di sola lettura. */
	companyId?: string;
	groupId?: string | null;
	/** Ricarica dopo un ACK o una revoca. */
	onChanged?: () => void;
}

const accountOf = (record: CredentialLeak) => record.clearAccount || record.selector || record.assetScope || "—";
const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleDateString("it-IT") : null);

export function DarkRiskCredentialLeaks({ records, onExport, limit = 50, companyId, groupId, onChanged }: Props) {
	const { hasCapability } = useCapabilities();
	const canAck = Boolean(companyId) && hasCapability("darkrisk.findings.ack");

	const [filters, setFilters] = useState<CredentialLeakFilters>(EMPTY_FILTERS);
	const setFilter = (p: Partial<CredentialLeakFilters>) => setFilters((f) => ({ ...f, ...p }));
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [ackTarget, setAckTarget] = useState<CredentialAckTarget | null>(null);
	const [historyTarget, setHistoryTarget] = useState<{ credentialKey: string; title: string } | null>(null);

	const passwordTypes = useMemo(
		() => Array.from(new Set(records.map((r) => r.passwordType).filter((t): t is string => Boolean(t)))).sort(),
		[records],
	);
	// Le credenziali di ogni leak, per proporre "anche le altre dello stesso leak"
	const byLeak = useMemo(() => {
		const map = new Map<string, CredentialLeak[]>();
		for (const r of records) if (r.findingId) map.set(r.findingId, [...(map.get(r.findingId) ?? []), r]);
		return map;
	}, [records]);

	const { rows: filtered, withoutDate } = useMemo(() => filterCredentialLeaks(records, filters), [records, filters]);
	const visible = filtered.slice(0, limit);
	const filtering = hasActiveFilters(filters);

	const selectedRows = records.filter((r) => selected.has(r.credentialKey));
	const toAck = selectedRows.filter((r) => !r.acknowledged);
	const toRevoke = selectedRows.filter((r) => r.acknowledged);
	const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r.credentialKey));
	const toggle = (key: string, on: boolean) =>
		setSelected((s) => { const n = new Set(s); if (on) n.add(key); else n.delete(key); return n; });
	const toggleVisible = (on: boolean) =>
		setSelected((s) => { const n = new Set(s); visible.forEach((r) => (on ? n.add(r.credentialKey) : n.delete(r.credentialKey))); return n; });

	const openRow = (record: CredentialLeak) =>
		setAckTarget({
			mode: record.acknowledged ? "revoke" : "ack",
			rows: [record],
			sameLeak: record.findingId
				? (byLeak.get(record.findingId) ?? []).filter((r) => r.credentialKey !== record.credentialKey && !r.acknowledged)
				: [],
		});

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
				<CardTitle className="flex flex-wrap items-center gap-2 text-sm font-medium">
					<AlertTriangle className="h-4 w-4 text-destructive" />
					Credenziali Esposte
					<Badge variant="destructive" className="text-xs" title={filtering ? "Credenziali che rispettano i filtri, sul totale" : "Credenziali distinte (account e password)"}>
						{filtering ? `${filtered.length} di ${records.length}` : records.length}
					</Badge>
					{onExport && (
						<Button size="sm" variant="outline" className="ml-auto" disabled={!filtered.length} onClick={() => onExport(filtered)}>
							<FileSpreadsheet className="mr-2 h-4 w-4" />
							{filtering ? `Esporta ${filtered.length} righe filtrate` : "Esporta Excel"}
						</Button>
					)}
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-3 pt-0">
				<div className="grid gap-2 md:grid-cols-5">
					<div className="relative md:col-span-2 self-end">
						<Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={filters.search}
							onChange={(event) => setFilter({ search: event.target.value })}
							placeholder="Filtra per account, dominio o bucket..."
							className="h-8 pl-8 text-xs"
						/>
					</div>
					<div className="space-y-1">
						<Label className="text-[11px]">Tipo di password</Label>
						<Select value={filters.passwordType} onValueChange={(v) => setFilter({ passwordType: v })}>
							<SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
							<SelectContent>
								<SelectItem value="all">Tutti</SelectItem>
								{passwordTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-1">
						<Label className="text-[11px]">Riconoscimento</Label>
						<Select value={filters.ack} onValueChange={(v) => setFilter({ ack: v })}>
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
							<Label className="text-[11px]" title="Data dichiarata dalla fonte del leak, non quella in cui l'abbiamo rilevata">Data del leak dal</Label>
							<Input type="date" value={filters.dateFrom} max={filters.dateTo || undefined} onChange={(e) => setFilter({ dateFrom: e.target.value })} className="h-8 text-xs" />
						</div>
						<div className="space-y-1">
							<Label className="text-[11px]">al (compreso)</Label>
							<Input type="date" value={filters.dateTo} min={filters.dateFrom || undefined} onChange={(e) => setFilter({ dateTo: e.target.value })} className="h-8 text-xs" />
						</div>
					</div>
				</div>
				{invalidRange(filters) && (
					<p className="text-xs text-destructive">La data iniziale è successiva a quella finale: il filtro per data non è applicato.</p>
				)}
				{withoutDate > 0 && (
					<p className="text-xs text-muted-foreground">
						{withoutDate === 1 ? "1 credenziale è esclusa" : `${withoutDate} credenziali sono escluse`} dal filtro per data: la fonte non indica la data del leak.
					</p>
				)}

				{canAck && selected.size > 0 && (
					<div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-muted/40 p-2 text-xs">
						<span className="font-medium">{selected.size} selezionate</span>
						<Button size="sm" className="h-7 text-xs" disabled={!toAck.length} onClick={() => setAckTarget({ mode: "ack", rows: toAck })}>
							Riconosci ({toAck.length})
						</Button>
						<Button size="sm" variant="outline" className="h-7 text-xs" disabled={!toRevoke.length} onClick={() => setAckTarget({ mode: "revoke", rows: toRevoke })}>
							Revoca ({toRevoke.length})
						</Button>
						<Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelected(new Set())}>
							<X className="mr-1 h-3.5 w-3.5" />Deseleziona
						</Button>
					</div>
				)}

				<div className="overflow-x-auto rounded-md border border-border">
					<table className="w-full text-xs">
						<thead>
							<tr className="border-b border-border bg-muted/50">
								{canAck && (
									<th className="w-8 px-3 py-2">
										<Checkbox aria-label="Seleziona le righe visibili" checked={allVisibleSelected} onCheckedChange={(v) => toggleVisible(v === true)} />
									</th>
								)}
								<th className="px-3 py-2 text-left font-medium text-muted-foreground">Account</th>
								<th className="px-3 py-2 text-left font-medium text-muted-foreground">Password</th>
								<th className="hidden px-3 py-2 text-left font-medium text-muted-foreground sm:table-cell">Tipo</th>
								<th className="hidden px-3 py-2 text-left font-medium text-muted-foreground md:table-cell">Bucket</th>
								<th className="hidden px-3 py-2 text-left font-medium text-muted-foreground lg:table-cell">Sorgente</th>
								<th className="hidden px-3 py-2 text-left font-medium text-muted-foreground lg:table-cell">Data del leak</th>
								<th className="hidden px-3 py-2 text-left font-medium text-muted-foreground xl:table-cell">Rilevata</th>
								<th className="px-3 py-2 text-left font-medium text-muted-foreground">Riconoscimento</th>
							</tr>
						</thead>
						<tbody>
							{visible.map((record) => {
								const bucket = record.bucketCanonical ?? record.bucketDisplay;
								const account = accountOf(record);
								const day = formatDay(leakDay(record));
								return (
									<tr key={record.credentialKey} className="border-b border-border/50 transition-colors hover:bg-muted/30">
										{canAck && (
											<td className="px-3 py-2">
												<Checkbox aria-label={`Seleziona ${account}`} checked={selected.has(record.credentialKey)} onCheckedChange={(v) => toggle(record.credentialKey, v === true)} />
											</td>
										)}
										<td className="max-w-[200px] px-3 py-2 font-mono">
											<span className="block truncate" title={account}>{account}</span>
										</td>
										<td className="px-3 py-2 font-mono">
											{record.clearValue ? (
												<code className="rounded bg-red-500/10 px-1.5 py-0.5 text-red-200">{record.clearValue}</code>
											) : (
												<span className="text-muted-foreground">{record.maskedValue}</span>
											)}
										</td>
										<td className="hidden px-3 py-2 sm:table-cell">
											{record.passwordType ? (
												<Badge variant={PASSWORD_TYPE_VARIANT[record.passwordType] ?? "outline"} className="px-1.5 text-[10px]">
													{record.passwordType}
												</Badge>
											) : ND}
										</td>
										<td className="hidden px-3 py-2 md:table-cell">
											{bucket ? (
												<Badge variant="outline" className="px-1.5 text-[10px]">
													{BUCKET_LABELS[bucket] ?? record.bucketDisplay ?? bucket}
												</Badge>
											) : ND}
										</td>
										<td className="hidden max-w-[160px] px-3 py-2 text-muted-foreground lg:table-cell">
											<span className="block truncate" title={record.sourceLong ?? undefined}>
												{record.sourceShort ?? record.collectionName ?? "Non disponibile"}
											</span>
										</td>
										<td className="hidden px-3 py-2 text-muted-foreground lg:table-cell">{day ?? ND}</td>
										<td
											className="hidden px-3 py-2 text-muted-foreground xl:table-cell"
											title={record.seenCount > 1 ? `Vista in ${record.seenCount} scansioni, l'ultima il ${fmtDate(record.lastSeenAt)}` : undefined}
										>
											{fmtDate(record.firstSeenAt) ?? "—"}
											{record.seenCount > 1 && <span className="ml-1 text-[10px]">· {record.seenCount} scansioni</span>}
										</td>
										<td className="px-3 py-2">
											<div className="flex items-center gap-1">
												{record.acknowledged ? (
													<span
														className="inline-flex items-center gap-1 text-emerald-500"
														title={[record.acknowledgedBy, fmtDate(record.acknowledgedAt), record.acknowledgementNote].filter(Boolean).join(" · ")}
													>
														<CheckCircle2 className="h-3.5 w-3.5" /> Riconosciuta
													</span>
												) : (
													<span className="text-muted-foreground">Da gestire</span>
												)}
												{canAck && (
													<Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => openRow(record)}>
														{record.acknowledged ? "Revoca" : "Riconosci"}
													</Button>
												)}
												<Button
													size="sm"
													variant="ghost"
													className="h-6 w-6 p-0"
													aria-label="Storico"
													onClick={() => setHistoryTarget({ credentialKey: record.credentialKey, title: account })}
												>
													<History className="h-3.5 w-3.5" />
												</Button>
											</div>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
					{!filtered.length && (
						<div className="flex flex-col items-center gap-2 py-8 text-xs text-muted-foreground">
							Nessuna credenziale trovata per i filtri selezionati.
							<Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setFilters(EMPTY_FILTERS)}>
								Azzera filtri
							</Button>
						</div>
					)}
					{filtered.length > visible.length && (
						<div className="border-t border-border py-2 text-center text-xs text-muted-foreground">
							Mostrate {visible.length} di {filtered.length} credenziali. Usa il filtro per restringere.
						</div>
					)}
				</div>

				<p className="text-[11px] leading-snug text-muted-foreground">
					Profilo Esteso: l'account è mostrato per intero, la password solo con i primi tre caratteri. Una riga per credenziale, anche se
					la rilevano più scansioni. Le righe senza account provengono da scansioni precedenti e riportano
					il dominio o l'email cercata. Il riconoscimento vale solo per le credenziali scelte.
				</p>

				{companyId && (
					<>
						<CredentialAckDialog
							companyId={companyId}
							groupId={groupId}
							target={ackTarget}
							onClose={() => setAckTarget(null)}
							onDone={() => { setSelected(new Set()); onChanged?.(); }}
						/>
						<AckHistoryDialog companyId={companyId} groupId={groupId} target={historyTarget} onClose={() => setHistoryTarget(null)} />
					</>
				)}
			</CardContent>
		</Card>
	);
}
