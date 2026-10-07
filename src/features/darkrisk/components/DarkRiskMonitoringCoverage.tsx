// Copertura del monitoraggio DarkRisk: perimetro dichiarato, scansioni recenti
// e copertura dei report mensili. Dice se i numeri della pagina poggiano su un
// monitoraggio attivo o su scansioni vecchie.
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { MonitoringCoverage } from "../domain/contracts";

const KIND_LABEL: Record<string, string> = { domain: "domini", single: "IP", range: "range IP" };

const monthLabel = (key: string) => {
	const [y, m] = key.split("-").map(Number);
	if (!y || !m) return key;
	return new Date(y, m - 1, 1).toLocaleDateString("it-IT", { month: "short", year: "2-digit" });
};

export function DarkRiskMonitoringCoverage({ coverage }: { coverage: MonitoringCoverage | null | undefined }) {
	if (!coverage) return null;
	const sufficient = coverage.status === "sufficient";
	const kinds = Object.entries(coverage.scopeByKind)
		.map(([k, n]) => `${n} ${KIND_LABEL[k] ?? k}`)
		.join(" · ");

	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="flex items-center justify-between text-base">
					Copertura del monitoraggio
					<Badge variant={sufficient ? "default" : "destructive"} className="gap-1">
						{sufficient ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
						{sufficient ? "Attivo" : "Insufficiente"}
					</Badge>
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-3">
				<div className="grid grid-cols-2 gap-3 text-center md:grid-cols-4">
					<div>
						<p className="text-xl font-semibold">{coverage.scopeEntries}</p>
						<p className="text-xs text-muted-foreground">Voci di perimetro</p>
					</div>
					<div>
						<p className="text-xl font-semibold">{coverage.selectors}</p>
						<p className="text-xs text-muted-foreground">Selettori monitorati</p>
					</div>
					<div>
						<p className="text-xl font-semibold">{coverage.runsLast30Days}</p>
						<p className="text-xs text-muted-foreground">Scansioni negli ultimi 30 giorni</p>
					</div>
					<div>
						<p className="text-xl font-semibold">
							{coverage.daysSinceLastRun === null ? "—" : `${coverage.daysSinceLastRun} gg`}
						</p>
						<p className="text-xs text-muted-foreground">Dall'ultima scansione</p>
					</div>
				</div>
				{kinds && <p className="text-xs text-muted-foreground">Perimetro: {kinds}</p>}
				{!sufficient && coverage.reasons.length > 0 && (
					<div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
						{coverage.reasons.map((r) => (
							<div key={r}>{r}</div>
						))}
					</div>
				)}
				{coverage.monthly.length > 0 && (
					<div className="flex flex-wrap gap-2 text-xs">
						<span className="text-muted-foreground">Report mensili:</span>
						{coverage.monthly.map((m) => (
							<Badge key={m.period} variant={m.status === "insufficient" ? "destructive" : "outline"} className="font-normal">
								{monthLabel(m.period)}: {m.status === "insufficient" ? "copertura insufficiente" : `${m.findings ?? 0} evidenze`}
							</Badge>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
