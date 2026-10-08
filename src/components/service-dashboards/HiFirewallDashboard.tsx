// HiFirewall: apparati, aggiornamenti firmware, minacce bloccate e avvisi del
// cliente, dall'ultimo dato letto dal backend (FirewallDashboard). Regole e log
// delle connessioni non arrivano dalla gestione centralizzata: le sezioni si
// mostrano solo se un giorno il backend le fornisce, altrimenti c'è la nota.
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertTriangle, ArrowUpCircle, Info, Network, ShieldAlert, ShieldCheck, ShieldX, Unplug } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DemoDataBadge } from "./DemoDataBadge";
import { ServiceNotConnected } from "./ServiceNotConnected";
import { TablePager, usePager } from "./TablePager";
import { useFirewallDashboard } from "@/hooks/useFirewall";
import { cn } from "@/lib/utils";

const severityColors = {
	Low: "bg-green-500/20 text-green-500",
	Medium: "bg-yellow-500/20 text-yellow-500",
	High: "bg-orange-500/20 text-orange-500",
	Critical: "bg-red-500/20 text-red-500",
};
const severityLabel = { Low: "Bassa", Medium: "Media", High: "Alta", Critical: "Critica" };

const stateColors = {
	Connesso: "bg-green-500/20 text-green-500",
	Sospeso: "bg-muted text-muted-foreground",
	"Non connesso": "bg-red-500/20 text-red-500",
};

const fmtDate = (v: string | null | undefined) => {
	if (!v) return "—";
	const d = new Date(v);
	return Number.isNaN(d.getTime()) ? v : d.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
};

