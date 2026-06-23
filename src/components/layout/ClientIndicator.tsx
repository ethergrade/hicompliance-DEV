import React, { useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useClientContext } from "@/contexts/ClientContext";
import { tenantServicesApi } from "@/lib/api/tenant-services";
import { Badge } from "@/components/ui/badge";
import { Building2, Users } from "lucide-react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

// Map routes to required service types
const SERVICE_ROUTE_MAP: Record<string, string> = {
	"/dark-risk": "darkrisk",
	"/surface-scan": "surfacescan",
};

export const ClientIndicator: React.FC = () => {
	const navigate = useNavigate();
	const location = useLocation();
	const {
		selectedOrganization,
		selectedGroup,
		groups,
		canManageMultipleClients,
		organizations,
		setSelectedOrganization,
		setSelectedGroup,
		isLoadingClients,
	} = useClientContext();

	// Tutti gli hook devono essere prima di qualsiasi return condizionale
	const filteredOrganizations = useMemo(() => {
		if (!selectedGroup) return organizations;
		return organizations.filter((org) => org.group_id === selectedGroup.id);
	}, [organizations, selectedGroup]);

	const handleGroupChange = (groupId: string) => {
		const group = groups.find((g) => g.id === groupId);
		if (group) {
			setSelectedGroup(group);
		}
	};

	const handleOrganizationChange = async (organizationId: string) => {
		const organization = filteredOrganizations.find(
			(org) => org.id === organizationId,
		);
		if (!organization) return;

		setSelectedOrganization(organization);

		const currentPath = location.pathname;
		const requiredService = SERVICE_ROUTE_MAP[currentPath];

		if (requiredService && organization.group_id) {
			try {
				const services = await tenantServicesApi.listByOrganization(
					organization.id,
					organization.group_id,
				);
				const orgServices = services.filter(
					(s) => s.tenant_id === organization.id,
				);
				const hasService = orgServices.some(
					(s) => s.service_type === requiredService && s.status === "active",
				);
				if (!hasService) {
					navigate("/dashboard", { replace: true });
				}
			} catch {
				navigate("/dashboard", { replace: true });
			}
		}
	};

	const showGroupSelector = groups.length > 1;

	// Show selector if the user can manage multiple clients OR if the client
	// belongs to multiple organizations (card #54).
	const showClientSelector =
		canManageMultipleClients || organizations.length > 1;

	// Return condizionale DOPO tutti gli hook
	if (!showClientSelector) return null;

	return (
		<div className="flex flex-col gap-3 border-b border-border bg-primary/5 px-4 py-3 md:flex-row md:items-center">
			{/* Group Selector - Only show if multiple groups */}
			{showGroupSelector && (
				<>
					<div className="flex items-center gap-2 text-sm">
						<Users className="w-4 h-4 text-primary" />
						<span className="text-muted-foreground">Aziende:</span>
					</div>
					<div className="flex items-center gap-3">
						<Select
							value={selectedGroup?.id}
							onValueChange={handleGroupChange}
							disabled={isLoadingClients || groups.length === 0}
						>
							<SelectTrigger className="w-full max-w-[180px] bg-background">
								<SelectValue placeholder="Seleziona gruppo" />
							</SelectTrigger>
							<SelectContent>
								{groups.map((group) => (
									<SelectItem key={group.id} value={group.id}>
										{group.name || `Gruppo ${group.id.slice(0, 8)}`}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="hidden md:block w-px h-6 bg-border mx-2" />
				</>
			)}

			{/* Organization/Client Selector */}
			<div className="flex items-center gap-2 text-sm">
				<Building2 className="w-4 h-4 text-primary" />
				<span className="text-muted-foreground">Clienti:</span>
			</div>
			<div className="flex flex-1 items-center gap-3">
				<Select
					value={selectedOrganization?.id}
					onValueChange={handleOrganizationChange}
					disabled={isLoadingClients || filteredOrganizations.length === 0}
				>
					<SelectTrigger className="w-full max-w-[280px] bg-background">
						<SelectValue
							placeholder={
								selectedGroup
									? "Seleziona azienda"
									: "Seleziona prima un gruppo"
							}
						/>
					</SelectTrigger>
					<SelectContent>
						{filteredOrganizations.map((organization) => (
							<SelectItem key={organization.id} value={organization.id}>
								{organization.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				{selectedOrganization ? (
					<Badge
						variant="secondary"
						className="font-medium hidden sm:inline-flex"
					>
						{selectedOrganization.name}
					</Badge>
				) : (
					<span className="text-sm italic text-muted-foreground hidden sm:inline">
						Nessuna azienda selezionata
					</span>
				)}
			</div>
		</div>
	);
};
