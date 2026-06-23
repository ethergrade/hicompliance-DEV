import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useClientContext } from "@/contexts/ClientContext";
import { useUserRoles } from "@/hooks/useUserRoles";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Search,
	X,
	Building2,
	Calendar,
	ArrowRight,
	Users,
	FileText,
	Server,
	Plug,
	Pencil,
	Trash2,
	ShieldCheck,
	Plus,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { groupsApi } from "@/lib/api";
import { toast } from "sonner";
import ClientProfileSheet from "@/components/clients/ClientProfileSheet";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import ClientAssetSheet from "@/components/clients/ClientAssetSheet";
import ClientServicesDialog from "@/components/clients/ClientServicesDialog";
import ClientCrudDialog from "@/components/clients/ClientCrudDialog";
import ClientContactsDialog from "@/components/clients/ClientContactsDialog";
import DeleteClientDialog from "@/components/clients/DeleteClientDialog";

const ClientSelection: React.FC = () => {
	const navigate = useNavigate();
	const location = useLocation();
	const {
		organizations,
		setSelectedOrganization,
		isLoadingClients,
		selectedOrganization,
		fetchOrganizations,
	} = useClientContext();
	const { isSuperAdmin } = useUserRoles();
	// Search starts empty on client selection page — selectedOrganization does not pre-filter the list
	const [searchQuery, setSearchQuery] = useState("");

	const [editingOrgId, setEditingOrgId] = useState<string | null>(null);
	const [editingOrgName, setEditingOrgName] = useState<string>("");
	const [profileOpen, setProfileOpen] = useState(false);
	const [assetOpen, setAssetOpen] = useState(false);
	const [servicesOpen, setServicesOpen] = useState(false);
	const [contactsOpen, setContactsOpen] = useState(false);

	// CRUD state
	const [crudOpen, setCrudOpen] = useState(false);
	const [crudOrg, setCrudOrg] = useState<{
		id: string;
		name: string;
		code: string;
	} | null>(null);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [deleteOrg, setDeleteOrg] = useState<{
		id: string;
		name: string;
	} | null>(null);

	// Create with group selection
	const [createGroupId, setCreateGroupId] = useState<string | null>(null);
	const [groupSelectOpen, setGroupSelectOpen] = useState(false);
	const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
	const [groupsLoading, setGroupsLoading] = useState(false);

	const filteredOrganizations = organizations
		.filter((org) => {
			if (!searchQuery.trim()) return true;
			const query = searchQuery.toLowerCase();
			return (
				(org.name ?? "").toLowerCase().includes(query) ||
				(org.code ?? "").toLowerCase().includes(query)
			);
		})
		.sort((a, b) =>
			(a.name ?? "").localeCompare(b.name ?? "", "it", { sensitivity: "base" }),
		);

	const handleSelectClient = (org: (typeof organizations)[0]) => {
		setSelectedOrganization(org);
		const from = (location.state as { from?: string } | null)?.from;
		navigate(from || "/dashboard");
	};

	const openProfile = (e: React.MouseEvent, org: (typeof organizations)[0]) => {
		e.stopPropagation();
		setEditingOrgId(org.id);
		setEditingOrgName(org.name);
		setProfileOpen(true);
	};

	const openAsset = (e: React.MouseEvent, org: (typeof organizations)[0]) => {
		e.stopPropagation();
		setEditingOrgId(org.id);
		setEditingOrgName(org.name);
		setAssetOpen(true);
	};

	const openServices = (
		e: React.MouseEvent,
		org: (typeof organizations)[0],
	) => {
		e.stopPropagation();
		setEditingOrgId(org.id);
		setEditingOrgName(org.name);
		setServicesOpen(true);
	};

	const openContacts = (
		e: React.MouseEvent,
		org: (typeof organizations)[0],
	) => {
		e.stopPropagation();
		setEditingOrgId(org.id);
		setEditingOrgName(org.name);
		setContactsOpen(true);
	};

	const openEdit = (e: React.MouseEvent, org: (typeof organizations)[0]) => {
		e.stopPropagation();
		setCrudOrg({ id: org.id, name: org.name, code: org.code });
		setCrudOpen(true);
	};

	const openDelete = (e: React.MouseEvent, org: (typeof organizations)[0]) => {
		e.stopPropagation();
		setDeleteOrg({ id: org.id, name: org.name });
		setDeleteOpen(true);
	};

	const openCreate = async () => {
		if (selectedOrganization?.group_id) {
			setCreateGroupId(selectedOrganization.group_id);
			setCrudOrg(null);
			setCrudOpen(true);
			return;
		}
		setGroupsLoading(true);
		try {
			const list = await groupsApi.list();
			setGroups(list);
			if (list.length === 1) {
				setCreateGroupId(list[0].id);
				setCrudOrg(null);
				setCrudOpen(true);
			} else {
				setGroupSelectOpen(true);
			}
		} catch {
			toast.error("Errore nel caricamento gruppi");
		} finally {
			setGroupsLoading(false);
		}
	};

	const handleSelectGroupForCreate = (groupId: string) => {
		setCreateGroupId(groupId);
		setGroupSelectOpen(false);
		setCrudOrg(null);
		setCrudOpen(true);
	};

	if (isLoadingClients) {
		return (
			<DashboardLayout>
				<div className="space-y-6">
					<Skeleton className="h-10 w-64" />
					<Skeleton className="h-12 w-full max-w-md" />
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
						{[1, 2, 3, 4, 5, 6].map((i) => (
							<Skeleton key={i} className="h-48 rounded-xl" />
						))}
					</div>
				</div>
			</DashboardLayout>
		);
	}

	return (
		<DashboardLayout>
			<div className="space-y-6">
				{/* Header */}
				<div className="flex items-center justify-between">
					<div>
						<div className="flex items-center gap-3 mb-2">
							<div className="p-2 rounded-lg bg-primary/10">
								<Users className="w-6 h-6 text-primary" />
							</div>
							<h1 className="text-3xl font-bold text-foreground">
								Gestione Clienti
							</h1>
						</div>
						<p className="text-muted-foreground ml-12">
							Seleziona un cliente per visualizzare e gestire i suoi dati
						</p>
					</div>
					<Button
						onClick={openCreate}
						className="gap-2"
						disabled={groupsLoading}
					>
						<Plus className="w-4 h-4" />
						{groupsLoading ? "Caricamento..." : "Nuovo Cliente"}
					</Button>
				</div>

				{/* Search */}
				<div className="relative max-w-md">
					<Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
					<Input
						placeholder="Cerca per nome o codice cliente..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="pl-10 pr-8"
					/>
					{searchQuery && (
						<button
							onClick={() => setSearchQuery("")}
							className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
						>
							<X className="w-4 h-4" />
						</button>
					)}
				</div>

				{/* Stats */}
				<div className="flex items-center gap-4">
					<Badge variant="outline" className="text-sm">
						{filteredOrganizations.length}{" "}
						{filteredOrganizations.length === 1 ? "cliente" : "clienti"}
					</Badge>
					{selectedOrganization && (
						<Badge variant="secondary" className="text-sm">
							Attualmente: {selectedOrganization.name}
						</Badge>
					)}
				</div>

				{/* Client Grid */}
				{filteredOrganizations.length === 0 ? (
					<Card className="text-center py-12">
						<CardContent>
							<Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
							<p className="text-muted-foreground">
								{searchQuery
									? "Nessun cliente trovato con questi criteri"
									: "Nessun cliente disponibile"}
							</p>
						</CardContent>
					</Card>
				) : (
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
						{filteredOrganizations.map((org) => (
							<Card
								key={org.id}
								className={`group cursor-pointer transition-all hover:shadow-lg hover:border-primary/50 ${
									selectedOrganization?.id === org.id
										? "ring-2 ring-primary border-primary"
										: ""
								}`}
								onClick={() => handleSelectClient(org)}
							>
								<CardHeader className="pb-3">
									<div className="flex items-start justify-between">
										<div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
											<Building2 className="w-5 h-5 text-primary" />
										</div>
										<div className="flex items-center gap-1">
											{selectedOrganization?.id === org.id && (
												<Badge variant="default" className="text-xs">
													Attivo
												</Badge>
											)}
											{isSuperAdmin && (
												<>
													<Button
														variant="ghost"
														size="icon"
														className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
														onClick={(e) => openEdit(e, org)}
													>
														<Pencil className="w-3.5 h-3.5" />
													</Button>
													<Button
														variant="ghost"
														size="icon"
														className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
														onClick={(e) => openDelete(e, org)}
													>
														<Trash2 className="w-3.5 h-3.5" />
													</Button>
												</>
											)}
										</div>
									</div>
									<CardTitle className="text-lg mt-3 group-hover:text-primary transition-colors">
										{org.name}
									</CardTitle>
									<CardDescription className="font-mono text-xs">
										{org.code}
									</CardDescription>
								</CardHeader>
								<CardContent className="pt-0">
									<div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
										<Calendar className="w-3 h-3" />
										<span>
											Creato il{" "}
											{format(new Date(org.created_at), "d MMMM yyyy", {
												locale: it,
											})}
										</span>
									</div>

									{/* Quick edit buttons */}
									<div className="flex flex-wrap gap-2 mb-3">
										<Button
											variant="outline"
											size="sm"
											className="flex-1 text-xs min-w-[110px]"
											onClick={(e) => openProfile(e, org)}
										>
											<FileText className="w-3.5 h-3.5 mr-1" />
											Anagrafica
										</Button>
										<Button
											variant="outline"
											size="sm"
											className="flex-1 text-xs min-w-[110px]"
											onClick={(e) => openAsset(e, org)}
										>
											<Server className="w-3.5 h-3.5 mr-1" />
											Consistenze
										</Button>
										<Button
											variant="outline"
											size="sm"
											className="flex-1 text-xs min-w-[110px]"
											onClick={(e) => openContacts(e, org)}
										>
											<ShieldCheck className="w-3.5 h-3.5 mr-1" />
											Rubrica
										</Button>
										{isSuperAdmin && (
											<Button
												variant="outline"
												size="sm"
												className="flex-1 text-xs min-w-[110px]"
												onClick={(e) => openServices(e, org)}
											>
												<Plug className="w-3.5 h-3.5 mr-1" />
												Servizi
											</Button>
										)}
									</div>

									<Button
										variant="ghost"
										className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
									>
										<span>Gestisci</span>
										<ArrowRight className="w-4 h-4 ml-2" />
									</Button>
								</CardContent>
							</Card>
						))}
					</div>
				)}
			</div>

			{/* Sheets */}
			<ClientProfileSheet
				organizationId={editingOrgId}
				organizationName={editingOrgName}
				groupId={organizations.find((o) => o.id === editingOrgId)?.group_id}
				open={profileOpen}
				onOpenChange={setProfileOpen}
			/>
			<ClientAssetSheet
				organizationId={editingOrgId}
				organizationName={editingOrgName}
				open={assetOpen}
				onOpenChange={setAssetOpen}
			/>
			{isSuperAdmin &&
				editingOrgId &&
				(() => {
					const editingOrg = organizations.find((o) => o.id === editingOrgId);
					const editingGroupId = editingOrg?.group_id ?? null;
					return (
						<ClientServicesDialog
							organizationId={editingOrgId}
							organizationName={editingOrgName}
							groupId={editingGroupId}
							open={servicesOpen}
							onOpenChange={setServicesOpen}
						/>
					);
				})()}
			{editingOrgId &&
				(() => {
					const editingOrg = organizations.find((o) => o.id === editingOrgId);
					const editingGroupId = editingOrg?.group_id ?? null;
					return (
						<ClientContactsDialog
							organizationId={editingOrgId}
							organizationName={editingOrgName}
							groupId={editingGroupId}
							open={contactsOpen}
							onOpenChange={setContactsOpen}
						/>
					);
				})()}

			{/* Group selector dialog for creation */}
			<Dialog open={groupSelectOpen} onOpenChange={setGroupSelectOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Seleziona un gruppo</DialogTitle>
						<DialogDescription>
							Scegli l'azienda (gruppo) per il nuovo cliente
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-2 py-2 max-h-[300px] overflow-y-auto">
						{groups.map((g) => (
							<Button
								key={g.id}
								variant="outline"
								className="w-full justify-start"
								onClick={() => handleSelectGroupForCreate(g.id)}
							>
								<Building2 className="w-4 h-4 mr-2" />
								{g.name}
							</Button>
						))}
						{groups.length === 0 && (
							<p className="text-sm text-muted-foreground text-center">
								Nessun gruppo disponibile
							</p>
						)}
					</div>
				</DialogContent>
			</Dialog>

			{/* CRUD Dialogs */}
			<ClientCrudDialog
				open={crudOpen}
				onOpenChange={setCrudOpen}
				organization={crudOrg}
				onSaved={fetchOrganizations}
				groupId={createGroupId}
			/>
			<DeleteClientDialog
				open={deleteOpen}
				onOpenChange={setDeleteOpen}
				organization={deleteOrg}
				onDeleted={fetchOrganizations}
			/>
		</DashboardLayout>
	);
};

export default ClientSelection;
