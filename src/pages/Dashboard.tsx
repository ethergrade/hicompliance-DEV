import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { ServiceStatusCard } from '@/components/dashboard/ServiceStatusCard';
import { HiSolutionStatusGrid } from '@/components/dashboard/HiSolutionStatusGrid';
import { useAuth } from '@/components/auth/AuthProvider';
import { supabase } from '@/integrations/supabase/client';

const Dashboard: React.FC = () => {
  const { userProfile } = useAuth();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchServices = async () => {
      if (userProfile?.organization_id) {
        const { data } = await supabase
          .from('organization_services')
          .select('*, services(*)')
          .eq('organization_id', userProfile.organization_id);
        
        setServices(data || []);
      }
      setLoading(false);
    };

    fetchServices();
  }, [userProfile]);

  // Calculate real metrics from services
  const alertServices = services.filter(s => s.status === 'alert');
  const activeServices = services.filter(s => s.status === 'active');
  const hiSolutionServices = services.filter(s => s.services.code.startsWith('hi_'));
  const totalIssues = alertServices.reduce((acc, service) => {
    const issues = service.health_score ? Math.floor((100 - service.health_score) / 10) : 0;
    return acc + issues;
  }, 0);

  const mockData = {
    nis2Compliance: 42,
    riskIndicator: Math.min(84 + (alertServices.length * 5), 100),
    totalAssets: hiSolutionServices.length,
    activeThreats: totalIssues
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
            <p className="text-muted-foreground">
              {userProfile?.organizations?.name || 'Organizzazione'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <MetricCard
            title="Conformità NIS2"
            value="Moderato"
            percentage={mockData.nis2Compliance}
            status="warning"
            description="Conformità generale alla direttiva"
          />
          <MetricCard
            title="Indicatore di Rischio"
            value={alertServices.length > 3 ? "Altissimo" : "Alto"}
            percentage={mockData.riskIndicator}
            status="critical"
            description="Livello di rischio complessivo"
          />
          <MetricCard
            title="Servizi HiSolution"
            value={hiSolutionServices.length}
            status="good"
            description="Servizi attivi"
          />
          <MetricCard
            title="Issues Rilevate"
            value={mockData.activeThreats}
            status="critical"
            description="Problemi da risolvere"
          />
        </div>

        <HiSolutionStatusGrid services={services} />
        
        <ServiceStatusCard services={services} />
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;