import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useClientOrganization } from "@/hooks/useClientOrganization";
import { useModuleAccess } from "@/hooks/useModuleAccess";
import { getRequiredService } from "@/config/moduleServiceMap";
import { Button } from "@/components/ui/button";

interface ClientSelectionGuardProps {
	children: React.ReactNode;
}

/**
 * Guard che protegge le route che richiedono un cliente selezionato.
 * Per utenti sales/admin: redirect a /admin/clients se nessun cliente è selezionato.
 * Per utenti client normali: passa attraverso normalmente.
 */
export const ClientSelectionGuard: React.FC<ClientSelectionGuardProps> = ({
	children,
}) => {
	const location = useLocation();
	const { needsClientSelection, isLoading, hasFetchedOrganizations, selectedOrganization } =
		useClientOrganization();
	const { isRouteAllowed, servicesReady } = useModuleAccess();

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

	// Modulo non attivo per il cliente selezionato
	if (
		selectedOrganization &&
		servicesReady &&
		getRequiredService(location.pathname) &&
		!isRouteAllowed(location.pathname)
	) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-background p-6">
				<div className="max-w-md space-y-4 text-center">
					<h1 className="text-2xl font-semibold text-foreground">Modulo non attivo per questo cliente</h1>
					<p className="text-muted-foreground">
						{selectedOrganization.name} non ha questo servizio attivo. Puoi attivarlo dalla scheda Servizi del cliente.
					</p>
					<Button asChild>
						<a href="/dashboard">Torna alla dashboard</a>
					</Button>
				</div>
			</div>
		);
	}

	return <>{children}</>;
};
