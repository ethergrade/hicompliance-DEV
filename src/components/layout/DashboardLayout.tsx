import React from 'react';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  return (
    <SidebarProvider defaultOpen={true}>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        
        <div className="flex-1 flex flex-col">
          <header className="h-14 border-b border-border bg-card flex items-center px-4 shadow-sm">
            <SidebarTrigger asChild>
              <Button variant="ghost" size="sm" className="mr-4">
                <Menu className="h-4 w-4" />
              </Button>
            </SidebarTrigger>
            
            <div className="flex-1">
              <h1 className="text-lg font-semibold text-foreground">
                Piattaforma HiCompliance
              </h1>
              <p className="text-xs text-muted-foreground">
                Gestione integrata del cyber risk
              </p>
            </div>
          </header>
          
          <main className="flex-1 p-6 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};