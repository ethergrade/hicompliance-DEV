import React from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { ClientIndicator } from './ClientIndicator';
import { useUserRoles } from '@/hooks/useUserRoles';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children
}) => {
  const { isSales } = useUserRoles();

  return <SidebarProvider defaultOpen={true}>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {isSales && (
            <div className="px-4 py-1 text-[11px] leading-4 bg-amber-500/10 text-amber-300 border-b border-amber-500/25">
              Ambiente Demo, Funzionalità in corso di sviluppo.
            </div>
          )}
          <ClientIndicator />
          
          <main className="flex-1 p-6 overflow-x-hidden overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>;
};
