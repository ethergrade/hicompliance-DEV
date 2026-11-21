// HiDetect: detection XDR degli ultimi 30 giorni del cliente, dall'ultimo dato
// letto dal backend (DetectDashboard). Casi MDR, tempo di risposta, stato delle
// detection e stato per endpoint si mostrano solo se presenti: la fonte di oggi
// non li fornisce, e non si riempiono con numeri d'esempio.
import React from "react";
import { insidePercentLabel, PieLegend } from '@/components/charts/pieLabels';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, AlertTriangle, Bell, Eye, Monitor, Shield, Target, TrendingUp, Zap } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DemoDataBadge } from "./DemoDataBadge";
import { RiskScoreCard } from "./RiskScoreCard";
import { ServiceNotConnected } from "./ServiceNotConnected";
import { TablePager, usePager } from "./TablePager";
import { useDetectDashboard } from "@/hooks/useDetect";
import { cn } from "@/lib/utils";

const SEVERITY = {
	Critical: { label: "Critica", color: "#ef4444", badge: "bg-red-500/20 text-red-500" },
	High: { label: "Alta", color: "#f97316", badge: "bg-orange-500/20 text-orange-500" },
	Medium: { label: "Media", color: "#eab308", badge: "bg-yellow-500/20 text-yellow-500" },
	Low: { label: "Bassa", color: "#22c55e", badge: "bg-green-500/20 text-green-500" },
} as const;
const LABEL_TO_KEY: Record<string, keyof typeof SEVERITY> = { Critico: "Critical", Critica: "Critical", Alto: "High", Alta: "High", Medio: "Medium", Media: "Medium", Basso: "Low", Bassa: "Low" };

const STATUS_LABEL: Record<string, string> = { New: "Nuova", Investigating: "In analisi", Resolved: "Risolta", Escalated: "Scalata" };

const fmtDate = (v: string | null | undefined) => {
	if (!v) return "—";
	const d = new Date(v);
	return Number.isNaN(d.getTime()) ? v : d.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
};

