import React from "react";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, Globe } from "lucide-react";
import { useSurfaceExternalEndpoints } from "@/hooks/useSurfaceExternalEndpoints";
import type { ExternalEndpointAddressType } from "@/lib/api/surface-scan360";

const ADDRESS_TYPE_LABELS: Record<ExternalEndpointAddressType, string> = {
	static_ip: "Static IP",
	domain: "Domain",
	ip_range: "IP Range",
};

const ExternalEndpointsPanel: React.FC = () => {
	const { endpoints, loading, saving, isAdmin, runEndpoint } =
		useSurfaceExternalEndpoints();

	const statusVariant = (status: string | null) => {
		switch (status) {
			case "completed":
				return "default" as const;
			case "running":
			case "pending":
				return "secondary" as const;
			case "failed":
				return "destructive" as const;
			default:
				return "outline" as const;
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Globe className="w-5 h-5" />
					External Endpoints
				</CardTitle>
				<CardDescription>
					Endpoint sottoposti a External Exposure Scan. Sono derivati
					automaticamente dallo scope monitorato (domini e IP): per
					aggiungerli o rimuoverli, modifica lo scope in “Scope”.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				<div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
					Gli endpoint External sono <strong>generati automaticamente</strong> dallo
					scope monitorato (domini e IP pubblici del cliente) e scansionati dal cron
					settimanale. Non vanno inseriti manualmente qui.
				</div>

				{loading ? (
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<Loader2 className="w-4 h-4 animate-spin" /> Caricamento…
					</div>
				) : endpoints.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						Nessun endpoint esterno configurato.
					</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Nome</TableHead>
								<TableHead>Tipo</TableHead>
								<TableHead>Target</TableHead>
								<TableHead>Profilo</TableHead>
								<TableHead>Stato</TableHead>
								<TableHead>Grade</TableHead>
								<TableHead className="text-right">Vuln.</TableHead>
								<TableHead>Ultima scan</TableHead>
								{isAdmin && <TableHead className="text-right">Azioni</TableHead>}
							</TableRow>
						</TableHeader>
						<TableBody>
							{endpoints.map((ep) => (
								<TableRow key={ep.id}>
									<TableCell className="font-medium">{ep.name}</TableCell>
									<TableCell>{ADDRESS_TYPE_LABELS[ep.address_type]}</TableCell>
									<TableCell className="font-mono text-xs">
										{ep.address_value}
									</TableCell>
									<TableCell className="capitalize">{ep.scan_profile}</TableCell>
									<TableCell>
										<Badge variant={statusVariant(ep.last_status)}>
											{ep.last_status ?? (ep.enabled ? "idle" : "disabled")}
										</Badge>
									</TableCell>
									<TableCell>{ep.last_grade ?? "—"}</TableCell>
									<TableCell className="text-right">
										{ep.counts?.total ?? 0}
									</TableCell>
									<TableCell className="text-xs">
										{ep.last_scan_at
											? new Date(ep.last_scan_at).toLocaleString()
											: "—"}
									</TableCell>
									{isAdmin && (
										<TableCell className="text-right">
											<div className="flex justify-end gap-1">
												<Button
													size="sm"
													variant="ghost"
													disabled={saving || !ep.enabled}
													onClick={() => runEndpoint(ep.id)}
													title="Esegui ora"
												>
													<Play className="w-4 h-4" />
												</Button>
											</div>
										</TableCell>
									)}
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</CardContent>
		</Card>
	);
};

export default ExternalEndpointsPanel;
