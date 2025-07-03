import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { 
  Grid2x2, 
  Shield, 
  Book, 
  Settings, 
  Users, 
  LogOut,
  ChevronRight 
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
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/auth/AuthProvider';

export const AppSidebar: React.FC = () => {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const { signOut, userProfile } = useAuth();
  const currentPath = location.pathname;

  const isActive = (path: string) => currentPath === path;
  const getNavCls = ({ isActive }: { isActive: boolean }) =>
    isActive 
      ? "bg-gradient-cyber text-primary-foreground font-medium shadow-glow" 
      : "hover:bg-secondary/50 transition-cyber";

  const mainItems = [
    { title: "Dashboard", url: "/dashboard", icon: Grid2x2 },
    { title: "Assessment", url: "/assessment", icon: Shield },
    { title: "Servizi", url: "/services", icon: Book },
  ];

  const adminItems = userProfile?.user_type === 'admin' ? [
    { title: "Gestione Clienti", url: "/admin/clients", icon: Users },
    { title: "Configurazione", url: "/admin/settings", icon: Settings },
  ] : [];

  return (
    <Sidebar className={`${collapsed ? "w-16" : "w-64"} transition-cyber border-border`}>
      <SidebarHeader className="p-4">
        {!collapsed && (
          <div className="text-center">
            <h2 className="text-xl font-bold bg-gradient-cyber bg-clip-text text-transparent">
              HiCompliance
            </h2>
            <p className="text-xs text-muted-foreground">Cyber Risk Platform</p>
          </div>
        )}
        {collapsed && (
          <div className="text-center">
            <div className="w-8 h-8 bg-gradient-cyber rounded-md flex items-center justify-center">
              <span className="text-sm font-bold text-white">Hi</span>
            </div>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarGroupLabel className={collapsed ? "sr-only" : ""}>
            Principale
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} className={getNavCls}>
                      <item.icon className={`h-4 w-4 ${collapsed ? "" : "mr-3"}`} />
                      {!collapsed && <span>{item.title}</span>}
                      {!collapsed && isActive(item.url) && (
                        <ChevronRight className="h-4 w-4 ml-auto" />
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {adminItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className={collapsed ? "sr-only" : ""}>
              Amministrazione
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink to={item.url} className={getNavCls}>
                        <item.icon className={`h-4 w-4 ${collapsed ? "" : "mr-3"}`} />
                        {!collapsed && <span>{item.title}</span>}
                        {!collapsed && isActive(item.url) && (
                          <ChevronRight className="h-4 w-4 ml-auto" />
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-2">
        {!collapsed && userProfile && (
          <div className="px-2 py-3 border-t border-border">
            <div className="text-sm">
              <p className="font-medium text-foreground">{userProfile.full_name}</p>
              <p className="text-xs text-muted-foreground">{userProfile.organizations?.name}</p>
              <p className="text-xs text-muted-foreground capitalize">{userProfile.user_type}</p>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          onClick={signOut}
          className={`w-full ${collapsed ? "px-2" : "justify-start"} hover:bg-destructive/10 hover:text-destructive`}
        >
          <LogOut className={`h-4 w-4 ${collapsed ? "" : "mr-2"}`} />
          {!collapsed && "Esci"}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
};