const tooltipStyle = { backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" };

export const HiDetectDashboard: React.FC = () => {
	const { data, loading, isMock, error } = useDetectDashboard();
	const alertPager = usePager(data?.realtimeAlerts ?? [], data?.fetchedAt);

	if (!data) return <ServiceNotConnected service="HiDetect" loading={loading} detail={error} />;

	const { overview, threatSeverityData, weeklyThreatTrend, detectionCategories, realtimeAlerts, endpointStatus, socActivity, detectionRules, hourlyActivity } = data;
	const windowDays = overview.windowDays ?? 30;
	const pie = threatSeverityData.map((s) => {
		const key = (s.key as keyof typeof SEVERITY) ?? LABEL_TO_KEY[s.name] ?? "Low";
		return { ...s, color: s.color ?? SEVERITY[key]?.color ?? "#64748b" };
	});
	const showStatus = realtimeAlerts.some((a) => a.status);
	const coverage = overview.totalEndpoints > 0 ? Math.round((overview.monitoredEndpoints / overview.totalEndpoints) * 100) : 0;
	const cov = coverage >= 90 ? { level: "Buono", color: "green" as const, ring: "#22c55e" } : coverage >= 70 ? { level: "Moderato", color: "yellow" as const, ring: "#eab308" } : { level: "Critico", color: "red" as const, ring: "#ef4444" };

	const kpis = [
		{ label: "Endpoint totali", value: overview.totalEndpoints, icon: Monitor, tone: "text-primary" },
		{ label: "Monitorati", value: overview.monitoredEndpoints, icon: Eye, tone: "text-green-500" },
		{ label: `Detection (${windowDays}gg)`, value: overview.threatsDetected, icon: Target, tone: "text-orange-500" },
		...(overview.last7Days !== undefined ? [{ label: "Ultimi 7 giorni", value: overview.last7Days, icon: TrendingUp, tone: "text-yellow-500" }] : []),
		{ label: "Oggi", value: overview.alertsToday, icon: Bell, tone: "text-red-500" },
		...(overview.criticalOrHigh !== undefined ? [{ label: "Alte o critiche", value: overview.criticalOrHigh, icon: AlertTriangle, tone: "text-red-500" }] : []),
		...(overview.avgResponseTime ? [{ label: "Tempo risposta", value: overview.avgResponseTime, icon: Zap, tone: "text-cyan-500" }] : []),
		...(overview.coverageHours ? [{ label: "Copertura", value: overview.coverageHours, icon: Shield, tone: "text-primary" }] : []),
	];

	return (
		<div className="space-y-6">
			<div>
				<div className="flex flex-wrap items-center gap-3">
					<h1 className="text-2xl font-bold">HiDetect - Threat Detection</h1>
					<DemoDataBadge show={isMock} />
					{data.fetchedAt && <span className="text-sm text-muted-foreground">Aggiornato alle {fmtDate(data.fetchedAt)}</span>}
				</div>
				<p className="text-muted-foreground">Detection su endpoint, firewall, posta e rete degli ultimi {windowDays} giorni</p>
			</div>
			{(data.stale || data.lastError) && (
				<div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
					{data.lastError
						? `Ultima lettura non riuscita (${fmtDate(data.lastError.at)}): ${data.lastError.message} Sono mostrati gli ultimi dati validi.`
						: "I dati non sono aggiornati: l'ultima lettura riuscita risale a oltre 30 minuti fa."}
				</div>
			)}

			<div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
				{kpis.map((k) => (
					<Card key={k.label} className="border-border">
						<CardContent className="p-4">
							<div className="flex items-center justify-between">
								<div>
									<p className="text-xs text-muted-foreground">{k.label}</p>
									<p className={cn("text-2xl font-bold", k.tone === "text-primary" ? "" : k.tone)}>{k.value}</p>
								</div>
								<k.icon className={cn("h-8 w-8", k.tone)} />
							</div>
						</CardContent>
					</Card>
				))}
			</div>

			<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
				<RiskScoreCard title="Copertura XDR degli endpoint" level={cov.level} levelColor={cov.color} score={coverage} ringColor={cov.ring} />
				<Card className="border-border">
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-base">
							<AlertTriangle className="h-4 w-4" />
							Distribuzione per gravità
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="h-56">
							<ResponsiveContainer width="100%" height="100%">
								<PieChart>
									<Pie data={pie.filter((p) => p.value > 0)} cx="50%" cy="50%" innerRadius="55%" outerRadius="92%" paddingAngle={2} dataKey="value" label={insidePercentLabel()} labelLine={false}>
										{pie
											.filter((p) => p.value > 0)
											.map((entry, index) => (
												<Cell key={`cell-${index}`} fill={entry.color} />
											))}
									</Pie>
									<Tooltip />
								</PieChart>
							</ResponsiveContainer>
						</div>
						<PieLegend items={pie.filter((p) => p.value > 0)} />
					</CardContent>
				</Card>
			</div>

			<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
				<Card className="border-border">
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-base">
							<TrendingUp className="h-4 w-4" />
							Ultimi 7 giorni
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="h-64">
							<ResponsiveContainer width="100%" height="100%">
								<BarChart data={weeklyThreatTrend}>
									<CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
									<XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} />
									<YAxis allowDecimals={false} stroke="hsl(var(--muted-foreground))" fontSize={12} />
									<Tooltip contentStyle={tooltipStyle} />
									<Legend />
									<Bar dataKey="critical" stackId="s" fill={SEVERITY.Critical.color} name="Critiche" />
									<Bar dataKey="high" stackId="s" fill={SEVERITY.High.color} name="Alte" />
									<Bar dataKey="medium" stackId="s" fill={SEVERITY.Medium.color} name="Medie" />
									<Bar dataKey="low" stackId="s" fill={SEVERITY.Low.color} name="Basse" />
								</BarChart>
							</ResponsiveContainer>
						</div>
					</CardContent>
				</Card>

				<Card className="border-border">
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-base">
							<Activity className="h-4 w-4" />
							Detection per ora del giorno ({windowDays} giorni)
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="h-64">
							<ResponsiveContainer width="100%" height="100%">
								<LineChart data={hourlyActivity}>
									<CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
									<XAxis dataKey="hour" stroke="hsl(var(--muted-foreground))" fontSize={10} interval={2} />
									<YAxis allowDecimals={false} stroke="hsl(var(--muted-foreground))" fontSize={12} />
									<Tooltip contentStyle={tooltipStyle} />
									<Line type="monotone" dataKey="alerts" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Detection" />
									{hourlyActivity.some((h) => h.resolved !== null && h.resolved !== undefined) && (
										<Line type="monotone" dataKey="resolved" stroke="#22c55e" strokeWidth={2} dot={false} name="Risolte" />
									)}
								</LineChart>
							</ResponsiveContainer>
						</div>
					</CardContent>
				</Card>
			</div>

			<Card className="border-border">
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base">
						<Target className="h-4 w-4" />
						Tattiche MITRE ATT&CK
					</CardTitle>
					<p className="text-sm text-muted-foreground">Detection per tattica; la variazione confronta gli ultimi 7 giorni con i 7 precedenti.</p>
				</CardHeader>
				<CardContent>
					{detectionCategories.length === 0 ? (
						<p className="text-sm text-muted-foreground">Nessuna detection nel periodo.</p>
					) : (
						<div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
							{detectionCategories.map((c) => (
								<div key={c.category} className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
									<div>
										<p className="text-sm font-medium">{c.category}</p>
										<p className="text-xs text-muted-foreground">
											{c.change === null ? "nessun confronto" : `${c.change > 0 ? "+" : ""}${c.change}% sulla settimana prima`}
										</p>
									</div>
									<p className="text-2xl font-bold text-primary">{c.count}</p>
								</div>
							))}
						</div>
					)}
				</CardContent>
			</Card>

			<Card className="border-border">
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base">
						<Bell className="h-4 w-4" />
						Detection
					</CardTitle>
					<p className="text-sm text-muted-foreground">Dalla più recente.</p>
				</CardHeader>
				<CardContent className="space-y-3">
					{realtimeAlerts.length === 0 ? (
						<p className="text-sm text-muted-foreground">Nessuna detection nel periodo.</p>
					) : (
						<>
							<TablePager p={alertPager} />
							<div className="overflow-x-auto">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Ora</TableHead>
											<TableHead>Gravità</TableHead>
											<TableHead>Rilevata da</TableHead>
											<TableHead>Regola</TableHead>
											<TableHead>Tattica / tecnica</TableHead>
											<TableHead>Tipo</TableHead>
											{showStatus && <TableHead>Stato</TableHead>}
										</TableRow>
									</TableHeader>
									<TableBody>
										{alertPager.visible.map((a) => {
											const sev = SEVERITY[a.severity] ?? SEVERITY.Low;
											return (
												<TableRow key={a.id}>
													<TableCell className="whitespace-nowrap text-sm text-muted-foreground">{fmtDate(a.timestamp)}</TableCell>
													<TableCell>
														<Badge className={sev.badge}>{sev.label}</Badge>
													</TableCell>
													<TableCell>{a.source ?? "—"}</TableCell>
													<TableCell className="text-sm">{a.description ?? a.rule ?? "—"}</TableCell>
													<TableCell className="text-sm">
														{a.tactic ?? "—"}
														{a.technique && <p className="text-xs text-muted-foreground">{a.technique}</p>}
													</TableCell>
													<TableCell className="text-sm">{a.type}</TableCell>
													{showStatus && <TableCell>{a.status ? STATUS_LABEL[a.status] ?? a.status : "—"}</TableCell>}
												</TableRow>
											);
										})}
									</TableBody>
								</Table>
							</div>
							{alertPager.total > alertPager.size && <TablePager p={alertPager} />}
						</>
					)}
				</CardContent>
			</Card>

			{detectionRules.length > 0 && (
				<Card className="border-border">
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-base">
							<Shield className="h-4 w-4" />
							Regole che hanno generato detection
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-5">
							{detectionRules.map((rule, index) => (
								<div key={index} className="rounded-lg border border-border bg-muted/30 p-4 text-center">
									<p className="text-2xl font-bold text-primary">{rule.triggers}</p>
									<p className="mt-1 text-sm font-medium">{rule.rule}</p>
									<p className="mt-1 text-xs text-muted-foreground">{[rule.source, rule.category].filter(Boolean).join(" · ")}</p>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			)}

			{(endpointStatus.length > 0 || socActivity.length > 0) && (
				<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
					{endpointStatus.length > 0 && (
						<Card className="border-border">
							<CardHeader>
								<CardTitle className="flex items-center gap-2 text-base">
									<Monitor className="h-4 w-4" />
									Endpoint con detection
								</CardTitle>
							</CardHeader>
							<CardContent className="overflow-x-auto">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Nome</TableHead>
											<TableHead>IP</TableHead>
											<TableHead>Stato</TableHead>
											<TableHead>Rischio</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{endpointStatus.map((e) => (
											<TableRow key={e.id}>
												<TableCell className="font-mono text-xs">{e.name}</TableCell>
												<TableCell className="text-xs text-muted-foreground">{e.ip}</TableCell>
												<TableCell>{e.status}</TableCell>
												<TableCell>{e.riskScore}</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</CardContent>
						</Card>
					)}
					{socActivity.length > 0 && (
						<Card className="border-border">
							<CardHeader>
								<CardTitle className="flex items-center gap-2 text-base">
									<Activity className="h-4 w-4" />
									Attività SOC
								</CardTitle>
							</CardHeader>
							<CardContent className="space-y-3">
								{socActivity.map((a) => (
									<div key={a.id} className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3">
										<div className="w-24 font-mono text-xs text-muted-foreground">{a.timestamp}</div>
										<div className="flex-1">
											<p className="text-sm font-medium">{a.action}</p>
											<p className="text-xs text-muted-foreground">{a.target}</p>
										</div>
										<Badge variant="outline" className="text-xs">
											{a.analyst}
										</Badge>
									</div>
								))}
							</CardContent>
						</Card>
					)}
				</div>
			)}
		</div>
	);
};
