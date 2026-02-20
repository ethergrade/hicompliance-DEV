import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Shield,
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
  ShieldCheck,
} from 'lucide-react';
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
} from '@/components/ui/sidebar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useAuth } from '@/components/auth/AuthProvider';
import { LogoutButton } from '@/components/auth/LogoutButton';
import { useUserRoles } from '@/hooks/useUserRoles';
import { useRolePermissions } from '@/hooks/useRolePermissions';
 import { useClientContext } from '@/contexts/ClientContext';

const navigation = [
  { title: 'Home', href: '/', icon: Home },
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { title: 'CyberNews', href: '/cyber-news', icon: Newspaper },
  { title: 'Analisi', href: '/analytics', icon: BarChart3 },
  { title: 'Minacce', href: '/threats', icon: AlertTriangle },
  { title: 'Report', href: '/reports', icon: FileText },
  { title: 'Gestione Documenti', href: '/documents', icon: FileText },
  { title: 'Inventario Asset', href: '/asset-inventory', icon: Package },
];

const hiComplianceModules = [
  { title: 'Assessment', href: '/assessment', icon: ClipboardCheck },
  { title: 'SurfaceScan360', href: '/surface-scan', icon: Globe },
  { title: 'DarkRisk360', href: '/dark-risk', icon: Eye },
  { title: 'Remediation', href: '/remediation', icon: Wrench },
];

const incidentSubItems = [
  { title: 'Incident Response', href: '/incident-response', icon: AlertTriangle },
  { title: 'Eventi Compliance', href: '/compliance-events', icon: FileCheck },
];

const adminNavigation = [
  {
    title: 'Selezione Clienti',
    href: '/clients',
    icon: Building2,
  },
  {
    title: 'Reportistica Aggregata',
    href: '/admin/reporting',
    icon: PieChart,
  },
  {
    title: 'Gestione Clienti',
    href: '/admin/clients',
    icon: Users,
  },
  {
    title: 'Gestione Ruoli',
    href: '/admin/role-settings',
    icon: Settings,
  },
];

