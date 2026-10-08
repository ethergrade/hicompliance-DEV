// HiMail: messaggi in quarantena degli ultimi giorni del cliente, dall'ultimo
// dato letto dal backend (MailDashboard). Totale processato, consegnati e
// violazioni di policy si mostrano solo se presenti: la fonte non li espone, e
// nessuna percentuale viene stimata.
import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Ban, Inbox, Mail, MailCheck, MailWarning, MailX, Search, ShieldAlert, Send } from "lucide-react";
import { DemoDataBadge } from "./DemoDataBadge";
import { ServiceNotConnected } from "./ServiceNotConnected";
import { TablePager, usePager } from "./TablePager";
import { useMailDashboard } from "@/hooks/useMail";
import { cn } from "@/lib/utils";

const typeColors: Record<string, string> = {
	Phishing: "bg-red-500/20 text-red-500",
	Malware: "bg-red-700/20 text-red-700",
	Spam: "bg-yellow-500/20 text-yellow-500",
	BEC: "bg-orange-500/20 text-orange-500",
};
const typeLabel: Record<string, string> = { Phishing: "Phishing", Malware: "Malware", Spam: "Spam", BEC: "Frode del CEO / impersonificazione" };
const severityColors: Record<string, string> = {
	Low: "bg-green-500/20 text-green-500",
	Medium: "bg-yellow-500/20 text-yellow-500",
	High: "bg-orange-500/20 text-orange-500",
	Critical: "bg-red-500/20 text-red-500",
};
const severityLabel: Record<string, string> = { Low: "Bassa", Medium: "Media", High: "Alta", Critical: "Critica" };

const fmtDate = (v: string | null | undefined) => {
	if (!v) return "—";
	const d = new Date(v);
	return Number.isNaN(d.getTime()) ? v : d.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
};

