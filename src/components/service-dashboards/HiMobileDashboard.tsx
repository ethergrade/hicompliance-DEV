// HiMobile: inventario e conformità dei dispositivi mobili del cliente,
// dall'ultimo dato letto dal backend (MobileDashboard). Andamento delle
// registrazioni, policy, app, batteria e cifratura si mostrano solo se presenti
// (la sorgente oggi non li fornisce): nessun numero d'esempio ai clienti.
import React, { useMemo, useState } from "react";
import { insidePercentLabel, PieLegend } from '@/components/charts/pieLabels';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, AppWindow, CheckCircle, Lock, RefreshCw, Search, Settings, Shield, Smartphone, Users, XCircle } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DemoDataBadge } from "./DemoDataBadge";
import { RiskScoreCard } from "./RiskScoreCard";
import { ServiceNotConnected } from "./ServiceNotConnected";
import { TablePager, usePager } from "./TablePager";
import { useMobileDashboard } from "@/hooks/useMobile";
import { cn } from "@/lib/utils";

const PLATFORM_COLORS: Record<string, string> = { iOS: "#3b82f6", Android: "#22c55e", macOS: "#a855f7", Windows: "#f59e0b" };
const FALLBACK_COLORS = ["#06b6d4", "#ef4444", "#64748b", "#eab308"];

const severityColors: Record<string, string> = {
	Critico: "bg-red-500/20 text-red-500",
	Alto: "bg-orange-500/20 text-orange-500",
	Medio: "bg-yellow-500/20 text-yellow-500",
	Basso: "bg-green-500/20 text-green-500",
};

const fmtDate = (v: string | null | undefined) => {
	if (!v) return "—";
	const d = new Date(v);
	return Number.isNaN(d.getTime()) ? v : d.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
};