export const AppSidebar: React.FC = () => {
  const location = useLocation();
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const { userProfile } = useAuth();
  const { isSuperAdmin, isSales } = useUserRoles();
  const { isModuleEnabled } = useRolePermissions();
  const { selectedOrganization, canManageMultipleClients } = useClientContext();
  
  const isAdmin = userProfile?.user_type === 'admin';

  const filteredNavigation = navigation.filter(item => isModuleEnabled(item.href));

  const hiComplianceActive = [...hiComplianceModules, ...incidentSubItems].some(
    item => location.pathname === item.href
  );
  const incidentActive = incidentSubItems.some(item => location.pathname === item.href);

  const [hiComplianceOpen, setHiComplianceOpen] = React.useState<boolean>(true);
  const [incidentOpen, setIncidentOpen] = React.useState(incidentActive);

  const renderNavItem = (item: { title: string; href: string; icon: React.ElementType }, indent = false) => {
    const isActive = location.pathname === item.href;
    return (
      <SidebarMenuItem key={item.href}>
        <SidebarMenuButton
          asChild
          className={`
            ${indent ? 'ml-4 mr-2' : 'mx-2'} rounded-lg transition-all duration-200
            ${isActive
              ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-cyber'
              : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground'
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
            <img src="/lovable-uploads/ebc3b9f3-fce3-4df9-a7f9-b0b576887830.png" alt="HiCompliance Logo" className="w-full h-full object-cover" />
          </div>
          {!collapsed && (
            <div>
              <h2 className="text-lg font-semibold text-sidebar-foreground">HiCompliance</h2>
              <p className="text-xs text-sidebar-foreground/60">Cyber Risk Platform</p>
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

        {/* HiCompliance collapsible group */}
        <SidebarGroup>
          <Collapsible open={hiComplianceOpen} onOpenChange={setHiComplianceOpen}>
            <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-2 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>HiCompliance</span>
              </div>
              {!collapsed && (
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${hiComplianceOpen ? 'rotate-180' : ''}`} />
              )}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {hiComplianceModules
                    .filter(item => isModuleEnabled(item.href))
                    .map(item => renderNavItem(item))}

                  {/* INCIDENT sub-collapsible */}
                  {(isModuleEnabled('/incident-response') || isModuleEnabled('/compliance-events')) && (
                    <li>
                      <Collapsible open={incidentOpen} onOpenChange={setIncidentOpen}>
                        <CollapsibleTrigger className="flex w-full items-center justify-between mx-2 px-3 py-2 text-sm rounded-lg text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors">
                          <div className="flex items-center gap-2">
                            <Shield className="w-4 h-4" />
                            {!collapsed && <span>Incident</span>}
                          </div>
                          {!collapsed && (
                            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${incidentOpen ? 'rotate-180' : ''}`} />
                          )}
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenu>
                            {incidentSubItems
                              .filter(item => isModuleEnabled(item.href))
                              .map(item => renderNavItem(item, true))}
                          </SidebarMenu>
                        </CollapsibleContent>
                      </Collapsible>
                    </li>
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        {/* Threat Management */}
        {isModuleEnabled('/threat-management') && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {renderNavItem({ title: 'Threat Management', href: '/threat-management', icon: Shield })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {(isModuleEnabled('/settings/users') || isModuleEnabled('/settings/integrations') || isModuleEnabled('/settings/alerts') || isModuleEnabled('/settings/surface-scan-alerts')) && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/60 px-4 py-2">
              Impostazioni
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {isModuleEnabled('/settings/users') && (
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
                {isModuleEnabled('/settings/integrations') && (
                  <SidebarMenuItem>
                    <SidebarMenuButton 
                      asChild
                      className="mx-2 rounded-lg transition-all duration-200 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    >
                      <NavLink to="/settings/integrations">
                        <Network className="w-4 h-4" />
                        {!collapsed && <span>Integrazioni</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {isModuleEnabled('/settings/alerts') && (
                  <SidebarMenuItem>
                    <SidebarMenuButton 
                      asChild
                      className="mx-2 rounded-lg transition-all duration-200 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    >
                      <NavLink to="/settings/alerts">
                        <Bell className="w-4 h-4" />
                        {!collapsed && <span>Alert DarkRisk</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {isModuleEnabled('/settings/surface-scan-alerts') && (
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

        {(isAdmin || isSuperAdmin || isSales) && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/60 px-4 py-2">
              {canManageMultipleClients ? 'Gestione Multi-Cliente' : 'Amministrazione'}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
              {adminNavigation.filter(item => {
                  // Show "Selezione Clienti" only for sales/admin who can manage multiple clients
                  if (item.href === '/clients') return canManageMultipleClients;
                  // Show "Reportistica Aggregata" for admin/sales who can manage multiple clients
                  if (item.href === '/admin/reporting') return canManageMultipleClients;
                  // Show other admin items only for admin/superadmin
                  return isAdmin || isSuperAdmin;
                }).map((item) => {
                  const isActive = location.pathname === item.href;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton 
                        asChild
                        className={`
                          mx-2 rounded-lg transition-all duration-200
                          ${isActive 
                            ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-cyber' 
                            : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground'
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
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border bg-sidebar-background">
        {!collapsed && (
          <div className="space-y-3">
            <div className="text-sm">
              <p className="text-sidebar-foreground font-medium">{userProfile?.full_name}</p>
              <p className="text-sidebar-foreground/60 text-xs">
              {canManageMultipleClients && selectedOrganization 
                ? selectedOrganization.name 
                : userProfile?.organizations?.name || 'Organizzazione'}
              </p>
              <p className="text-xs text-cyan-400">
                {isSuperAdmin ? 'Super Admin' : isSales ? 'Sales' : isAdmin ? 'Amministratore' : 'Cliente'}
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