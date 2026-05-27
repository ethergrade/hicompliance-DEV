import React, { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Shield,
  Users,
  Settings,
  BarChart3,
  AlertTriangle,
  Globe,
  Eye,
  ClipboardCheck,
  Home,
  Wrench,
  Bell,
  Package,
  Building2,
  Newspaper,
  ChevronDown,
  ShieldCheck,
  Bot,
  Activity,
} from "lucide-react";
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
import { useUserRoles } from "@/hooks/useUserRoles";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { useClientContext } from "@/contexts/ClientContext";
import { tenantServicesApi } from "@/lib/api/tenant-services";
import { useQuery } from "@tanstack/react-query";
import type { TenantServiceResource } from "@/types/api";

interface NavItem {
  title: string;
  href: string;
  icon: React.ElementType;
  superAdminOnly?: boolean;
}

const navigation: NavItem[] = [
  { title: "Home", href: "/", icon: Home },
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  // { title: "AI CISO", href: "/ai-ciso", icon: Bot, superAdminOnly: true },
  { title: "CyberNews", href: "/cyber-news", icon: Newspaper },
  { title: "Inventario Asset", href: "/asset-inventory", icon: Package },
];

const hiComplianceModules: { title: string; href: string; icon: React.ElementType; code?: string }[] = [
  { title: "Assessment", href: "/assessment", icon: ClipboardCheck },
  { title: "SurfaceScan360", href: "/surface-scan", icon: Globe, code: "HiTrack" },
  { title: "DarkRisk360", href: "/dark-risk", icon: Eye, code: "HiDetect" },
  { title: "Analisi", href: "/analytics", icon: BarChart3 },
];

const adminNavigation = [
  {
    title: "Clienti",
    href: "/admin/clients",
    icon: Building2,
  },
  // {
  //   title: "Gestione Ruoli",
  //   href: "/admin/role-settings",
  //   icon: Settings,
  // },
];

export const AppSidebar: React.FC = () => {
  const location = useLocation();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { user } = useAuth();
  const { isSuperAdmin, isSales, isAdmin } = useUserRoles();
  const { isModuleEnabled } = useRolePermissions();
  const { selectedOrganization, canManageMultipleClients } = useClientContext();

  const isConsoleUser = isSuperAdmin || isSales;
  const platformName = isConsoleUser ? 'HiConsole' : 'HiCompliance';

  const filteredNavigation = navigation.filter((item) => {
    if (item.superAdminOnly && !isSuperAdmin) return false;
    return isModuleEnabled(item.href);
  });

  const [hiComplianceOpen, setHiComplianceOpen] = React.useState<boolean>(true);

  // Fetch tenant services for selected org to determine active service modules
  const { data: tenantServices = [] } = useQuery({
    queryKey: ["tenant-services-sidebar", selectedOrganization?.id],
    queryFn: () => selectedOrganization?.id ? tenantServicesApi.listByOrganization(selectedOrganization.id) : Promise.resolve([]),
    enabled: !!selectedOrganization?.id,
    staleTime: 30_000,
  });

  const isServiceActive = (code: string) =>
    (tenantServices as TenantServiceResource[]).some(
      (ts) => ts.service_type === code && ts.status === "active"
    );

  const surfaceScanActive = isServiceActive("HiTrack");
  const darkRiskActive = isServiceActive("HiDetect");
  const oneActive = (surfaceScanActive || darkRiskActive) && !(surfaceScanActive && darkRiskActive);

  // Split modules: if exactly one of the two services is active, move it outside HiCompliance
  const modulesInsideHiCompliance = hiComplianceModules.filter((m) => {
    if (!m.code) return true;
    if (oneActive && isServiceActive(m.code)) return false;
    return true;
  });
  const modulesOutsideHiCompliance = hiComplianceModules.filter((m) => {
    if (!m.code) return false;
    return oneActive && isServiceActive(m.code);
  });

  const hiComplianceActive = [...modulesInsideHiCompliance, ...modulesOutsideHiCompliance].some(
    (item) => location.pathname === item.href,
  );

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
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg overflow-hidden">
            <img
              src="/lovable-uploads/ebc3b9f3-fce3-4df9-a7f9-b0b576887830.png"
              alt={`${platformName} Logo`}
              className="w-full h-full object-cover"
            />
          </div>
          {!collapsed && (
            <div>
              <h2 className="text-lg font-semibold text-sidebar-foreground">{platformName}</h2>
              <p className="text-xs text-sidebar-foreground/60">{isConsoleUser ? 'Admin Console' : 'Cyber Risk Platform'}</p>
            </div>
          )}
        </div>
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
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Service modules moved outside HiCompliance when exactly one active */}
        {modulesOutsideHiCompliance.length > 0 && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {modulesOutsideHiCompliance
                  .filter((item) => isModuleEnabled(item.href))
                  .map((item) => renderNavItem(item))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* HiCompliance collapsible group */}
        <SidebarGroup>
          <Collapsible
            open={hiComplianceOpen}
            onOpenChange={setHiComplianceOpen}
          >
            <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-2 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>HICOMPLIANCE</span>
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
                  {modulesInsideHiCompliance
                    .filter((item) => isModuleEnabled(item.href))
                    .map((item) => renderNavItem(item))}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        {(isModuleEnabled("/settings/users") ||
          isModuleEnabled("/settings/surface-scan-alerts")) && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/60 px-4 py-2">
              Impostazioni
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {isModuleEnabled("/settings/users") && (
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
                {/* Integrazioni & Alert DarkRisk360 hidden for now */}
                {isModuleEnabled("/settings/surface-scan-alerts") && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      className="mx-2 rounded-lg transition-all duration-200 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    >
                      <NavLink to="/settings/surface-scan-alerts">
                        <Bell className="w-4 h-4" />
                        {!collapsed && <span>Alert SurfaceScan</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {(isAdmin || isSales) && (
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
                    // Show "Selezione Clienti" only for sales/admin who can manage multiple clients
                    if (item.href === "/admin/clients")
                      return canManageMultipleClients;
                    // Show "Reportistica Aggregata" for admin/sales who can manage multiple clients
                    if (item.href === "/admin/reporting")
                      return canManageMultipleClients;
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
                {/* {isSuperAdmin &&
                  renderNavItem({
                    title: "AI CISO Assistant",
                    href: "/ai-ciso",
                    icon: Bot,
                  })} */}
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
                {canManageMultipleClients && selectedOrganization
                  ? selectedOrganization.name
                  : "Organizzazione"}
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
    </Sidebar>
  );
};
