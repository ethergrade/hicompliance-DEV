import React from 'react';
import { Link } from 'react-router-dom';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { ClientIndicator } from './ClientIndicator';
import { AppFooter } from './AppFooter';
import { useUserRoles } from '@/hooks/useUserRoles';
import { useAuth } from '@/components/auth/AuthProvider';
import { ShieldAlert } from 'lucide-react';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const { isSales } = useUserRoles();
  const { user } = useAuth();

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex h-svh min-h-0 w-full overflow-hidden bg-background">
        <AppSidebar />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {/* Mobile-only top bar with hamburger to open the sidebar sheet */}
          <div className="md:hidden sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-background/95 backdrop-blur px-3 py-2">
            <SidebarTrigger aria-label="Apri menu" />
            <span className="text-sm font-medium text-muted-foreground">Menu</span>
          </div>

          {isSales && (
            <div className="px-4 py-1 text-[11px] leading-4 bg-amber-500/10 text-amber-300 border-b border-amber-500/25">
              Ambiente Demo, Funzionalità in corso di sviluppo.
            </div>
          )}

          {user?.mfa_recommended && (
            <div className="flex items-center gap-3 px-4 py-2 text-sm bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-b border-yellow-500/25">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>
                L'autenticazione a due fattori non è attiva sul tuo account.{' '}
                <Link to="/auth/mfa-setup" className="font-semibold underline underline-offset-2 hover:text-yellow-300">
                  Configurala ora
                </Link>{' '}
                per aumentare la sicurezza.
              </span>
            </div>
          )}

          <ClientIndicator />

          <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-6">
            {children}
            <AppFooter />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};