export const HiFirewallDashboard: React.FC = () => {
	const { data, loading, isMock, error } = useFirewallDashboard();
	const devices = data?.devices ?? [];
	const threatPager = usePager(data?.blockedThreats ?? [], data?.fetchedAt);
	const alertPager = usePager(data?.alerts ?? [], data?.fetchedAt);

	if (!data) return <ServiceNotConnected service="HiFirewall" loading={loading} detail={error} />;

	const { stats } = data;
	const unavailable = new Set(data.unavailable ?? []);
	// Dati d'esempio (build demo): hanno solo le vecchie sezioni, senza apparati.
	const legacy = devices.length === 0 && data.firewallRules.length > 0;

	const kpis = legacy
		? [
				{ icon: ShieldCheck, value: stats.activeRules, label: "Regole attive", tone: "text-primary" },
				{ icon: ShieldX, value: stats.blockedConnections, label: "Connessioni bloccate", tone: "text-red-500" },
				{ icon: ShieldAlert, value: stats.threatsBlocked, label: "Minacce bloccate", tone: "text-orange-500" },
				{ icon: Activity, value: stats.activeConnections, label: "Connessioni attive", tone: "text-green-500" },
			]
		: [
				{ icon: Network, value: stats.firewalls ?? devices.length, label: "Firewall", tone: "text-primary" },
				{ icon: ShieldCheck, value: stats.connected, label: "Connessi", tone: "text-green-500" },
				{ icon: Unplug, value: stats.disconnected, label: "Non connessi", tone: "text-muted-foreground" },
				{ icon: ArrowUpCircle, value: stats.upgradesAvailable, label: "Firmware da aggiornare", tone: "text-yellow-500" },
				{ icon: ShieldAlert, value: stats.threatsBlocked, label: "Minacce bloccate", tone: "text-orange-500" },
				{ icon: AlertTriangle, value: stats.openAlerts, label: "Avvisi aperti", tone: "text-red-500" },
			];

	return (
		<div className="space-y-8">
			<section className="space-y-4">
				<div className="flex flex-wrap items-center gap-3">
					<h2 className="text-2xl font-bold">Firewall Overview</h2>
					<DemoDataBadge show={isMock} />
					{data.fetchedAt && <span className="text-sm text-muted-foreground">Aggiornato alle {fmtDate(data.fetchedAt)}</span>}
				</div>
				{(data.stale || data.lastError) && (
					<div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
						{data.lastError
							? `Ultima lettura non riuscita (${fmtDate(data.lastError.at)}): ${data.lastError.message} Sono mostrati gli ultimi dati validi.`
							: "I dati non sono aggiornati: l'ultima lettura riuscita risale a oltre 30 minuti fa."}
					</div>
				)}

				<div className={cn("grid grid-cols-2 gap-4", legacy ? "md:grid-cols-4" : "md:grid-cols-3 lg:grid-cols-6")}>
					{kpis.map((k) => (
						<Card key={k.label} className="border-border">
							<CardContent className="pb-4 pt-4">
								<div className="flex flex-col items-center text-center">
									<k.icon className={cn("mb-2 h-6 w-6", k.tone)} />
									<p className="text-2xl font-bold">{k.value ?? "—"}</p>
									<p className="text-xs text-muted-foreground">{k.label}</p>
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			</section>

			{!legacy && (
				<section className="space-y-4">
					<h2 className="text-2xl font-bold">Apparati</h2>
					<Card className="border-border">
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-lg">
								<Network className="h-5 w-5 text-primary" />
								Firewall gestiti
							</CardTitle>
							<p className="text-sm text-muted-foreground">Stato, firmware e aggiornamenti disponibili; prima gli apparati non connessi.</p>
						</CardHeader>
						<CardContent>
							{devices.length === 0 ? (
								<p className="text-sm text-muted-foreground">Nessun firewall gestito.</p>
							) : (
								<div className="overflow-x-auto">
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>Nome</TableHead>
												<TableHead>Modello</TableHead>
												<TableHead>Stato</TableHead>
												<TableHead>Firmware</TableHead>
												<TableHead>Aggiornamento</TableHead>
												<TableHead>Alta affidabilità</TableHead>
												<TableHead>IP esterni</TableHead>
												<TableHead>Avvisi</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{devices.map((d) => (
												<TableRow key={d.id}>
													<TableCell>
														<p className="font-medium">{d.name}</p>
														{d.hostname && d.hostname !== d.name && <p className="text-xs text-muted-foreground">{d.hostname}</p>}
													</TableCell>
													<TableCell className="text-sm">{d.model ?? "—"}</TableCell>
													<TableCell>
														<Badge className={stateColors[d.state]}>{d.state}</Badge>
														{d.stateChangedAt && <p className="mt-1 text-[10px] text-muted-foreground">dal {fmtDate(d.stateChangedAt)}</p>}
													</TableCell>
													<TableCell className="font-mono text-sm">{d.firmware ?? "—"}</TableCell>
													<TableCell className="text-sm">
														{d.upgradeTo === null ? (
															<span className="text-muted-foreground">Non verificato</span>
														) : d.upgradeTo.length === 0 ? (
															<span className="text-green-500">Aggiornato</span>
														) : (
															<div className="space-y-1">
																<span className="font-mono text-yellow-500">{d.upgradeTo[0]}</span>
																{d.majorUpgrade && (
																	<Badge className="ml-1 bg-orange-500/20 text-[10px] text-orange-500">salto di versione</Badge>
																)}
															</div>
														)}
													</TableCell>
													<TableCell className="text-sm">
														{d.cluster ? (d.cluster.role === "primary" ? "Primario" : d.cluster.role === "auxiliary" ? "Secondario" : d.cluster.role ?? "Sì") : "—"}
													</TableCell>
													<TableCell className="font-mono text-xs">{d.externalIps.join(", ") || "—"}</TableCell>
													<TableCell className={d.openAlerts > 0 ? "font-semibold text-red-500" : "text-muted-foreground"}>{d.openAlerts}</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								</div>
							)}
						</CardContent>
					</Card>
				</section>
			)}

			<section className="space-y-4">
				<h2 className="text-2xl font-bold">Minacce Bloccate</h2>
				<Card className="border-border">
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-lg">
							<ShieldAlert className="h-5 w-5 text-red-500" />
							Minacce intercettate dai firewall
						</CardTitle>
						<p className="text-sm text-muted-foreground">Protezione avanzata, intrusioni, malware e web: avvisi ancora aperti, dal più recente.</p>
					</CardHeader>
					<CardContent className="space-y-3">
						{data.blockedThreats.length === 0 ? (
							<p className="text-sm text-muted-foreground">Nessuna minaccia bloccata in sospeso.</p>
						) : (
							<>
								<TablePager p={threatPager} />
								<div className="overflow-x-auto">
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>Firewall</TableHead>
												<TableHead>Tipo</TableHead>
												<TableHead>Dettaglio</TableHead>
												<TableHead>Ultimo evento</TableHead>
												<TableHead>Eventi</TableHead>
												<TableHead>Gravità</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{threatPager.visible.map((t) => (
												<TableRow key={t.id}>
													<TableCell className="font-medium">{t.device ?? t.source ?? "—"}</TableCell>
													<TableCell>{t.type}</TableCell>
													<TableCell className="max-w-md text-sm">{t.description ?? (t.source ? `${t.source} → ${t.destination ?? "—"}` : "—")}</TableCell>
													<TableCell className="whitespace-nowrap text-sm text-muted-foreground">{fmtDate(t.lastSeenAt ?? t.timestamp)}</TableCell>
													<TableCell>{t.eventCount ?? 1}</TableCell>
													<TableCell>
														<Badge className={severityColors[t.severity]}>{severityLabel[t.severity]}</Badge>
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								</div>
							</>
						)}
					</CardContent>
				</Card>
			</section>

			{(data.alerts?.length ?? 0) > 0 && (
				<section className="space-y-4">
					<h2 className="text-2xl font-bold">Avvisi degli apparati</h2>
					<Card className="border-border">
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-lg">
								<AlertTriangle className="h-5 w-5 text-orange-500" />
								Funzionamento: tunnel VPN, gateway, backup
							</CardTitle>
							<p className="text-sm text-muted-foreground">Avvisi aperti, dal più recente. "Eventi" conta quante volte si è ripetuto.</p>
						</CardHeader>
						<CardContent className="space-y-3">
							<TablePager p={alertPager} />
							<div className="overflow-x-auto">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Firewall</TableHead>
											<TableHead>Avviso</TableHead>
											<TableHead>Dettaglio</TableHead>
											<TableHead>Ultimo evento</TableHead>
											<TableHead>Eventi</TableHead>
											<TableHead>Gravità</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{alertPager.visible.map((a) => (
											<TableRow key={a.id}>
												<TableCell className="font-medium">{a.device ?? "—"}</TableCell>
												<TableCell>{a.type}</TableCell>
												<TableCell className="max-w-md text-sm">{a.description ?? "—"}</TableCell>
												<TableCell className="whitespace-nowrap text-sm text-muted-foreground">{fmtDate(a.lastSeenAt ?? a.timestamp)}</TableCell>
												<TableCell>{a.eventCount}</TableCell>
												<TableCell>
													<Badge className={severityColors[a.severity]}>{severityLabel[a.severity]}</Badge>
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</div>
							{alertPager.total > alertPager.size && <TablePager p={alertPager} />}
						</CardContent>
					</Card>
				</section>
			)}

			{(unavailable.has("firewallRules") || unavailable.has("connectionLogs")) && data.firewallRules.length === 0 && (
				<Card className="border-dashed">
					<CardContent className="flex items-start gap-3 py-4 text-sm text-muted-foreground">
						<Info className="mt-0.5 h-4 w-4 shrink-0" />
						<p>
							Regole del firewall, contatori di utilizzo e log delle connessioni non sono ancora disponibili: richiedono l'accesso diretto al
							firewall o un collettore dei log, da attivare per ogni apparato.
						</p>
					</CardContent>
				</Card>
			)}

			{data.firewallRules.length > 0 && (
				<section className="space-y-4">
					<h2 className="text-2xl font-bold">Regole Firewall</h2>
					<Card className="border-border">
						<CardContent className="overflow-x-auto pt-6">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Nome</TableHead>
										<TableHead>Sorgente</TableHead>
										<TableHead>Destinazione</TableHead>
										<TableHead>Porta</TableHead>
										<TableHead>Protocollo</TableHead>
										<TableHead>Azione</TableHead>
										<TableHead>Stato</TableHead>
										<TableHead>Hit</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{data.firewallRules.map((r) => (
										<TableRow key={r.id}>
											<TableCell className="font-medium">{r.name}</TableCell>
											<TableCell className="font-mono text-sm">{r.source}</TableCell>
											<TableCell className="font-mono text-sm">{r.destination}</TableCell>
											<TableCell className="font-mono text-sm">{r.port}</TableCell>
											<TableCell>{r.protocol}</TableCell>
											<TableCell>{r.action}</TableCell>
											<TableCell>{r.status}</TableCell>
											<TableCell>{r.hits.toLocaleString("it-IT")}</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</CardContent>
					</Card>
				</section>
			)}

			{data.connectionLogs.length > 0 && (
				<section className="space-y-4">
					<h2 className="text-2xl font-bold">Log Connessioni</h2>
					<Card className="border-border">
						<CardContent className="overflow-x-auto pt-6">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Ora</TableHead>
										<TableHead>Sorgente</TableHead>
										<TableHead>Destinazione</TableHead>
										<TableHead>Porta</TableHead>
										<TableHead>Protocollo</TableHead>
										<TableHead>Esito</TableHead>
										<TableHead>Byte</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{data.connectionLogs.map((l, i) => (
										<TableRow key={`${l.timestamp}-${i}`}>
											<TableCell className="whitespace-nowrap text-sm">{l.timestamp}</TableCell>
											<TableCell className="font-mono text-sm">{l.source}</TableCell>
											<TableCell className="font-mono text-sm">{l.destination}</TableCell>
											<TableCell className="font-mono text-sm">{l.port}</TableCell>
											<TableCell>{l.protocol}</TableCell>
											<TableCell>{l.status}</TableCell>
											<TableCell>{l.bytes}</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</CardContent>
					</Card>
				</section>
			)}
		</div>
	);
};
