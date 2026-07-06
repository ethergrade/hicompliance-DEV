import React, { useState } from "react";
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
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, Trash2, Globe } from "lucide-react";
import { useSurfaceExternalEndpoints } from "@/hooks/useSurfaceExternalEndpoints";
import type {
	ExternalEndpointAddressType,
	ExternalEndpointScanProfile,
} from "@/lib/api/surface-scan360";

const ADDRESS_TYPE_LABELS: Record<ExternalEndpointAddressType, string> = {
	static_ip: "Static IP",
	domain: "Domain",
	ip_range: "IP Range",
};

const emptyForm = {
	name: "",
	address_type: "domain" as ExternalEndpointAddressType,
	address_value: "",
	scan_profile: "quick" as ExternalEndpointScanProfile,
	enabled: true,
};

const ExternalEndpointsPanel: React.FC = () => {
	const {
		endpoints,
		loading,
		saving,
		isAdmin,
		canDeep,
		createEndpoint,
		deleteEndpoint,
		runEndpoint,
	} = useSurfaceExternalEndpoints();

	const [form, setForm] = useState({ ...emptyForm });

	const handleCreate = async () => {
		if (!form.name.trim() || !form.address_value.trim()) return;
		const ok = await createEndpoint({
			name: form.name.trim(),
			address_type: form.address_type,
			address_value: form.address_value.trim(),
			scan_profile: form.scan_profile,
			enabled: form.enabled,
		});
		if (ok) setForm({ ...emptyForm });
	};

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
					Configura gli endpoint esterni (domini, IP pubblici, range) da
					sottoporre a External Exposure Scan.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				{isAdmin && (
					<div className="grid gap-3 rounded-lg border p-4 md:grid-cols-2">
						<div className="space-y-1">
							<Label>Nome *</Label>
							<Input
								value={form.name}
								onChange={(e) => setForm({ ...form, name: e.target.value })}
								placeholder="Es. Sito corporate"
							/>
						</div>
						<div className="space-y-1">
							<Label>Tipo indirizzo *</Label>
							<Select
								value={form.address_type}
								onValueChange={(v) =>
									setForm({
										...form,
										address_type: v as ExternalEndpointAddressType,
									})
								}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="domain">Domain</SelectItem>
									<SelectItem value="static_ip">Static IP</SelectItem>
									<SelectItem value="ip_range">IP Range</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-1">
							<Label>Target *</Label>
							<Input
								value={form.address_value}
								onChange={(e) =>
									setForm({ ...form, address_value: e.target.value })
								}
								placeholder={
									form.address_type === "ip_range"
										? "8.8.8.0/24"
										: form.address_type === "static_ip"
											? "8.8.8.8"
											: "example.com"
								}
							/>
						</div>
						<div className="space-y-1">
							<Label>Profilo scan *</Label>
							<Select
								value={form.scan_profile}
								onValueChange={(v) =>
									setForm({
										...form,
										scan_profile: v as ExternalEndpointScanProfile,
									})
								}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="quick">Quick Scan</SelectItem>
									<SelectItem value="detailed">
										Detailed Scan (top ~3500 porte IANA)
									</SelectItem>
									{canDeep && (
										<SelectItem value="deep">Deep Scan</SelectItem>
									)}
								</SelectContent>
							</Select>
						</div>
						<div className="flex items-center gap-2">
							<Switch
								checked={form.enabled}
								onCheckedChange={(c) => setForm({ ...form, enabled: c })}
							/>
							<Label>Abilitato</Label>
						</div>
						<div className="flex items-end justify-end">
							<Button onClick={handleCreate} disabled={saving}>
								{saving ? (
									<Loader2 className="w-4 h-4 animate-spin" />
								) : (
									"Aggiungi endpoint"
								)}
							</Button>
						</div>
					</div>
				)}

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
													title="Run now"
												>
													<Play className="w-4 h-4" />
												</Button>
												<AlertDialog>
													<AlertDialogTrigger asChild>
														<Button
															size="sm"
															variant="ghost"
															disabled={saving}
															title="Elimina"
														>
															<Trash2 className="w-4 h-4 text-destructive" />
														</Button>
													</AlertDialogTrigger>
													<AlertDialogContent>
														<AlertDialogHeader>
															<AlertDialogTitle>
																Eliminare l'endpoint?
															</AlertDialogTitle>
															<AlertDialogDescription>
																"{ep.name}" ({ep.address_value}) verrà rimosso.
																L'azione non è reversibile.
															</AlertDialogDescription>
														</AlertDialogHeader>
														<AlertDialogFooter>
															<AlertDialogCancel>Annulla</AlertDialogCancel>
															<AlertDialogAction
																onClick={() => deleteEndpoint(ep.id)}
															>
																Elimina
															</AlertDialogAction>
														</AlertDialogFooter>
													</AlertDialogContent>
												</AlertDialog>
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
