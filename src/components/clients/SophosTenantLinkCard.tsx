// Collegamento del cliente al suo tenant Sophos Central (solo super-admin). Un
// tenant Sophos va a un solo cliente: quelli già collegati altrove non si
// possono scegliere. Ogni modifica è registrata in audit dal backend.
import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link2, Loader2, RefreshCw, Unlink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { sophosAdminApi } from "@/lib/api/sophos";

export function SophosTenantLinkCard({ organizationId }: { organizationId: string }) {
	const queryClient = useQueryClient();
	const [filter, setFilter] = useState("");
	const [choice, setChoice] = useState<string>("");

	const tenants = useQuery({ queryKey: ["sophos-partner-tenants"], queryFn: () => sophosAdminApi.tenants(), staleTime: 10 * 60_000 });
	const link = useQuery({ queryKey: ["sophos-link", organizationId], queryFn: () => sophosAdminApi.link(organizationId) });

	const refresh = () => {
		queryClient.invalidateQueries({ queryKey: ["sophos-link", organizationId] });
		queryClient.invalidateQueries({ queryKey: ["sophos-partner-tenants"] });
	};
	const save = useMutation({
		mutationFn: () => sophosAdminApi.save(organizationId, choice),
		onSuccess: () => {
			toast.success("Tenant Sophos collegato. I dati arrivano al prossimo giro di lettura (entro 15 minuti).");
			setChoice("");
			refresh();
		},
		onError: (e: Error) => toast.error(e.message || "Collegamento non riuscito"),
	});
	const remove = useMutation({
		mutationFn: () => sophosAdminApi.remove(organizationId),
		onSuccess: () => {
			toast.success("Collegamento Sophos rimosso");
			refresh();
		},
		onError: (e: Error) => toast.error(e.message || "Operazione non riuscita"),
	});

	const options = useMemo(() => {
		const q = filter.trim().toLowerCase();
		return (tenants.data ?? []).filter((t) => (!q || t.name.toLowerCase().includes(q)) && (!t.linkedTenantId || t.linkedTenantId === organizationId));
	}, [tenants.data, filter, organizationId]);

	return (
		<div className="space-y-2 rounded-md border p-3">
			<div className="flex items-center justify-between gap-2">
				<div>
					<p className="text-sm font-medium">Tenant Sophos Central</p>
					<p className="text-xs text-muted-foreground">Origine dei dati di HiEndpoint, HiFirewall, HiDetect, HiMail e HiMobile. Sola lettura.</p>
				</div>
				{link.data ? (
					<Badge variant="outline" className="gap-1 text-xs">
						<Link2 className="h-3 w-3" /> {link.data.sophosTenantName} · {link.data.dataRegion}
					</Badge>
				) : (
					<Badge variant="outline" className="text-xs text-muted-foreground">Non collegato</Badge>
				)}
			</div>

			{tenants.isError ? (
				<p className="text-xs text-red-500">Elenco dei tenant Sophos non disponibile: {(tenants.error as Error)?.message}</p>
			) : (
				<div className="flex flex-wrap items-center gap-2">
					<Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtra per nome…" className="h-8 w-40 text-xs" />
					<Select value={choice} onValueChange={setChoice} disabled={tenants.isLoading}>
						<SelectTrigger className="h-8 w-60 text-xs">
							<SelectValue placeholder={tenants.isLoading ? "Caricamento…" : `Scegli fra ${options.length} tenant`} />
						</SelectTrigger>
						<SelectContent>
							{options.map((t) => (
								<SelectItem key={t.id} value={t.id} className="text-xs">
									{t.name} · {t.dataRegion}
									{t.billingType === "trial" ? " · prova" : ""}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Button size="sm" className="h-8" disabled={!choice || save.isPending} onClick={() => save.mutate()}>
						{save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : link.data ? "Cambia" : "Collega"}
					</Button>
					{link.data && (
						<Button size="sm" variant="outline" className="h-8 gap-1" disabled={remove.isPending} onClick={() => remove.mutate()}>
							<Unlink className="h-3.5 w-3.5" /> Scollega
						</Button>
					)}
					<Button
						size="sm"
						variant="ghost"
						className="h-8 px-2"
						title="Rileggi l'elenco dei tenant"
						onClick={() => sophosAdminApi.tenants(true).then(() => queryClient.invalidateQueries({ queryKey: ["sophos-partner-tenants"] }))}
					>
						<RefreshCw className="h-3.5 w-3.5" />
					</Button>
				</div>
			)}
		</div>
	);
}
