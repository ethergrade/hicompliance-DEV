import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClientOrganization } from "@/hooks/useClientOrganization";
import { useUserRoles } from "@/hooks/useUserRoles";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar, Copy, Download, KeyRound, Link2, Loader2, ShieldCheck, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

const FN = "va-reports";

async function call<T = any>(body: Record<string, unknown>): Promise<T> {
	const { data, error } = await supabase.functions.invoke(FN, { body });
	if (error) {
		let msg = error.message;
		try { msg = (await (error as any).context?.json())?.error ?? msg; } catch { /* */ }
		throw new Error(msg);
	}
	return data as T;
}

/** Report di Vulnerability Assessment mensili dall'archivio esterno Nove (via funzione server va-reports). */
export function ExternalVaReports({ search, year }: { search: string; year: string }) {
	const { organizationId } = useClientOrganization();
	const { isSuperAdmin, isSales } = useUserRoles();
	const isManager = !!(isSuperAdmin || isSales);
	const qc = useQueryClient();
	const [linkOpen, setLinkOpen] = useState(false);
	const [open, setOpen] = useState<number | null>(null);
	const [pwd, setPwd] = useState<Record<number, string>>({});
	const [busy, setBusy] = useState<string | null>(null);

	const { data, isLoading, error } = useQuery({
		queryKey: ["va-reports", organizationId],
		enabled: !!organizationId,
		retry: false,
		queryFn: () => call({ action: "reviews", organization_id: organizationId }),
	});

	const detail = useQuery({
		queryKey: ["va-review", organizationId, open],
		enabled: !!organizationId && open != null,
		queryFn: () => call({ action: "review", organization_id: organizationId, review_id: open }),
	});

	const reviews = ((data as any)?.review ?? []).filter((r: any) => {
		const q = search.toLowerCase();
		return (year === "all" || String(r.creata_il).slice(0, 4) === year) &&
			(!q || r.nome.toLowerCase().includes(q) || (r.commessa || "").toLowerCase().includes(q));
	});

	const downloadZip = async (r: any) => {
		setBusy(`zip-${r.id}`);
		try {
			const { data: s } = await supabase.auth.getSession();
			const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${FN}`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
					Authorization: `Bearer ${s.session?.access_token}`,
				},
				body: JSON.stringify({ action: "zip", organization_id: organizationId, review_id: r.id }),
			});
			if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Download non riuscito");
			const url = URL.createObjectURL(await res.blob());
			const a = document.createElement("a");
			a.href = url; a.download = `${r.nome}.zip`; a.click();
			URL.revokeObjectURL(url);
			toast.success("Archivio scaricato. Serve la password per aprirlo.");
		} catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
	};

	const showPassword = async (r: any) => {
		setBusy(`pwd-${r.id}`);
		try {
			const d = await call({ action: "password", organization_id: organizationId, review_id: r.id });
			setPwd((p) => ({ ...p, [r.id]: d.password }));
		} catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
	};

	if (!organizationId) return <p className="text-center text-muted-foreground py-8">Seleziona un cliente.</p>;

	const linked = (data as any)?.linked;
	const cliente = (data as any)?.cliente;

	return (
		<div className="space-y-4">
			<Card className="border-border">
				<CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
					<div className="flex items-center gap-3 min-w-0">
						<ShieldCheck className="w-5 h-5 text-primary shrink-0" />
						<div className="min-w-0">
							<p className="font-medium">Vulnerability Assessment mensili</p>
							<p className="text-sm text-muted-foreground truncate">
								{linked ? `Cliente VA collegato: ${cliente?.ragione_sociale ?? cliente?.id}` : "Nessun cliente VA collegato"}
							</p>
						</div>
					</div>
					{isManager && (
						<Button variant="outline" size="sm" onClick={() => setLinkOpen(true)}>
							<Link2 className="w-4 h-4 mr-1" />{linked ? "Cambia collegamento" : "Collega cliente VA"}
						</Button>
					)}
				</CardContent>
			</Card>

			<Card className="border-border">
				<CardContent className="p-4">
					{isLoading ? (
						<div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
					) : error ? (
						<p className="text-center text-destructive py-8">{(error as Error).message}</p>
					) : !linked ? (
						<p className="text-center text-muted-foreground py-8">
							{isManager ? "Collega questo cliente al suo cliente VA per vedere i report." : "I report di Vulnerability Assessment non sono ancora disponibili."}
						</p>
					) : reviews.length === 0 ? (
						<p className="text-center text-muted-foreground py-8">Nessun report VA trovato.</p>
					) : (
						<div className="space-y-3">
							{reviews.map((r: any) => (
								<div key={r.id} className="rounded-lg border border-border bg-card">
									<div className="flex items-center justify-between gap-4 p-4 flex-wrap">
										<div className="flex items-center gap-4 min-w-0">
											<div className="p-2 rounded-lg bg-primary/10"><FileText className="w-4 h-4 text-primary" /></div>
											<div className="min-w-0">
												<h4 className="font-medium truncate">{r.nome}</h4>
												<div className="flex items-center gap-3 mt-1 flex-wrap">
													<span className="flex items-center gap-1 text-xs text-muted-foreground">
														<Calendar className="w-3 h-3" />{new Date(r.creata_il).toLocaleDateString("it-IT")}
													</span>
													<Badge variant="secondary">Vulnerability Assessment</Badge>
													{r.commessa && <span className="text-xs text-muted-foreground">Commessa {r.commessa}</span>}
													<span className="text-xs text-muted-foreground">{r.n_documenti} documenti</span>
												</div>
											</div>
										</div>
										<div className="flex items-center gap-2 shrink-0 flex-wrap">
											<Button variant="ghost" size="sm" onClick={() => setOpen(open === r.id ? null : r.id)}>
												{open === r.id ? <ChevronUp className="w-4 h-4 mr-1" /> : <ChevronDown className="w-4 h-4 mr-1" />}Contenuto
											</Button>
											{pwd[r.id] ? (
												<Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(pwd[r.id]); toast.success("Password copiata"); }}>
													<Copy className="w-4 h-4 mr-1" /><span className="font-mono">{pwd[r.id]}</span>
												</Button>
											) : (
												<Button variant="outline" size="sm" disabled={busy === `pwd-${r.id}`} onClick={() => showPassword(r)}>
													{busy === `pwd-${r.id}` ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <KeyRound className="w-4 h-4 mr-1" />}Mostra password
												</Button>
											)}
											<Button size="sm" disabled={busy === `zip-${r.id}`} onClick={() => downloadZip(r)}>
												{busy === `zip-${r.id}` ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}Scarica zip
											</Button>
										</div>
									</div>
									{open === r.id && (
										<div className="border-t border-border px-4 py-3 text-sm">
											{detail.isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
												<>
													{detail.data?.zip && <p className="text-xs text-muted-foreground mb-2">{detail.data.zip.nome_file} · {detail.data.zip.cifratura}</p>}
													<ul className="space-y-1">
														{(detail.data?.documenti ?? []).map((d: any) => (
															<li key={d.nome} className="flex justify-between gap-3">
																<span className="truncate">{d.etichetta ? `${d.etichetta} – ` : ""}{d.nome}</span>
																<span className="text-muted-foreground shrink-0">{(d.byte / 1048576).toFixed(1)} MB</span>
															</li>
														))}
													</ul>
												</>
											)}
										</div>
									)}
								</div>
							))}
						</div>
					)}
				</CardContent>
			</Card>

			{isManager && (
				<LinkDialog open={linkOpen} onOpenChange={setLinkOpen} organizationId={organizationId}
					onDone={() => qc.invalidateQueries({ queryKey: ["va-reports", organizationId] })} />
			)}
		</div>
	);
}

function LinkDialog({ open, onOpenChange, organizationId, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; organizationId: string; onDone: () => void }) {
	const [q, setQ] = useState("");
	const { data, isLoading, error } = useQuery({
		queryKey: ["va-clients", q],
		enabled: open,
		retry: false,
		queryFn: () => call({ action: "clients", q }),
	});
	const link = async (c: any | null) => {
		try {
			await call({ action: "link", organization_id: organizationId, cliente_id: c?.id ?? null, cliente_name: c?.ragione_sociale });
			toast.success(c ? `Collegato a ${c.ragione_sociale}` : "Collegamento rimosso");
			onDone(); onOpenChange(false);
		} catch (e: any) { toast.error(e.message); }
	};
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-lg">
				<DialogHeader><DialogTitle>Collega cliente VA</DialogTitle></DialogHeader>
				<Input placeholder="Cerca ragione sociale…" value={q} onChange={(e) => setQ(e.target.value)} />
				<div className="max-h-80 overflow-y-auto space-y-1">
					{isLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto my-6" /> :
						error ? <p className="text-sm text-destructive py-4">{(error as Error).message}</p> :
						((data as any)?.clienti ?? []).map((c: any) => (
							<button key={c.id} onClick={() => link(c)} className="w-full text-left rounded-md border border-border px-3 py-2 hover:bg-muted/50">
								<p className="font-medium">{c.ragione_sociale}</p>
								<p className="text-xs text-muted-foreground">{c.review_va} VA · ultima {c.ultima_review_va ? new Date(c.ultima_review_va).toLocaleDateString("it-IT") : "-"}</p>
							</button>
						))}
				</div>
				<Button variant="ghost" size="sm" onClick={() => link(null)}>Rimuovi collegamento</Button>
			</DialogContent>
		</Dialog>
	);
}
