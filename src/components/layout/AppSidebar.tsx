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
  ClipboardCheck
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
import { Button } from '@/components/ui/button';

const navigation = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
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
    title: 'Valutazione',
    href: '/assessment',
    icon: ClipboardCheck,
  },
  {
    title: 'Analisi',
    href: '/analytics',
    icon: BarChart3,
  },
  {
    title: 'Minacce',
    href: '/threats',
    icon: AlertTriangle,
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
  const { userProfile, signOut } = useAuth();
  
  const isAdmin = userProfile?.user_type === 'admin';

  return (
    <Sidebar className="bg-sidebar-background border-sidebar-border">
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-gradient-cyber rounded-lg flex items-center justify-center">
            <Shield className="w-4 h-4 text-white" />
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
              {navigation.map((item) => {
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

        {isAdmin && (
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
                {isAdmin ? 'Amministratore' : 'Cliente'}
              </p>
            </div>
            <Button 
              onClick={signOut}
              variant="outline" 
              size="sm" 
              className="w-full text-sidebar-foreground/80 border-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Disconnetti
            </Button>
          </div>
        )}
        {collapsed && (
          <Button 
            onClick={signOut}
            variant="outline" 
            size="sm" 
            className="w-full text-sidebar-foreground/80 border-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        )}
      </SidebarFooter>
    </Sidebar>
  );
};