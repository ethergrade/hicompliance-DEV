import React from 'react';
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
  Wrench
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
import { useAuth } from '@/components/auth/AuthProvider';
import { LogoutButton } from '@/components/auth/LogoutButton';
import { useUserRoles } from '@/hooks/useUserRoles';

const navigation = [
  {
    title: 'Home',
    href: '/',
    icon: Home,
  },
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    title: 'Assessment',
    href: '/assessment',
    icon: ClipboardCheck,
  },
  {
    title: 'SurfaceScan360',
    href: '/surface-scan',
    icon: Globe,
  },
  {
    title: 'DarkRisk360',
    href: '/dark-risk',
    icon: Eye,
  },
  {
    title: 'Analisi',
    href: '/analytics',
    icon: BarChart3,
  },
  {
    title: 'Remediation',
    href: '/remediation',
    icon: Wrench,
  },
  {
    title: 'Minacce',
    href: '/threats',
    icon: AlertTriangle,
  },
  {
    title: 'Report',
    href: '/reports',
    icon: FileText,
  },
];

const adminNavigation = [
  {
    title: 'Gestione Clienti',
    href: '/admin/clients',
    icon: Users,
  },
  {
    title: 'Impostazioni',
    href: '/admin/settings',
    icon: Settings,
  },
];

export const AppSidebar: React.FC = () => {
  const location = useLocation();
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const { userProfile } = useAuth();
  const { isSuperAdmin, isSales } = useUserRoles();
  
  const isAdmin = userProfile?.user_type === 'admin';

  // Filter navigation based on role
  const filteredNavigation = isSales 
    ? navigation.filter(item => ['/', '/dashboard', '/assessment'].includes(item.href))
    : navigation;

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
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/60 px-4 py-2">
            Sicurezza
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredNavigation.map((item) => {
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

        {!isSales && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/60 px-4 py-2">
              Incident Remediation
            </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  asChild
                  className="mx-2 rounded-lg transition-all duration-200 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                >
                  <NavLink to="/incident-response">
                    <AlertTriangle className="w-4 h-4" />
                    {!collapsed && <span>Incident Response</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  asChild
                  className="mx-2 rounded-lg transition-all duration-200 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                >
                  <NavLink to="/threat-management">
                    <Shield className="w-4 h-4" />
                    {!collapsed && <span>Threat Management</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
          </SidebarGroup>
        )}

        {!isSales && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/60 px-4 py-2">
              Impostazioni
            </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
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
            </SidebarMenu>
          </SidebarGroupContent>
          </SidebarGroup>
        )}

        {(isAdmin || isSuperAdmin) && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/60 px-4 py-2">
              Amministrazione
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminNavigation.map((item) => {
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
                {userProfile?.organizations?.name || 'Organizzazione'}
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