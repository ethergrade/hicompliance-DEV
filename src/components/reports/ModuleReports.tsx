// @ts-nocheck -- incident_documents source columns added after types generation
import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useClientOrganization } from "@/hooks/useClientOrganization";
import { useModuleAccess } from "@/hooks/useModuleAccess";
import { documentsApi } from "@/lib/api/documents";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Download, ExternalLink, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

/** Moduli che producono report: sorgente in incident_documents.source_type → pagina modulo. */
export const REPORT_MODULES = [
	{ source: "compliance", label: "HiCompliance Assessment", route: "/assessment" },
	{ source: "surfacescan", label: "SurfaceScan360", route: "/surface-scan" },
	{ source: "darkrisk", label: "DarkRisk360", route: "/dark-risk" },
	{ source: "darkrisk_extended", label: "DarkRisk360 Esteso", route: "/dark-risk-esteso" },
	{ source: "irp", label: "Incident Response Plan", route: "/incident-response" },
] as const;

export function ModuleReports({ search, year }: { search: string; year: string }) {
	const { organizationId } = useClientOrganization();
	const { isRouteAllowed } = useModuleAccess();
	const navigate = useNavigate();
	const [module, setModule] = useState<string>("all");

	const modules = REPORT_MODULES.filter((m) => isRouteAllowed(m.route));
	const sources = modules.map((m) => m.source);

	const { data = [], isLoading } = useQuery({
		queryKey: ["module-reports", organizationId, sources.join(",")],
		enabled: !!organizationId && sources.length > 0,
		queryFn: async () => {
			const { data, error } = await supabase
				.from("incident_documents")
				.select("id,name,description,source_type,revision_date,uploaded_at,document_code")
				.eq("organization_id", organizationId)
				.in("source_type", sources)
				.order("uploaded_at", { ascending: false });
			if (error) throw error;
			return data || [];
		},
	});

	const dateOf = (r: any) => r.revision_date || r.uploaded_at;
	const filtered = useMemo(
		() =>
			data.filter((r: any) => {
				const q = search.toLowerCase();
				return (
					(module === "all" || r.source_type === module) &&
					(year === "all" || String(dateOf(r)).slice(0, 4) === year) &&
					(!q || r.name.toLowerCase().includes(q) || (r.description || "").toLowerCase().includes(q))
				);
			}),
		[data, module, search, year],
	);

	const download = async (r: any) => {
		try {
			const blob = await documentsApi.download(organizationId, r.id);
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `${r.name.replace(/[^\w\-–. ]+/g, "")}.pdf`;
			a.click();
			URL.revokeObjectURL(url);
		} catch {
			toast.error("Impossibile scaricare il report");
		}
	};

	if (!organizationId) return <p className="text-center text-muted-foreground py-8">Seleziona un cliente.</p>;

	return (
		<div className="space-y-4">
			<div className="grid grid-cols-2 md:grid-cols-5 gap-3">
				{modules.map((m) => {
					const rows = data.filter((r: any) => r.source_type === m.source);
					const active = module === m.source;
					return (
						<button
							key={m.source}
							onClick={() => setModule(active ? "all" : m.source)}
							className={`text-left rounded-lg border p-3 transition-colors min-w-0 ${active ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted/50"}`}
						>
							<p className="text-xs text-muted-foreground truncate">{m.label}</p>
							<p className="text-2xl font-bold text-foreground">{rows.length}</p>
							<p className="text-xs text-muted-foreground">
								{rows[0] ? `Ultimo: ${new Date(dateOf(rows[0])).toLocaleDateString("it-IT")}` : "Nessun report"}
							</p>
						</button>
					);
				})}
			</div>

			<div className="flex flex-wrap gap-2">
				<Button size="sm" variant={module === "all" ? "default" : "outline"} onClick={() => setModule("all")}>Tutti</Button>
				{modules.map((m) => (
					<Button key={m.source} size="sm" variant={module === m.source ? "default" : "outline"} onClick={() => setModule(m.source)}>
						{m.label}
					</Button>
				))}
			</div>

			<Card className="border-border">
				<CardContent className="p-4">
					{isLoading ? (
						<div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
					) : filtered.length === 0 ? (
						<p className="text-center text-muted-foreground py-8">Nessun report trovato per i filtri selezionati.</p>
					) : (
						<div className="space-y-3">
							{filtered.map((r: any) => {
								const m = REPORT_MODULES.find((x) => x.source === r.source_type);
								return (
									<div key={r.id} className="flex items-center justify-between gap-4 p-4 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors">
										<div className="flex items-center gap-4 min-w-0">
											<div className="p-2 rounded-lg bg-primary/10"><FileText className="w-4 h-4 text-primary" /></div>
											<div className="min-w-0">
												<h4 className="font-medium truncate">{r.name}</h4>
												{r.description && <p className="text-sm text-muted-foreground truncate">{r.description}</p>}
												<div className="flex items-center gap-3 mt-1 flex-wrap">
													<span className="flex items-center gap-1 text-xs text-muted-foreground">
														<Calendar className="w-3 h-3" />{new Date(dateOf(r)).toLocaleDateString("it-IT")}
													</span>
													<Badge variant="secondary">{m?.label}</Badge>
													{r.document_code && <span className="text-xs text-muted-foreground">{r.document_code}</span>}
												</div>
											</div>
										</div>
										<div className="flex items-center gap-2 shrink-0">
											{m && (
												<Button variant="outline" size="sm" onClick={() => navigate(m.route)}>
													<ExternalLink className="w-4 h-4 mr-1" />Apri
												</Button>
											)}
											<Button size="sm" onClick={() => download(r)}><Download className="w-4 h-4 mr-1" />Scarica</Button>
										</div>
									</div>
								);
							})}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
