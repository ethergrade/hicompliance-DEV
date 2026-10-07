// Elenco delle evidenze DarkRisk (profili Standard ed Esteso), con filtri per
// data del leak e tipo, e riconoscimento (ACK) del cliente con storico.
// Non mostra account né password: quelli stanno solo nelle credenziali
// dell'Esteso.
import React, { useEffect, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, History, Loader2 } from "lucide-react";
import { useCapabilities } from "@/hooks/useCapabilities";
import { darkRiskGateway } from "../api/darkRiskGateway";
import type { DarkRiskFinding } from "../domain/contracts";
import { AckDialog, AckHistoryDialog, type AckTarget } from "./DarkRiskAckDialogs";

const PER_PAGE = 25;

export const FINDING_TYPE_LABEL: Record<string, string> = {
	credential_exposure: "Credenziale esposta",
	identity_exposure: "Identità esposta",
	domain_exposure: "Dominio esposto",
	domain_leak: "Dominio in un leak",
	intelx_exposure_signal: "Segnale di esposizione",
};

const SEVERITY: Record<string, { label: string; variant: "destructive" | "secondary" | "outline" }> = {
	critical: { label: "Critica", variant: "destructive" },
	high: { label: "Alta", variant: "destructive" },
	medium: { label: "Media", variant: "secondary" },
	low: { label: "Bassa", variant: "outline" },
	info: { label: "Info", variant: "outline" },
};

const fmtDate = (v: string | null) => {
	if (!v) return "—";
	const d = new Date(v);
	return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("it-IT");
};

function useDebounced<T>(value: T, ms = 400): T {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const t = setTimeout(() => setDebounced(value), ms);
		return () => clearTimeout(t);
	}, [value, ms]);
	return debounced;
}

interface Props {
	companyId: string;
	groupId?: string | null;
}

