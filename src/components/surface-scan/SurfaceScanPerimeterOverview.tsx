// Copertura del perimetro e andamento mese per mese: quanto del perimetro
// dichiarato è stato davvero scansionato negli ultimi 30 giorni, la postura che
// ne risulta e come è cambiata rispetto al mese prima. Le regole sono quelle
// del report mensile (backend surface-scan360/perimeter-overview).
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { useClientOrganization } from "@/hooks/useClientOrganization";
import { surfaceScan360Api, type PerimeterOverview } from "@/lib/api/surface-scan360";

const SEVERITIES: Array<[string, string, string]> = [
	["critical", "Critici", "text-red-500"],
	["high", "Alti", "text-orange-500"],
	["medium", "Medi", "text-amber-500"],
	["low", "Bassi", "text-blue-500"],
];

const fmtDate = (v: string | null) => {
	if (!v) return "—";
	const d = new Date(v);
	return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("it-IT");
};

const monthLabel = (key: string) => {
	const [y, m] = key.split("-").map(Number);
	if (!y || !m) return key;
	return new Date(y, m - 1, 1).toLocaleDateString("it-IT", { month: "short", year: "2-digit" });
};

const signed = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n > 0 ? `+${n}` : String(n));

export const SurfaceScanPerimeterOverview: React.FC = () => {
	const { organizationId, groupId } = useClientOrganization();

	const query = useQuery({
		queryKey: ["surfacescan-perimeter-overview", organizationId, groupId],
		enabled: Boolean(organizationId),
		queryFn: () => surfaceScan360Api.getPerimeterOverview(organizationId!, groupId),
	});

	if (!organizationId) return null;
	if (query.isLoading) {
		return (
			<div className="flex items-center gap-2 text-sm text-muted-foreground">
				<Loader2 className="h-4 w-4 animate-spin" /> Calcolo della copertura del perimetro…
			</div>
		);
	}
	if (!query.data) return null;

	return (
		<div className="grid gap-4 lg:grid-cols-3">
			<CoverageCard data={query.data} />
			<PostureCard data={query.data} />
			<TrendCard data={query.data} />
		</div>
	);
};

function CoverageCard({ data }: { data: PerimeterOverview }) {
	const { coverage, perimeter } = data;
	const sufficient = coverage.status === "sufficient";
	const pct = coverage.scope_total > 0 ? Math.round((coverage.scope_covered / coverage.scope_total) * 100) : 0;

	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="flex items-center justify-between text-base">
					Copertura perimetro
					<Badge variant={sufficient ? "default" : "destructive"} className="gap-1">
						{sufficient ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
						{sufficient ? "Sufficiente" : "Insufficiente"}
					</Badge>
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-3">
				<div className="flex justify-between text-sm">
					<span>Voci di perimetro scansionate</span>
					<strong>
						{coverage.scope_covered} / {coverage.scope_total}
					</strong>
				</div>
				<Progress value={pct} />
				<div className="grid grid-cols-3 gap-2 text-center">
					<div>
						<p className="text-xl font-semibold">{perimeter.domains}</p>
						<p className="text-xs text-muted-foreground">Domini</p>
					</div>
					<div>
						<p className="text-xl font-semibold">{perimeter.subdomains}</p>
						<p className="text-xs text-muted-foreground">Sottodomini</p>
					</div>
					<div>
						<p className="text-xl font-semibold">{perimeter.ips}</p>
						<p className="text-xs text-muted-foreground">IP</p>
					</div>
				</div>
				<p className="text-xs text-muted-foreground">
					Ultima scansione utile: {fmtDate(coverage.last_usable_scan_at)} · ultimi {data.window.days} giorni
				</p>
				{!sufficient && (
					<div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
						{coverage.reasons.map((r) => (
							<div key={r}>{r}</div>
						))}
						{coverage.uncovered.length > 0 && <div className="mt-1">Non scansionati: {coverage.uncovered.join(", ")}</div>}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

function PostureCard({ data }: { data: PerimeterOverview }) {
	const { score, open_findings: open } = data;

	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="text-base">Postura e finding aperti</CardTitle>
			</CardHeader>
			<CardContent className="space-y-3">
				{score.determinable ? (
					<div className="flex items-baseline gap-3">
						<span className="text-3xl font-bold">{score.posture_score}/100</span>
						<Badge variant="outline">Rischio {score.risk_level}</Badge>
					</div>
				) : (
					<div className="text-sm">
						<span className="font-semibold">Punteggio non determinabile</span>
						<p className="text-xs text-muted-foreground">{score.reason}</p>
					</div>
				)}
				<div className="text-sm">
					<strong>{open.total}</strong> finding aperti
				</div>
				<div className="grid grid-cols-4 gap-2 text-center">
					{SEVERITIES.map(([key, label, color]) => (
						<div key={key}>
							<p className={`text-lg font-semibold ${color}`}>{open.by_severity[key] ?? 0}</p>
							<p className="text-xs text-muted-foreground">{label}</p>
						</div>
					))}
				</div>
				<p className="text-xs text-muted-foreground">
					Calcolati su tutte le porte e i finding osservati negli ultimi {data.window.days} giorni.
				</p>
			</CardContent>
		</Card>
	);
}

function TrendCard({ data }: { data: PerimeterOverview }) {
	const trend = data.trend;
	const cmp = data.last_month?.comparison;
	const maxFindings = Math.max(1, ...trend.map((t) => t.open_findings));

	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="text-base">Andamento mensile</CardTitle>
			</CardHeader>
			<CardContent className="space-y-3">
				{trend.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						L'andamento compare dopo il primo report mensile nel formato nuovo.
					</p>
				) : (
					<div className="flex h-28 items-end gap-2" aria-label="Finding aperti a fine mese">
						{trend.map((t) => (
							<div key={t.month_key} className="flex flex-1 flex-col items-center gap-1">
								<span className="text-[10px] text-muted-foreground">
									{t.coverage === "insufficient" ? "n/d" : t.posture_score ?? "—"}
								</span>
								<div className="flex h-16 w-full items-end">
									<div
										className={`w-full rounded-sm ${t.coverage === "insufficient" ? "bg-muted" : "bg-primary/60"}`}
										style={{ height: `${Math.max(4, (t.open_findings / maxFindings) * 100)}%` }}
										title={`${t.open_findings} finding aperti`}
									/>
								</div>
								<span className="text-[10px] text-muted-foreground">{monthLabel(t.month_key)}</span>
							</div>
						))}
					</div>
				)}
				{cmp?.available ? (
					<div className="space-y-1 text-xs">
						<div className="font-medium">
							{monthLabel(data.last_month!.month_key)} rispetto a {cmp.previous_month_key ? monthLabel(cmp.previous_month_key) : "—"}
						</div>
						<div>
							Finding aperti: <strong>{signed(cmp.open_findings_delta)}</strong> · Punteggio:{" "}
							<strong>{signed(cmp.score_delta)}</strong>
						</div>
						<div className="text-muted-foreground">
							{SEVERITIES.map(([key, label]) => `${label} ${signed(cmp.by_severity_delta?.[key] ?? 0)}`).join(" · ")}
						</div>
					</div>
				) : (
					data.last_month && <p className="text-xs text-muted-foreground">Nessun mese precedente confrontabile.</p>
				)}
				<p className="text-[11px] text-muted-foreground">Barre: finding aperti a fine mese. Numeri: postura.</p>
			</CardContent>
		</Card>
	);
}