const tooltipStyle = { backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" };

export const HiMobileDashboard: React.FC = () => {
	const { data, loading, isMock, error } = useMobileDashboard();
	const [search, setSearch] = useState("");

	const inventory = useMemo(() => data?.deviceInventory ?? [], [data]);
	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		return q ? inventory.filter((d) => [d.deviceName, d.user, d.os].some((v) => (v ?? "").toLowerCase().includes(q))) : inventory;
	}, [inventory, search]);
	const pager = usePager(filtered, search);
	const eventPager = usePager(data?.securityEvents ?? [], data?.fetchedAt);

	if (!data) return <ServiceNotConnected service="HiMobile" loading={loading} detail={error} />;

	const { overview, osDistribution, complianceData, enrollmentTrend, securityPolicies, appInventory, securityEvents } = data;
	const unavailable = new Set(data.unavailable ?? []);
	const showBattery = !unavailable.has("battery") && inventory.some((d) => d.battery !== null);
	const showEncryption = !unavailable.has("encryption") && inventory.some((d) => d.encrypted !== null);
	const showModel = !unavailable.has("model") && inventory.some((d) => d.model);
	const complianceRate = overview.totalDevices > 0 ? Math.round((overview.compliantDevices / overview.totalDevices) * 100) : 0;
	const enrolledRate = overview.totalDevices > 0 ? Math.round((overview.enrolledDevices / overview.totalDevices) * 100) : 0;
	const level = (s: number) =>
		s >= 90 ? { level: "Buono", color: "green" as const, ring: "#22c55e" } : s >= 70 ? { level: "Moderato", color: "yellow" as const, ring: "#eab308" } : { level: "Critico", color: "red" as const, ring: "#ef4444" };
	const c = level(complianceRate);
	const e = level(enrolledRate);
	const pie = osDistribution.map((o, i) => ({ ...o, color: o.color ?? PLATFORM_COLORS[o.name] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length] }));

	const kpis = [
		{ label: "Dispositivi totali", value: overview.totalDevices, icon: Smartphone, tone: "text-primary" },
		{ label: "Registrati", value: overview.enrolledDevices, icon: CheckCircle, tone: "text-green-500" },
		{ label: "Conformi", value: overview.compliantDevices, icon: Shield, tone: "text-green-500" },
		{ label: "Non conformi", value: overview.nonCompliantDevices, icon: AlertTriangle, tone: "text-red-500" },
		{ label: "iOS", value: overview.iOSDevices, icon: Smartphone, tone: "text-blue-500" },
		{ label: "Android", value: overview.androidDevices, icon: Smartphone, tone: "text-green-500" },
		{ label: "In registrazione", value: overview.pendingEnrollment, icon: RefreshCw, tone: "text-yellow-500" },
	];

	return (
		<div className="space-y-6">
			<div>
				<div className="flex flex-wrap items-center gap-3">
					<h1 className="text-2xl font-bold">HiMobile - Mobile Device Management</h1>
					<DemoDataBadge show={isMock} />
					{data.fetchedAt && <span className="text-sm text-muted-foreground">Aggiornato alle {fmtDate(data.fetchedAt)}</span>}
				</div>
				<p className="text-muted-foreground">Inventario e conformità dei dispositivi mobili aziendali</p>
			</div>
			{(data.stale || data.lastError) && (
				<div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
					{data.lastError
						? `Ultima lettura non riuscita (${fmtDate(data.lastError.at)}): ${data.lastError.message} Sono mostrati gli ultimi dati validi.`
						: "I dati non sono aggiornati: l'ultima lettura riuscita risale a oltre 30 minuti fa."}
				</div>
			)}

			<div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-7">
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
				<RiskScoreCard title="Compliance Rate" level={c.level} levelColor={c.color} score={complianceRate} ringColor={c.ring} />
				<RiskScoreCard title="Dispositivi registrati" level={e.level} levelColor={e.color} score={enrolledRate} ringColor={e.ring} />
			</div>

			<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
				<Card className="border-border">
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-base">
							<Smartphone className="h-4 w-4" />
							Distribuzione sistemi operativi
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="h-64">
							<ResponsiveContainer width="100%" height="100%">
								<PieChart>
									<Pie data={pie} cx="50%" cy="50%" innerRadius="55%" outerRadius="92%" paddingAngle={2} dataKey="value" label={insidePercentLabel()} labelLine={false}>
										{pie.map((entry, index) => (
											<Cell key={`cell-${index}`} fill={entry.color} />
										))}
									</Pie>
									<Tooltip />
								</PieChart>
							</ResponsiveContainer>
						</div>
						<PieLegend items={pie} />
					</CardContent>
				</Card>

				<Card className="border-border">
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-base">
							<Shield className="h-4 w-4" />
							Conformità per piattaforma
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="h-64">
							<ResponsiveContainer width="100%" height="100%">
								<BarChart data={complianceData} layout="vertical">
									<CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
									<XAxis type="number" allowDecimals={false} stroke="hsl(var(--muted-foreground))" fontSize={12} />
									<YAxis type="category" dataKey="category" stroke="hsl(var(--muted-foreground))" fontSize={12} width={100} />
									<Tooltip contentStyle={tooltipStyle} />
									<Legend />
									<Bar dataKey="compliant" fill="#22c55e" name="Conformi" stackId="a" />
									<Bar dataKey="nonCompliant" fill="#ef4444" name="Non conformi" stackId="a" />
								</BarChart>
							</ResponsiveContainer>
						</div>
					</CardContent>
				</Card>
			</div>

			{enrollmentTrend.length > 0 && (
				<Card className="border-border">
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-base">
							<Users className="h-4 w-4" />
							Trend registrazioni
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="h-64">
							<ResponsiveContainer width="100%" height="100%">
								<LineChart data={enrollmentTrend}>
									<CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
									<XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
									<YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
									<Tooltip contentStyle={tooltipStyle} />
									<Legend />
									<Line type="monotone" dataKey="enrolled" stroke="#3b82f6" strokeWidth={2} name="Registrati" />
									<Line type="monotone" dataKey="active" stroke="#22c55e" strokeWidth={2} name="Attivi" />
								</LineChart>
							</ResponsiveContainer>
						</div>
					</CardContent>
				</Card>
			)}

			<Card className="border-border">
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base">
						<Smartphone className="h-4 w-4" />
						Inventario dispositivi
					</CardTitle>
					<p className="text-sm text-muted-foreground">Prima i dispositivi non conformi, dal più grave.</p>
				</CardHeader>
				<CardContent className="space-y-3">
					<div className="relative max-w-md">
						<Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
						<Input value={search} onChange={(ev) => setSearch(ev.target.value)} placeholder="Cerca dispositivo, utente o sistema…" className="pl-8" />
					</div>
					<TablePager p={pager} />
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Dispositivo</TableHead>
									<TableHead>Utente</TableHead>
									{showModel && <TableHead>Modello</TableHead>}
									<TableHead>Sistema</TableHead>
									<TableHead>Conformità</TableHead>
									<TableHead>Registrazione</TableHead>
									<TableHead>Gestione</TableHead>
									{showBattery && <TableHead>Batteria</TableHead>}
									{showEncryption && <TableHead>Crittografia</TableHead>}
									<TableHead>Ultimo contatto</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{pager.visible.map((d) => (
									<TableRow key={d.id}>
										<TableCell className="font-medium">{d.deviceName}</TableCell>
										<TableCell className="text-sm">{d.user ?? "—"}</TableCell>
										{showModel && <TableCell className="text-xs text-muted-foreground">{d.model ?? "—"}</TableCell>}
										<TableCell className="text-xs">{d.os ?? "—"}</TableCell>
										<TableCell>
											{d.status === "Compliant" ? (
												<Badge className="border-green-500/30 bg-green-500/20 text-green-500">Conforme</Badge>
											) : (
												<div className="flex flex-wrap items-center gap-1">
													<Badge className="border-red-500/30 bg-red-500/20 text-red-500">Non conforme</Badge>
													{d.complianceSeverity && <Badge className={severityColors[d.complianceSeverity] ?? ""}>{d.complianceSeverity}</Badge>}
												</div>
											)}
										</TableCell>
										<TableCell className="text-sm">{d.enrollment ?? "—"}</TableCell>
										<TableCell className="text-sm">{d.management ?? "—"}</TableCell>
										{showBattery && <TableCell className="text-xs">{d.battery === null ? "—" : `${d.battery}%`}</TableCell>}
										{showEncryption && (
											<TableCell>
												{d.encrypted === null ? "—" : d.encrypted ? <Lock className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
											</TableCell>
										)}
										<TableCell className="whitespace-nowrap text-xs text-muted-foreground">{fmtDate(d.lastSeen)}</TableCell>
									</TableRow>
								))}
								{pager.visible.length === 0 && (
									<TableRow>
										<TableCell colSpan={10} className="text-center text-sm text-muted-foreground">
											Nessun dispositivo corrisponde alla ricerca.
										</TableCell>
									</TableRow>
								)}
							</TableBody>
						</Table>
					</div>
					{pager.total > pager.size && <TablePager p={pager} />}
				</CardContent>
			</Card>

			<Card className="border-border">
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base">
						<AlertTriangle className="h-4 w-4" />
						Eventi di sicurezza recenti
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					{securityEvents.length === 0 ? (
						<p className="text-sm text-muted-foreground">Nessun avviso di sicurezza aperto sui dispositivi mobili.</p>
					) : (
						<>
							<TablePager p={eventPager} />
							{eventPager.visible.map((ev, index) => (
								<div key={ev.id ?? index} className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
									<div className="flex items-center gap-4">
										<span className="w-28 font-mono text-xs text-muted-foreground">{fmtDate(ev.time)}</span>
										<div>
											<p className="text-sm font-medium">{ev.event}</p>
											<p className="text-xs text-muted-foreground">{ev.device}</p>
										</div>
									</div>
									<Badge className={severityColors[ev.severity] ?? ""}>{ev.severity}</Badge>
								</div>
							))}
						</>
					)}
				</CardContent>
			</Card>

			{securityPolicies.length > 0 && (
				<Card className="border-border">
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-base">
							<Settings className="h-4 w-4" />
							Policy di sicurezza attive
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						{securityPolicies.map((policy, index) => (
							<div key={index} className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-4">
								<div className="flex items-center gap-4">
									<Shield className="h-5 w-5 text-primary" />
									<div>
										<p className="font-medium">{policy.name}</p>
										<p className="text-xs text-muted-foreground">Applicata a {policy.devices} dispositivi</p>
									</div>
								</div>
								<div className="w-32">
									<div className="mb-1 flex justify-between text-xs">
										<span>Conformità</span>
										<span>{policy.compliance}%</span>
									</div>
									<Progress value={policy.compliance} className="h-2" />
								</div>
							</div>
						))}
					</CardContent>
				</Card>
			)}

			{appInventory.length > 0 && (
				<Card className="border-border">
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-base">
							<AppWindow className="h-4 w-4" />
							App aziendali gestite
						</CardTitle>
					</CardHeader>
					<CardContent className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Applicazione</TableHead>
									<TableHead>Categoria</TableHead>
									<TableHead>Installazioni</TableHead>
									<TableHead>Stato</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{appInventory.map((app, index) => (
									<TableRow key={index}>
										<TableCell className="font-medium">{app.name}</TableCell>
										<TableCell className="text-muted-foreground">{app.category}</TableCell>
										<TableCell>{app.installed}</TableCell>
										<TableCell>{app.status}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			)}
		</div>
	);
};
