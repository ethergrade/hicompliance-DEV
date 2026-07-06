import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldAlert, Filter } from "lucide-react";
import { useClientOrganization } from "@/hooks/useClientOrganization";
import {
	surfaceScan360Api,
	type RemediationWorkflowStatus,
} from "@/lib/api/surface-scan360";

const severityBadge = (severity: string | null) => {
	switch ((severity ?? "").toLowerCase()) {
		case "critical":
			return "destructive" as const;
		case "high":
			return "destructive" as const;
		case "medium":
			return "secondary" as const;
		default:
			return "outline" as const;
	}
};

const fmtEpss = (v: number | null) =>
	v === null || v === undefined ? "—" : (v * 100).toFixed(1) + "%";

const ExternalScanIntelligenceSection: React.FC = () => {
	const { organizationId, groupId } = useClientOrganization();
	const [bucketFilter, setBucketFilter] = useState<string | undefined>();
	const [kevOnly, setKevOnly] = useState(false);
	const [remediationTab, setRemediationTab] =
		useState<RemediationWorkflowStatus>("open");

	const enabled = !!organizationId;

	const epssQuery = useQuery({
		queryKey: ["epss-buckets", organizationId, groupId],
		enabled,
		queryFn: () =>
			surfaceScan360Api.getEpssBuckets(organizationId!, {}, groupId),
	});

	const vulnQuery = useQuery({
		queryKey: ["vuln-intel", organizationId, groupId, bucketFilter, kevOnly],
		enabled,
		queryFn: () =>
			surfaceScan360Api.getVulnerabilityIntelligence(
				organizationId!,
				{ epss_bucket: bucketFilter, kev_only: kevOnly },
				groupId,
			),
	});

	const remediationQuery = useQuery({
		queryKey: ["remediation-actions", organizationId, groupId, remediationTab],
		enabled,
		queryFn: () =>
			surfaceScan360Api.getRemediationActions(
				organizationId!,
				{ workflow_status: remediationTab },
				groupId,
			),
	});

	if (!organizationId) return null;

	const buckets = epssQuery.data ?? [];
	const vulns = vulnQuery.data ?? [];
	const remediations = remediationQuery.data ?? [];

	return (
		<div className="space-y-6">
			{/* EPSS Categorization */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<ShieldAlert className="w-5 h-5" />
						EPSS Categorization
					</CardTitle>
					<CardDescription>
						Priorità di remediation in base allo score EPSS canonico (NVD/FIRST).
					</CardDescription>
				</CardHeader>
				<CardContent>
					{epssQuery.isLoading ? (
						<Loader2 className="w-4 h-4 animate-spin" />
					) : (
						<div className="grid gap-3 md:grid-cols-4">
							{buckets.map((b) => {
								const active = bucketFilter === b.bucket;
								return (
									<div
										key={b.bucket}
										className={`rounded-lg border p-3 ${active ? "border-primary" : ""}`}
									>
										<div className="text-lg font-bold">{b.label}</div>
										<div className="text-xs text-muted-foreground">{b.sla}</div>
										<div className="mt-2 flex items-center gap-2 text-sm">
											<Badge variant={severityBadge(b.max_severity)}>
												{b.max_severity}
											</Badge>
											<span>{b.cve_count} CVE</span>
											<span className="text-muted-foreground">
												· {b.asset_count} asset
											</span>
										</div>
										<Button
											size="sm"
											variant={active ? "default" : "ghost"}
											className="mt-2 w-full"
											onClick={() =>
												setBucketFilter(active ? undefined : b.bucket)
											}
										>
											{active ? "Rimuovi filtro" : "View"}
										</Button>
									</div>
								);
							})}
						</div>
					)}
				</CardContent>
			</Card>

			{/* Vulnerability Intelligence */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Filter className="w-5 h-5" />
						Vulnerability Intelligence
					</CardTitle>
					<CardDescription>
						CVE correlate ai servizi esposti, con CVSS/EPSS/KEV canonici.
						{bucketFilter && (
							<>
								{" "}
								Filtro bucket: <strong>{bucketFilter}</strong>
							</>
						)}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					<div className="flex items-center gap-2">
						<Switch checked={kevOnly} onCheckedChange={setKevOnly} id="kev-only" />
						<Label htmlFor="kev-only">Solo KEV (Known Exploited)</Label>
					</div>

					{vulnQuery.isLoading ? (
						<Loader2 className="w-4 h-4 animate-spin" />
					) : vulns.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							Nessuna vulnerabilità corrispondente ai filtri.
						</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>CVE</TableHead>
									<TableHead>Severity</TableHead>
									<TableHead>CVSS</TableHead>
									<TableHead>EPSS</TableHead>
									<TableHead>Bucket</TableHead>
									<TableHead>KEV</TableHead>
									<TableHead>Asset</TableHead>
									<TableHead>Stato</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{vulns.map((v) => (
									<TableRow key={v.id}>
										<TableCell className="font-mono text-xs">{v.cve_id}</TableCell>
										<TableCell>
											<Badge variant={severityBadge(v.severity)}>
												{v.severity ?? "—"}
											</Badge>
										</TableCell>
										<TableCell>{v.cvss ?? "—"}</TableCell>
										<TableCell>{fmtEpss(v.epss)}</TableCell>
										<TableCell className="text-xs">{v.epss_bucket}</TableCell>
										<TableCell>
											{v.kev ? (
												<Badge variant="destructive">KEV</Badge>
											) : (
												"—"
											)}
										</TableCell>
										<TableCell className="text-xs">
											{v.asset_host ?? "—"}
										</TableCell>
										<TableCell className="capitalize text-xs">
											{v.match_status}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>

			{/* Remediation Plan */}
			<Card>
				<CardHeader>
					<CardTitle>External Remediation Plan</CardTitle>
					<CardDescription>
						Azioni di remediation aggregate. Solo "Remediation Plan" (open)
						contribuisce al rischio corrente.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Tabs
						value={remediationTab}
						onValueChange={(v) =>
							setRemediationTab(v as RemediationWorkflowStatus)
						}
					>
						<TabsList>
							<TabsTrigger value="open">Remediation Plan</TabsTrigger>
							<TabsTrigger value="remediated">Remediated</TabsTrigger>
							<TabsTrigger value="suppressed">Suppressed</TabsTrigger>
							<TabsTrigger value="auto_suppressed">Auto Suppressed</TabsTrigger>
						</TabsList>
						<TabsContent value={remediationTab} className="mt-4">
							{remediationQuery.isLoading ? (
								<Loader2 className="w-4 h-4 animate-spin" />
							) : remediations.length === 0 ? (
								<p className="text-sm text-muted-foreground">
									Nessuna azione in questo stato.
								</p>
							) : (
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Priorità</TableHead>
											<TableHead>Prodotto / Componente</TableHead>
											<TableHead>Azione</TableHead>
											<TableHead className="text-right">Asset</TableHead>
											<TableHead className="text-right">Max EPSS</TableHead>
											<TableHead className="text-right">C/H/M/L</TableHead>
											<TableHead>Patchable</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{remediations.map((r) => (
											<TableRow key={r.id}>
												<TableCell>
													<Badge variant={severityBadge(r.severity)}>
														{r.severity ?? "—"}
													</Badge>
												</TableCell>
												<TableCell className="font-medium">
													{r.product ?? r.title}
												</TableCell>
												<TableCell className="text-xs">
													{r.remediation_action ?? r.fix ?? "—"}
												</TableCell>
												<TableCell className="text-right">
													{r.affected_assets_count}
												</TableCell>
												<TableCell className="text-right">
													{fmtEpss(r.epss_max)}
												</TableCell>
												<TableCell className="text-right text-xs">
													{r.counts.critical}/{r.counts.high}/{r.counts.medium}/
													{r.counts.low}
												</TableCell>
												<TableCell>
													{r.is_patchable === null
														? "—"
														: r.is_patchable
															? "Sì"
															: "No"}
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							)}
						</TabsContent>
					</Tabs>
				</CardContent>
			</Card>
		</div>
	);
};

export default ExternalScanIntelligenceSection;
