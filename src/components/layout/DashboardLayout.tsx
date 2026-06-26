import React from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { ClientIndicator } from './ClientIndicator';
import { AppFooter } from './AppFooter';
import { useUserRoles } from '@/hooks/useUserRoles';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children
}) => {
  const { isSales } = useUserRoles();

  return <SidebarProvider defaultOpen={true}>
      <div className="flex h-svh min-h-0 w-full overflow-hidden bg-background">
        <AppSidebar />
        
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {isSales && (
            <div className="px-4 py-1 text-[11px] leading-4 bg-amber-500/10 text-amber-300 border-b border-amber-500/25">
              Ambiente Demo, Funzionalità in corso di sviluppo.
            </div>
          )}
          <ClientIndicator />

          <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-6">
            {children}
            <AppFooter />
          </main>
        </div>
      </div>
    </SidebarProvider>;
};
