import React from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useClientOrganization } from "@/hooks/useClientOrganization";
import { useModuleAccess } from "@/hooks/useModuleAccess";
import { useUserRoles } from "@/hooks/useUserRoles";
import { getRequiredService } from "@/config/moduleServiceMap";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";

interface ClientSelectionGuardProps {
	children: React.ReactNode;
}

/**
 * Guard che protegge le route che richiedono un cliente selezionato.
 * Per utenti sales/admin: redirect a /admin/clients se nessun cliente è selezionato.
 * Per utenti client normali: passa attraverso normalmente.
 * Una pagina legata a un servizio (vedi moduleServiceMap) si apre solo se il
 * servizio è attivo per il cliente, anche arrivando dall'indirizzo diretto.
 */
export const ClientSelectionGuard: React.FC<ClientSelectionGuardProps> = ({
	children,
}) => {
	const location = useLocation();
	const { needsClientSelection, isLoading, hasFetchedOrganizations, selectedOrganization } =
		useClientOrganization();
	const { isRouteAllowed, servicesReady } = useModuleAccess();
	const { isSuperAdmin, isSales } = useUserRoles();

	// Aspetta che il fetch iniziale + il restore da localStorage siano completati
	// prima di decidere se redirezionare, così evitiamo redirect spuri al refresh.
	if (isLoading || !hasFetchedOrganizations) {
		return <>{children}</>;
	}

	if (needsClientSelection && location.pathname !== "/admin/clients") {
		return (
			<Navigate
				to="/admin/clients"
				replace
				state={{ from: location.pathname + location.search }}
			/>
		);
	}

	// Si decide solo a servizi caricati: prima la pagina resta visibile, per non
	// mostrare "non attivo" per un istante a chi il servizio ce l'ha.
	if (
		selectedOrganization &&
		servicesReady &&
		getRequiredService(location.pathname) &&
		!isRouteAllowed(location.pathname)
	) {
		return (
			<DashboardLayout>
				<div className="mx-auto max-w-md space-y-4 py-24 text-center">
					<h1 className="text-2xl font-semibold text-foreground">
						Modulo non attivo per questo cliente
					</h1>
					<p className="text-muted-foreground">
						{selectedOrganization.name} non ha questo servizio attivo.
						{(isSuperAdmin || isSales) &&
							" Puoi attivarlo dalla scheda Servizi del cliente."}
					</p>
					<Button asChild>
						<Link to="/dashboard">Torna alla dashboard</Link>
					</Button>
				</div>
			</DashboardLayout>
		);
	}

	return <>{children}</>;
};