export function DarkRiskFindingsList({ companyId, groupId }: Props) {
	const { hasCapability } = useCapabilities();
	const canAck = hasCapability("darkrisk.findings.ack");

	const [q, setQ] = useState("");
	const [type, setType] = useState("all");
	const [severity, setSeverity] = useState("all");
	const [ack, setAck] = useState("all");
	const [dateField, setDateField] = useState("leak");
	const [dateFrom, setDateFrom] = useState("");
	const [dateTo, setDateTo] = useState("");
	const [page, setPage] = useState(1);
	const [ackTarget, setAckTarget] = useState<AckTarget | null>(null);
	const [historyTarget, setHistoryTarget] = useState<{ findingId: string; title: string } | null>(null);

	const qDebounced = useDebounced(q);

	const filters: Record<string, string | number> = { per_page: PER_PAGE, page };
	if (qDebounced.trim()) filters.q = qDebounced.trim();
	if (type !== "all") filters["finding_type[]"] = type;
	if (severity !== "all") filters["severity[]"] = severity;
	if (ack !== "all") filters.ack = ack;
	if (dateFrom || dateTo) filters.date_field = dateField;
	if (dateFrom) filters.date_from = dateFrom;
	if (dateTo) filters.date_to = dateTo;

	const filterKey = JSON.stringify({ ...filters, page: undefined });
	useEffect(() => setPage(1), [filterKey]);

	const query = useQuery({
		queryKey: ["darkrisk-findings", companyId, groupId, filters],
		queryFn: () => darkRiskGateway.getFindings(companyId, groupId, filters),
		placeholderData: keepPreviousData,
	});

	const rows = query.data?.rows ?? [];

	return (
		<Card>
			<CardHeader>
				<CardTitle>Evidenze</CardTitle>
				<CardDescription>
					Le evidenze rilevate sul perimetro, con la data del leak dichiarata dalla fonte.
					{canAck && " Riconosci quelle che hai già preso in carico: restano registrati chi e quando."}
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid gap-3 rounded-lg border p-3 md:grid-cols-3 lg:grid-cols-6">
					<div className="space-y-1 lg:col-span-2">
						<Label htmlFor="dr-q" className="text-xs">Cerca</Label>
						<Input id="dr-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="titolo dell'evidenza" />
					</div>
					<div className="space-y-1">
						<Label className="text-xs">Tipo</Label>
						<Select value={type} onValueChange={setType}>
							<SelectTrigger><SelectValue /></SelectTrigger>
							<SelectContent>
								<SelectItem value="all">Tutti</SelectItem>
								{Object.entries(FINDING_TYPE_LABEL).map(([k, label]) => (
									<SelectItem key={k} value={k}>{label}</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-1">
						<Label className="text-xs">Gravità</Label>
						<Select value={severity} onValueChange={setSeverity}>
							<SelectTrigger><SelectValue /></SelectTrigger>
							<SelectContent>
								<SelectItem value="all">Tutte</SelectItem>
								{Object.entries(SEVERITY).map(([k, s]) => (
									<SelectItem key={k} value={k}>{s.label}</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-1 lg:col-span-2">
						<Label className="text-xs">Riconoscimento</Label>
						<Select value={ack} onValueChange={setAck}>
							<SelectTrigger><SelectValue /></SelectTrigger>
							<SelectContent>
								<SelectItem value="all">Tutte</SelectItem>
								<SelectItem value="exclude">Da gestire</SelectItem>
								<SelectItem value="only">Riconosciute dal cliente</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-1">
						<Label className="text-xs">Data</Label>
						<Select value={dateField} onValueChange={setDateField}>
							<SelectTrigger><SelectValue /></SelectTrigger>
							<SelectContent>
								<SelectItem value="leak">del leak</SelectItem>
								<SelectItem value="first_seen">prima osservazione</SelectItem>
								<SelectItem value="last_seen">ultima osservazione</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-1">
						<Label htmlFor="dr-from" className="text-xs">Dal</Label>
						<Input id="dr-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
					</div>
					<div className="space-y-1">
						<Label htmlFor="dr-to" className="text-xs">Al</Label>
						<Input id="dr-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
					</div>
				</div>

				{query.isLoading ? (
					<Loader2 className="h-4 w-4 animate-spin" />
				) : rows.length === 0 ? (
					<p className="text-sm text-muted-foreground">Nessuna evidenza corrispondente ai filtri.</p>
				) : (
					<>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Evidenza</TableHead>
									<TableHead>Gravità</TableHead>
									<TableHead>Asset</TableHead>
									<TableHead>Data del leak</TableHead>
									<TableHead>Osservata</TableHead>
									<TableHead>Riconoscimento</TableHead>
									<TableHead className="text-right">Azioni</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{rows.map((f) => (
									<FindingRow
										key={f.id}
										finding={f}
										canAck={canAck}
										onAck={() => setAckTarget({ findingId: f.id, title: f.title, acknowledged: f.acknowledged })}
										onHistory={() => setHistoryTarget({ findingId: f.id, title: f.title })}
									/>
								))}
							</TableBody>
						</Table>
						<div className="flex items-center justify-between text-sm text-muted-foreground">
							<span>
								{query.data?.total ?? 0} evidenze · pagina {query.data?.page ?? 1} di {query.data?.lastPage ?? 1}
								{query.isFetching && <Loader2 className="ml-2 inline h-3 w-3 animate-spin" />}
							</span>
							<div className="flex gap-2">
								<Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Precedenti</Button>
								<Button size="sm" variant="outline" disabled={page >= (query.data?.lastPage ?? 1)} onClick={() => setPage(page + 1)}>Successive</Button>
							</div>
						</div>
					</>
				)}

				<AckDialog
					companyId={companyId}
					groupId={groupId}
					target={ackTarget}
					onClose={() => setAckTarget(null)}
					onDone={() => void query.refetch()}
				/>
				<AckHistoryDialog companyId={companyId} groupId={groupId} target={historyTarget} onClose={() => setHistoryTarget(null)} />
			</CardContent>
		</Card>
	);
}

function FindingRow({
	finding: f,
	canAck,
	onAck,
	onHistory,
}: {
	finding: DarkRiskFinding;
	canAck: boolean;
	onAck: () => void;
	onHistory: () => void;
}) {
	const sev = SEVERITY[f.severity] ?? SEVERITY.info;

	return (
		<TableRow className="align-top">
			<TableCell className="max-w-sm">
				<div className="font-medium">{f.title}</div>
				<div className="text-xs text-muted-foreground">{FINDING_TYPE_LABEL[f.findingType] ?? f.findingType}</div>
			</TableCell>
			<TableCell><Badge variant={sev.variant}>{sev.label}</Badge></TableCell>
			<TableCell className="text-xs">{f.asset ?? "—"}</TableCell>
			<TableCell className="text-xs">{fmtDate(f.leakDate)}</TableCell>
			<TableCell className="text-xs">{fmtDate(f.firstSeenAt)} → {fmtDate(f.lastSeenAt)}</TableCell>
			<TableCell className="text-xs">
				{f.acknowledged ? (
					<div>
						<Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Riconosciuta</Badge>
						<div className="mt-1 text-muted-foreground">
							{f.acknowledgedBy ?? "—"} · {fmtDate(f.acknowledgedAt)}
						</div>
						{f.acknowledgementNote && <div className="mt-1 italic">{f.acknowledgementNote}</div>}
					</div>
				) : (
					<span className="text-muted-foreground">Da gestire</span>
				)}
			</TableCell>
			<TableCell className="text-right">
				<div className="flex justify-end gap-1">
					{canAck && (
						<Button size="sm" variant={f.acknowledged ? "ghost" : "outline"} onClick={onAck}>
							{f.acknowledged ? "Revoca" : "Riconosci"}
						</Button>
					)}
					<Button size="sm" variant="ghost" onClick={onHistory} aria-label="Storico">
						<History className="h-4 w-4" />
					</Button>
				</div>
			</TableCell>
		</TableRow>
	);
}
