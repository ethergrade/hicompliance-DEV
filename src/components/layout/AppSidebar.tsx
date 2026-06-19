import React, { useState, useEffect } from "react";
import { NavLink, Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
	LayoutDashboard,
	Shield,
	ShieldCheck,
	Users,
	Settings,
	BarChart3,
	AlertTriangle,
	FileText,
	Lock,
	Cloud,
	Network,
	LogOut,
	Globe,
	Building,
	Eye,
	ClipboardCheck,
	Home,
	Wrench,
	Bell,
	Package,
	FileCheck,
	Building2,
	Newspaper,
	PieChart,
	ChevronDown,
	Bot,
	KeyRound,
	Download,
	Radar,
} from "lucide-react";
import { SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarHeader,
	SidebarFooter,
	useSidebar,
} from "@/components/ui/sidebar";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useAuth } from "@/components/auth/AuthProvider";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { ChangePasswordDialog } from "@/components/auth/ChangePasswordDialog";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { usePermissions } from "@/hooks/usePermissions";
import { useClientContext } from "@/contexts/ClientContext";
import { useQuery } from "@tanstack/react-query";
import { tenantServicesApi } from "@/lib/api";

const navigation = [
	{ title: "Home", href: "/", icon: Home },
	{ title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
	// { title: 'AI CISO', href: '/ai-ciso', icon: Bot, superAdminOnly: true }, // HIDDEN: supabase-only (ai_ciso_conversations), no backend API
	{ title: "CyberNews", href: "/cyber-news", icon: Newspaper },
	{ title: "Minacce", href: "/threats", icon: AlertTriangle },
	{ title: "Report", href: "/reports", icon: FileText },
	{ title: "Gestione Documenti", href: "/documents", icon: FileText },
	{ title: "Inventario Asset", href: "/asset-inventory", icon: Package },
	{ title: "Consistenze", href: "/consistenze", icon: Package },
];

const hiComplianceModules = [
	{ title: "Assessment", href: "/assessment", icon: ClipboardCheck },
	{ title: "Remediation", href: "/remediation", icon: Wrench },
	{ title: "Consistenze", href: "/consistenze", icon: Package },
];

const hiComplianceServices = [
	{ title: "SurfaceScan360", href: "/surface-scan", icon: Globe },
	{ title: "DarkRisk360", href: "/dark-risk", icon: Eye },
];

const incidentMainItems = [
	{
		title: "Incident Response",
		href: "/incident-response",
		icon: AlertTriangle,
	},
];

const complianceEventItems = [
	{ title: "Eventi Compliance", href: "/compliance-events", icon: FileCheck },
];

const adminNavigation = [
	{
		title: "Gestione Clienti",
		href: "/admin/clients",
		icon: Building2,
	},
	{
		title: "Aziende & Clienti",
		href: "/admin/companies",
		icon: Building,
	},
	// { title: 'Reportistica Aggregata', href: '/admin/reporting', icon: PieChart }, // HIDDEN: supabase-only, no backend API
	{
		title: "Utenti Elevated",
		href: "/admin/elevated-users",
		icon: Shield,
		superAdminOnly: true,
	},
	{
		title: "Gestione Ruoli",
		href: "/admin/role-settings",
		icon: Settings,
	},
	{
		title: "NUCLEI-SCAN360",
		href: "/admin/nuclei-scan360",
		icon: Radar,
		superAdminOnly: true,
	},
];

export const AppSidebar: React.FC = () => {
	const location = useLocation();
	const { state, isMobile } = useSidebar();
	const collapsed = state === "collapsed";
	const { user, refreshCapabilities } = useAuth();
	const { isSuperAdmin, isSales, isAdmin } = useUserRoles();
	const { isModuleEnabled } = useRolePermissions();
	const { selectedOrganization, canManageMultipleClients } = useClientContext();
	const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);

	const isConsoleUser = isSuperAdmin || isSales;
	const isLockedSalesUser =
		isSales &&
		String(user?.email || "")
			.trim()
			.toLowerCase() === "sales@sales.com";
	const platformName = isConsoleUser ? "HiSolution Console" : "HiCompliance";

	// Reload capabilities from /auth/me whenever the active group changes
	const groupId = selectedOrganization?.group_id ?? null;
	useEffect(() => {
		if (groupId) refreshCapabilities(groupId);
	}, [groupId, refreshCapabilities]);

	// Fetch HiCompliance service status from API to gate sidebar modules
	const { data: orgFlags } = useQuery({
		queryKey: ["sidebar-org-flags", selectedOrganization?.id, groupId],
		queryFn: async () => {
			if (!selectedOrganization?.id) return { hicompliance_enabled: false };
			try {
				const services = await tenantServicesApi.listByOrganization(
					selectedOrganization.id,
					groupId,
				);
				const orgServices = services.filter(
					(s) => s.tenant_id === selectedOrganization.id,
				);
				const hicomplianceActive = orgServices.some(
					(s) => s.service_type === "hicompliance" && s.status === "active",
				);
				const surfaceScanActive = orgServices.some(
					(s) => s.service_type === "surfacescan" && s.status === "active",
				);
				const darkRiskActive = orgServices.some(
					(s) => s.service_type === "darkrisk" && s.status === "active",
				);
				const hipatchActive = orgServices.some(
					(s) => s.service_type === "hipatch" && s.status === "active",
				);
				return {
					hicompliance_enabled: hicomplianceActive,
					surface_scan360_enabled: surfaceScanActive,
					dark_risk360_enabled: darkRiskActive,
					hipatch_enabled: hipatchActive,
				};
			} catch {
				return {
					hicompliance_enabled: false,
					surface_scan360_enabled: false,
					dark_risk360_enabled: false,
				};
			}
		},
		enabled: !!selectedOrganization?.id,
	});

	const forceDemoAccessForSalesCliente1 =
		isLockedSalesUser &&
		String(selectedOrganization?.code || "")
			.trim()
			.toLowerCase() === "cliente1";
	const hicomplianceOn = forceDemoAccessForSalesCliente1
		? true
		: !!orgFlags?.hicompliance_enabled;
	const surfaceScanOn = !!orgFlags?.surface_scan360_enabled;
	const darkRiskOn = !!orgFlags?.dark_risk360_enabled;
	const hipatchOn = !!orgFlags?.hipatch_enabled;
	const { canViewRoute, hasCapability } = usePermissions();

	const isFeatureAllowed = (href: string) => {
		// SuperAdmin/Sales without a selected org see everything (console view)
		if (isConsoleUser && !selectedOrganization) return true;
		if (href === "/surface-scan" || href === "/surface-scan/exposure")
			return surfaceScanOn;
		if (href === "/dark-risk") return darkRiskOn;
		if (href === "/dashboard/service/hi_patch") return hipatchOn;
		// HiCompliance core modules
		if (
			[
				"/assessment",
				"/analytics",
				"/remediation",
				"/incident-response",
				"/compliance-events",
			].includes(href)
		) {
			return hicomplianceOn;
		}
		return true;
	};

	const isUserAllowed = (href: string) => canViewRoute(href);

	const filteredNavigation = navigation.filter((item) => {
		if ((item as any).superAdminOnly && !isSuperAdmin) return false;
		return isModuleEnabled(item.href) && isUserAllowed(item.href);
	});

	const visibleHiCompliance = hiComplianceModules.filter(
		(item) =>
			isModuleEnabled(item.href) &&
			isFeatureAllowed(item.href) &&
			isUserAllowed(item.href),
	);
	const visibleComplianceEvents = complianceEventItems.filter(
		(item) =>
			isModuleEnabled(item.href) &&
			isFeatureAllowed(item.href) &&
			isUserAllowed(item.href),
	);

	// Servizi Dark Risk e Surface Scan: 1 solo → Generale; entrambi → HiCompliance
	const visibleServices = hiComplianceServices.filter(
		(item) => isFeatureAllowed(item.href) && isUserAllowed(item.href),
	);
	const servicesStandalone =
		visibleServices.length === 1 ? visibleServices : [];
	const servicesInHiCompliance =
		visibleServices.length >= 2 ? visibleServices : [];

	// HiCompliance mostra moduli base + servizi (se entrambi attivi)
	const hiComplianceGroupVisible =
		visibleHiCompliance.length > 0 ||
		visibleComplianceEvents.length > 0 ||
		servicesInHiCompliance.length > 0;

	const hiComplianceActive = [
		...hiComplianceModules,
		...complianceEventItems,
	].some((item) => location.pathname === item.href);
	const complianceEventsActive = complianceEventItems.some(
		(item) => location.pathname === item.href,
	);

	const [hiComplianceOpen, setHiComplianceOpen] = React.useState<boolean>(true);
	const [complianceEventsOpen, setComplianceEventsOpen] = React.useState(
		complianceEventsActive,
	);
	const [servicesOpen, setServicesOpen] = React.useState(false);

	const renderNavItem = (
		item: { title: string; href: string; icon: React.ElementType },
		indent = false,
	) => {
		const isActive = location.pathname === item.href;
		return (
			<SidebarMenuItem key={item.href}>
				<SidebarMenuButton
					asChild
					className={`
            ${indent ? "ml-4 mr-2" : "mx-2"} rounded-lg transition-all duration-200
            ${
							isActive
								? "bg-sidebar-primary text-sidebar-primary-foreground shadow-cyber"
								: "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
						}
          `}
				>
					<NavLink to={item.href}>
						<item.icon className="w-4 h-4" />
						{!collapsed && <span>{item.title}</span>}
					</NavLink>
				</SidebarMenuButton>
			</SidebarMenuItem>
		);
	};

	return (
		<Sidebar className="bg-sidebar-background border-sidebar-border">
			{isMobile && (
				<>
					<SheetTitle className="sr-only">Menu di navigazione</SheetTitle>
					<SheetDescription className="sr-only">
						Voci di menu principali e accesso rapido alle sezioni dell'applicazione.
					</SheetDescription>
				</>
			)}
			<SidebarHeader className="p-4 border-b border-sidebar-border">
				<Link
					to="/dashboard"
					className="flex items-center space-x-3 hover:opacity-80 transition-opacity"
				>
					<div className="w-10 h-10 rounded-lg overflow-hidden">
						<img
							src="/assets/ebc3b9f3-fce3-4df9-a7f9-b0b576887830.png"
							alt={`${platformName} Logo`}
							className="w-full h-full object-cover"
						/>
					</div>
					{!collapsed && (
						<div>
							<h2 className="text-lg font-semibold text-sidebar-foreground">
								{platformName}
							</h2>
							<p className="text-xs text-sidebar-foreground/60">
								{isConsoleUser ? "Admin Console" : "Cyber Risk Platform"}
							</p>
						</div>
					)}
				</Link>
			</SidebarHeader>

			<SidebarContent className="bg-sidebar-background">
				{/* Main navigation */}
				<SidebarGroup>
					<SidebarGroupLabel className="text-sidebar-foreground/60 px-4 py-2">
						Generale
					</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{filteredNavigation.map((item) => renderNavItem(item))}
							{servicesStandalone.map((item) => renderNavItem(item))}
							{hipatchOn &&
								isUserAllowed("/dashboard/service/hi_patch") &&
								renderNavItem({
									title: "HiPatch",
									href: "/dashboard/service/hi_patch",
									icon: Download,
								})}
							{/* HIDDEN: Threat Management page removed per client request (2026-06-05) */}
							{/* {isModuleEnabled('/threat-management') && renderNavItem({ title: 'Threat Management', href: '/threat-management', icon: Shield })} */}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>

				{/* HiCompliance collapsible group */}
				{hiComplianceGroupVisible && (
					<SidebarGroup>
						<Collapsible
							open={hiComplianceOpen}
							onOpenChange={setHiComplianceOpen}
						>
							<CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-2 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors">
								<div className="flex items-center gap-2">
									<ShieldCheck className="w-3.5 h-3.5" />
									<span>HiCompliance</span>
								</div>
								{!collapsed && (
									<ChevronDown
										className={`w-3.5 h-3.5 transition-transform duration-200 ${hiComplianceOpen ? "rotate-180" : ""}`}
									/>
								)}
							</CollapsibleTrigger>
							<CollapsibleContent>
								<SidebarGroupContent>
									<SidebarMenu>
										{visibleHiCompliance.map((item) => renderNavItem(item))}
										{servicesInHiCompliance.map((item) => renderNavItem(item))}

										{/* Incident Response & Compliance Events */}
										{incidentMainItems.map(
											(item) =>
												isModuleEnabled(item.href) &&
												isFeatureAllowed(item.href) &&
												isUserAllowed(item.href) &&
												renderNavItem(item),
										)}
										{visibleComplianceEvents.length > 0 &&
											visibleComplianceEvents.map((item) =>
												renderNavItem(item),
											)}
									</SidebarMenu>
								</SidebarGroupContent>
							</CollapsibleContent>
						</Collapsible>
					</SidebarGroup>
				)}

				{((isModuleEnabled("/settings/users") &&
					isUserAllowed("/settings/users")) ||
					(isModuleEnabled("/settings/integrations") &&
						isUserAllowed("/settings/integrations")) ||
					(isModuleEnabled("/settings/alerts") &&
						isUserAllowed("/settings/alerts"))) && (
					<SidebarGroup>
						<SidebarGroupLabel className="text-sidebar-foreground/60 px-4 py-2">
							Impostazioni
						</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>
								{isModuleEnabled("/settings/users") &&
									isUserAllowed("/settings/users") && (isAdmin || isSuperAdmin || isSales) && (
										<SidebarMenuItem>
											<SidebarMenuButton
												asChild
												className="mx-2 rounded-lg transition-all duration-200 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
											>
												<NavLink to="/settings/users">
													<Users className="w-4 h-4" />
													{!collapsed && <span>Utenti</span>}
												</NavLink>
											</SidebarMenuButton>
										</SidebarMenuItem>
									)}
								{isModuleEnabled("/settings/integrations") &&
									isUserAllowed("/settings/integrations") && (
										<SidebarMenuItem>
											<SidebarMenuButton
												asChild
												className="mx-2 rounded-lg transition-all duration-200 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
											>
												<NavLink to="/settings/integrations">
													<Cloud className="w-4 h-4" />
													{!collapsed && <span>Integrazioni</span>}
												</NavLink>
											</SidebarMenuButton>
										</SidebarMenuItem>
									)}
								{/* /settings/surface-scan-alerts — still hidden until full API migration of the page is complete */}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				)}

				{(isAdmin || isSuperAdmin || isSales) && (
					<SidebarGroup>
						<SidebarGroupLabel className="text-sidebar-foreground/60 px-4 py-2">
							{canManageMultipleClients
								? "Gestione Multi-Cliente"
								: "Amministrazione"}
						</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>
								{adminNavigation
									.filter((item) => {
										// Capability-based gating (Stefano dotted keys)
										const hasCompanyMgmt = hasCapability("companies.manage");
										const hasUserMgmt = hasCapability("users.manage");

										// Show "Selezione Clienti" only for sales/admin who can manage multiple clients
										if (item.href === "/admin/clients")
											return canManageMultipleClients && hasCompanyMgmt;
										// Show "Aziende & Clienti" only with company management capability
										if (item.href === "/admin/companies")
											return (isAdmin || isSuperAdmin) && hasCompanyMgmt;
										// Show "Reportistica Aggregata" for admin/sales who can manage multiple clients
										if (item.href === "/admin/reporting")
											return canManageMultipleClients;
										// Show "Gestione Ruoli" only with user management capability
										if (item.href === "/admin/role-settings")
											return (isAdmin || isSuperAdmin) && hasUserMgmt;
										// Show other admin items only for admin/superadmin
										return isAdmin || isSuperAdmin;
									})
									.map((item) => {
										const isActive = location.pathname === item.href;
										return (
											<SidebarMenuItem key={item.href}>
												<SidebarMenuButton
													asChild
													className={`
                          mx-2 rounded-lg transition-all duration-200
                          ${
														isActive
															? "bg-sidebar-primary text-sidebar-primary-foreground shadow-cyber"
															: "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
													}
                        `}
												>
													<NavLink to={item.href}>
														<item.icon className="w-4 h-4" />
														{!collapsed && <span>{item.title}</span>}
													</NavLink>
												</SidebarMenuButton>
											</SidebarMenuItem>
										);
									})}
								{/* AI CISO Assistant — HIDDEN: supabase-only (ai_ciso_conversations), no backend API */}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				)}
			</SidebarContent>

			<SidebarFooter className="p-4 border-t border-sidebar-border bg-sidebar-background">
				{!collapsed && (
					<div className="space-y-3">
						<div className="text-sm">
							<p className="text-sidebar-foreground font-medium">
								{user?.name}
							</p>
							<p className="text-sidebar-foreground/60 text-xs">
								{selectedOrganization?.name ||
									user?.groups?.[0]?.name ||
									user?.organizations?.name ||
									user?.name ||
									"Organizzazione"}
							</p>
							<p className="text-xs text-cyan-400">
								{isSuperAdmin
									? "Super Admin"
									: isSales
										? "Sales"
										: isAdmin
											? "Amministratore"
											: "Cliente"}
							</p>
						</div>
						<Button
							variant="outline"
							size="sm"
							className="w-full text-sidebar-foreground/80 border-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-foreground"
							onClick={() => setPasswordDialogOpen(true)}
						>
							<KeyRound className="w-4 h-4 mr-2" />
							Cambia Password
						</Button>
						<LogoutButton
							variant="outline"
							size="sm"
							className="w-full text-sidebar-foreground/80 border-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-foreground"
							showText={true}
						/>
					</div>
				)}
				{collapsed && (
					<LogoutButton
						variant="outline"
						size="sm"
						className="w-full text-sidebar-foreground/80 border-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-foreground"
						showText={false}
					/>
				)}
			</SidebarFooter>

			<ChangePasswordDialog
				open={passwordDialogOpen}
				onOpenChange={setPasswordDialogOpen}
			/>
		</Sidebar>
	);
};
