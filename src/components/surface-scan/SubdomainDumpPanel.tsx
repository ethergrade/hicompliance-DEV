import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
	Globe,
	Search,
	Loader2,
	Plus,
	Settings,
	AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import {
	useSubdomainDump,
	type SubdomainResult,
} from "@/hooks/useSubdomainDump";
import { useSurfaceScanMonitoredIps } from "@/hooks/useSurfaceScanMonitoredIps";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";

type SubdomainDumpState = ReturnType<typeof useSubdomainDump>;

interface Props {
	isAdmin: boolean;
	dump: SubdomainDumpState;
}

const sanitizeDomain = (raw: string) =>
	raw
		.trim()
		.toLowerCase()
		.replace(/^https?:\/\//, "")
		.replace(/\/.*$/, "")
		.replace(/^www\./, "");

export const SubdomainDumpPanel: React.FC<Props> = ({ isAdmin, dump }) => {
	const { addRule } = useSurfaceScanMonitoredIps();
	const [domain, setDomain] = useState("");
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [depthDraft, setDepthDraft] = useState<number>(dump.depthSetting);
	const [enabledDraft, setEnabledDraft] = useState<boolean>(
		dump.enabledSetting,
	);

	React.useEffect(() => {
		setDepthDraft(dump.depthSetting);
	}, [dump.depthSetting]);
	React.useEffect(() => {
		setEnabledDraft(dump.enabledSetting);
	}, [dump.enabledSetting]);

	const latest = dump.history[0];

	const handleRun = async () => {
		const d = sanitizeDomain(domain);
		if (!d || !/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(d)) {
			toast.error("Dominio non valido", {
				description: "Inserisci un dominio radice tipo esempio.com",
			});
			return;
		}
		if (!dump.enabledSetting) {
			toast.error("Subdomain Dump disabilitato", {
				description: "L'admin ha disattivato questa funzione.",
			});
			return;
		}
		const res = await dump.runDump(d);
		if (res) {
			toast.success("Dump completato", {
				description: `${res.total_returned}/${res.total_discovered} sottodomini${res.truncated ? " (troncato al limite)" : ""}`,
			});
			// Auto-aggiunge i sottodomini scoperti alla lista monitorata (silenzioso, dedup via unique key)
			const subs = res.results ?? [];
			if (subs.length > 0) {
				let added = 0;
				for (const s of subs) {
					const ok = await addRule(s.subdomain, {
						discovered_via: "subdomain_dump",
						discovered_from: d,
						silent: true,
					});
					if (ok) added++;
				}
				if (added > 0) {
					toast.success(`${added} sottodomini aggiunti al monitoraggio`, {
						description: `Scoperti da ${d} · saranno scansionati al prossimo run`,
					});
				}
			}
		} else if (dump.error) {
			toast.error("Errore dump", { description: dump.error });
		}
	};

	const handleSaveSettings = async () => {
		const ok = await dump.updateSettings(depthDraft, enabledDraft);
		if (ok) {
			toast.success("Impostazioni salvate", {
				description: `Profondità: ${depthDraft} · ${enabledDraft ? "Attivo" : "Disattivato"}`,
			});
			setSettingsOpen(false);
		} else {
			toast.error("Errore salvataggio", { description: dump.error ?? "" });
		}
	};

	const handleAddToMonitoring = async (sub: SubdomainResult) => {
		const target = sub.subdomain;
		const ok = await addRule(target, {
			discovered_via: "subdomain_dump",
			discovered_from: latest?.root_domain ?? null,
		});
		if (ok) toast.success(`${target} aggiunto al monitoraggio`);
	};

	return (
		<Card className="border-border">
			<CardHeader>
				<div className="flex items-start justify-between gap-3 flex-wrap">
					<div className="min-w-0">
						<CardTitle className="flex items-center gap-2">
							<Globe className="w-5 h-5 text-primary" />
							Subdomain Discovery
							{!dump.enabledSetting && (
								<Badge
									variant="outline"
									className="text-destructive border-destructive/40"
								>
									disabilitato
								</Badge>
							)}
						</CardTitle>
						<p className="text-xs text-muted-foreground mt-1">
							Scopre sottodomini di un dominio radice tramite Certificate
							Transparency, Passive DNS e fonti pubbliche. Risultati arricchiti
							con IP, ASN, organizzazione e Paese. Limite massimo:{" "}
							<strong>{dump.depthSetting} sottodomini</strong>
							{dump.depthSetting <= 10 &&
								" (riduce il rumore da shared hosting)"}
							.
						</p>
					</div>
					{isAdmin && (
						<Button
							variant="outline"
							size="sm"
							onClick={() => setSettingsOpen((o) => !o)}
						>
							<Settings className="w-4 h-4 mr-2" />
							Impostazioni
						</Button>
					)}
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				{isAdmin && (
					<Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
						<CollapsibleContent>
							<div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-4 mb-2">
								<div className="flex items-center justify-between">
									<div>
										<Label className="text-sm font-medium">
											Subdomain Dump attivo
										</Label>
										<p className="text-xs text-muted-foreground">
											Disattivalo per bloccare le scoperte per questa
											organizzazione
										</p>
									</div>
									<Switch
										checked={enabledDraft}
										onCheckedChange={setEnabledDraft}
									/>
								</div>
								<div>
									<div className="flex items-center justify-between mb-2">
										<Label className="text-sm font-medium">
											Profondità massima (sottodomini per dump)
										</Label>
										<Badge variant="outline">{depthDraft}</Badge>
									</div>
									<Slider
										value={[depthDraft]}
										min={1}
										max={50}
										step={1}
										onValueChange={([v]) => setDepthDraft(v)}
										disabled={!enabledDraft}
									/>
									<p className="text-xs text-muted-foreground mt-2">
										Default consigliato: <strong>10</strong>. Oltre i 10
										risultati il rischio di shared hosting / CDN che inquina la
										scansione aumenta.
									</p>
								</div>
								<div className="flex justify-end">
									<Button size="sm" onClick={handleSaveSettings}>
										Salva
									</Button>
								</div>
							</div>
						</CollapsibleContent>
					</Collapsible>
				)}

				<div className="flex gap-2">
					<Input
						placeholder="esempio.com"
						value={domain}
						onChange={(e) => setDomain(e.target.value)}
						onKeyDown={(e) => e.key === "Enter" && handleRun()}
						disabled={dump.running || !dump.enabledSetting}
						className="flex-1"
					/>
					<Button
						onClick={handleRun}
						disabled={dump.running || !dump.enabledSetting || !domain.trim()}
					>
						{dump.running ? (
							<Loader2 className="w-4 h-4 mr-2 animate-spin" />
						) : (
							<Search className="w-4 h-4 mr-2" />
						)}
						{dump.running ? "Dump in corso..." : "Esegui Dump"}
					</Button>
				</div>

				{latest && (
					<div className="space-y-3">
						<div className="flex items-center gap-2 text-sm flex-wrap">
							<Badge
								variant="outline"
								className="border-primary/40 text-primary"
							>
								{latest.root_domain}
							</Badge>
							<span className="text-muted-foreground">
								{latest.total_returned}/{latest.total_discovered} sottodomini
							</span>
							{latest.truncated && (
								<Badge
									variant="outline"
									className="border-orange-400 text-orange-600"
								>
									<AlertTriangle className="w-3 h-3 mr-1" />
									Troncato al limite ({latest.depth_limit})
								</Badge>
							)}
							<span className="text-xs text-muted-foreground">
								Fonti: {(latest.sources || []).join(", ") || "—"}
							</span>
							<span className="text-xs text-muted-foreground ml-auto">
								{new Date(latest.created_at).toLocaleString("it-IT")}
							</span>
						</div>

						<div className="rounded-lg border overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Sottodominio</TableHead>
										<TableHead>IP</TableHead>
										<TableHead>ASN</TableHead>
										<TableHead>Organizzazione</TableHead>
										<TableHead>Paese</TableHead>
										<TableHead>Fonti</TableHead>
										<TableHead className="text-right">Azioni</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{(latest.results || []).map((r) => (
										<TableRow key={r.subdomain}>
											<TableCell className="font-mono text-xs">
												{r.subdomain}
											</TableCell>
											<TableCell className="font-mono text-xs">
												{r.ip ?? "—"}
											</TableCell>
											<TableCell className="text-xs">
												{r.asn ? `AS${r.asn}` : "—"}
											</TableCell>
											<TableCell className="text-xs truncate max-w-[200px]">
												{r.asn_name ?? "—"}
											</TableCell>
											<TableCell className="text-xs">
												{r.country ?? "—"}
											</TableCell>
											<TableCell className="text-xs">
												<div className="flex flex-wrap gap-1">
													{(r.source || []).map((s) => (
														<Badge
															key={s}
															variant="secondary"
															className="text-[10px] px-1.5 py-0"
														>
															{s}
														</Badge>
													))}
												</div>
											</TableCell>
											<TableCell className="text-right">
												<Button
													size="sm"
													variant="outline"
													onClick={() => handleAddToMonitoring(r)}
												>
													<Plus className="w-3 h-3 mr-1" />
													Monitora
												</Button>
											</TableCell>
										</TableRow>
									))}
									{(latest.results || []).length === 0 && (
										<TableRow>
											<TableCell
												colSpan={7}
												className="text-center text-sm text-muted-foreground py-6"
											>
												Nessun sottodominio trovato.
											</TableCell>
										</TableRow>
									)}
								</TableBody>
							</Table>
						</div>
						<p className="text-xs text-muted-foreground">
							Clicca <strong>Monitora</strong> per aggiungere il sottodominio
							alla lista monitorata: viene avviata anche una coda di scansione
							immediata (compatibilmente con cooldown/rate-limit), oltre ai
							cicli automatici settimanali.
						</p>
					</div>
				)}

				{!latest && !dump.running && (
					<div className="text-sm text-muted-foreground p-4 text-center border border-dashed rounded-lg">
						Nessun dump eseguito. Inserisci un dominio radice per scoprire i
						sottodomini esposti.
					</div>
				)}
			</CardContent>
		</Card>
	);
};