export const HiMailDashboard: React.FC = () => {
	const { data, loading, isMock, error } = useMailDashboard();
	const [search, setSearch] = useState("");
	const [reason, setReason] = useState<string | null>(null);

	const quarantined = useMemo(() => data?.quarantinedEmails ?? [], [data]);
	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		return quarantined.filter(
			(m) => (!reason || m.reasonCode === reason || m.reason === reason) && (!q || [m.from, m.to, m.subject, m.fromName].some((v) => (v ?? "").toLowerCase().includes(q))),
		);
	}, [quarantined, search, reason]);
	const qPager = usePager(filtered, `${search}|${reason}`);
	const tPager = usePager(data?.recentThreats ?? [], data?.fetchedAt);

	if (!data) return <ServiceNotConnected service="HiMail" loading={loading} detail={error} />;

	const { stats, recentThreats, topSenders, policyViolations } = data;
	const days = stats.windowDays ?? 7;

	const kpis = [
		...(stats.totalProcessed !== null ? [{ label: "Email processate", value: stats.totalProcessed, icon: Mail, tone: "text-primary" }] : []),
		...(stats.delivered !== null ? [{ label: "Consegnate", value: stats.delivered, icon: MailCheck, tone: "text-green-500" }] : []),
		{ label: `In quarantena (${days}gg)`, value: stats.quarantined, icon: Inbox, tone: "text-yellow-500" },
		{ label: "Minacce bloccate", value: stats.threats ?? recentThreats.length, icon: ShieldAlert, tone: "text-red-500" },
		{ label: "Phishing", value: stats.phishingBlocked, icon: MailWarning, tone: "text-orange-500" },
		{ label: "Malware", value: stats.malwareBlocked, icon: MailX, tone: "text-red-500" },
		{ label: "Spam", value: stats.spamBlocked, icon: Ban, tone: "text-yellow-500" },
		...(stats.bulk !== undefined ? [{ label: "Posta massiva", value: stats.bulk, icon: Send, tone: "text-muted-foreground" }] : []),
	];

	return (
		<div className="space-y-8">
			<section className="space-y-4">
				<div className="flex flex-wrap items-center gap-3">
					<h2 className="text-2xl font-bold">Email Security Overview</h2>
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
				<div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-7">
					{kpis.map((k) => (
						<Card key={k.label} className="border-border">
							<CardContent className="pb-4 pt-4">
								<div className="flex flex-col items-center text-center">
									<k.icon className={cn("mb-2 h-6 w-6", k.tone)} />
									<p className="text-2xl font-bold">{k.value}</p>
									<p className="text-xs text-muted-foreground">{k.label}</p>
								</div>
							</CardContent>
						</Card>
					))}
				</div>
				{(data.reasons?.length ?? 0) > 0 && (
					<div className="flex flex-wrap items-center gap-2 text-sm">
						<span className="text-muted-foreground">Motivi della quarantena:</span>
						{data.reasons!.map((r) => (
							<Badge
								key={r.code}
								variant={reason === r.code ? "default" : "outline"}
								className="cursor-pointer font-normal"
								onClick={() => setReason(reason === r.code ? null : r.code)}
							>
								{r.label} · {r.count}
							</Badge>
						))}
					</div>
				)}
			</section>

			<section className="space-y-4">
				<h2 className="text-2xl font-bold">Minacce Recenti</h2>
				<Card className="border-border">
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-lg">
							<ShieldAlert className="h-5 w-5 text-red-500" />
							Email malevole trattenute
						</CardTitle>
						<p className="text-sm text-muted-foreground">Phishing, malware e impersonificazioni, dalla più recente.</p>
					</CardHeader>
					<CardContent className="space-y-3">
						{recentThreats.length === 0 ? (
							<p className="text-sm text-muted-foreground">Nessuna email malevola nel periodo.</p>
						) : (
							<>
								<TablePager p={tPager} />
								<div className="overflow-x-auto">
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>Mittente</TableHead>
												<TableHead>Destinatario</TableHead>
												<TableHead>Oggetto</TableHead>
												<TableHead>Tipo</TableHead>
												<TableHead>Quando</TableHead>
												<TableHead>Gravità</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{tPager.visible.map((t) => (
												<TableRow key={t.id}>
													<TableCell className="font-mono text-xs">{t.from ?? "—"}</TableCell>
													<TableCell className="font-mono text-xs">{t.to ?? "—"}</TableCell>
													<TableCell className="max-w-xs truncate text-sm">{t.subject ?? "—"}</TableCell>
													<TableCell>
														<Badge className={typeColors[t.type] ?? ""}>{t.reason ?? typeLabel[t.type] ?? t.type}</Badge>
													</TableCell>
													<TableCell className="whitespace-nowrap text-sm text-muted-foreground">{fmtDate(t.detectedAt)}</TableCell>
													<TableCell>
														<Badge className={severityColors[t.severity] ?? ""}>{severityLabel[t.severity] ?? t.severity}</Badge>
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

			<section className="space-y-4">
				<h2 className="text-2xl font-bold">Quarantena</h2>
				<Card className="border-border">
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-lg">
							<Inbox className="h-5 w-5 text-yellow-500" />
							Messaggi in quarantena
						</CardTitle>
						<p className="text-sm text-muted-foreground">Ultimi {days} giorni. Il rilascio dei messaggi si fa dalla console di gestione.</p>
					</CardHeader>
					<CardContent className="space-y-3">
						<div className="relative max-w-md">
							<Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
							<Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca mittente, destinatario o oggetto…" className="pl-8" />
						</div>
						<TablePager p={qPager} />
						<div className="overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Mittente</TableHead>
										<TableHead>Destinatario</TableHead>
										<TableHead>Oggetto</TableHead>
										<TableHead>Motivo</TableHead>
										<TableHead>Direzione</TableHead>
										<TableHead>In quarantena dal</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{qPager.visible.map((m) => (
										<TableRow key={m.id}>
											<TableCell>
												<p className="font-mono text-xs">{m.from ?? "—"}</p>
												{m.fromName && <p className="text-xs text-muted-foreground">{m.fromName}</p>}
											</TableCell>
											<TableCell className="font-mono text-xs">
												{m.to ?? "—"}
												{(m.recipients ?? 1) > 1 && <span className="text-muted-foreground"> +{(m.recipients ?? 1) - 1}</span>}
											</TableCell>
											<TableCell className="max-w-xs truncate text-sm">{m.subject ?? "—"}</TableCell>
											<TableCell>{m.reason}</TableCell>
											<TableCell className="text-sm">{m.direction ?? "—"}</TableCell>
											<TableCell className="whitespace-nowrap text-sm text-muted-foreground">{fmtDate(m.quarantinedAt)}</TableCell>
										</TableRow>
									))}
									{qPager.visible.length === 0 && (
										<TableRow>
											<TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
												Nessun messaggio corrisponde ai filtri.
											</TableCell>
										</TableRow>
									)}
								</TableBody>
							</Table>
						</div>
						{qPager.total > qPager.size && <TablePager p={qPager} />}
					</CardContent>
				</Card>
			</section>

			{topSenders.length > 0 && (
				<section className="space-y-4">
					<h2 className="text-2xl font-bold">Domini mittenti più frequenti in quarantena</h2>
					<Card className="border-border">
						<CardContent className="overflow-x-auto pt-6">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Dominio</TableHead>
										<TableHead>Messaggi in quarantena</TableHead>
										<TableHead>Di cui malevoli</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{topSenders.map((s) => (
										<TableRow key={s.domain}>
											<TableCell className="font-mono text-sm">{s.domain}</TableCell>
											<TableCell>{s.emails}</TableCell>
											<TableCell className={s.blocked > 0 ? "font-semibold text-red-500" : "text-muted-foreground"}>{s.blocked}</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</CardContent>
					</Card>
				</section>
			)}

			{policyViolations.length > 0 && (
				<section className="space-y-4">
					<h2 className="text-2xl font-bold">Violazioni di policy</h2>
					<Card className="border-border">
						<CardContent className="overflow-x-auto pt-6">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Policy</TableHead>
										<TableHead>Violazioni</TableHead>
										<TableHead>Ultima</TableHead>
										<TableHead>Azione</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{policyViolations.map((p, i) => (
										<TableRow key={i}>
											<TableCell className="font-medium">{p.policy}</TableCell>
											<TableCell>{p.violations}</TableCell>
											<TableCell className="text-sm text-muted-foreground">{p.lastViolation}</TableCell>
											<TableCell>{p.action === "Blocked" ? "Bloccata" : "Segnalata"}</TableCell>
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
