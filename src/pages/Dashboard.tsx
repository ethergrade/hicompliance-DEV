import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { ServiceStatusCard } from '@/components/dashboard/ServiceStatusCard';
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

  const mockData = {
    nis2Compliance: 42,
    riskIndicator: 84,
    totalAssets: 155,
    activeThreats: 8
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
            value="Altissimo"
            percentage={mockData.riskIndicator}
            status="critical"
            description="Livello di rischio complessivo"
          />
          <MetricCard
            title="Asset Totali"
            value={mockData.totalAssets}
            status="good"
            description="Asset monitorati"
          />
          <MetricCard
            title="Minacce Attive"
            value={mockData.activeThreats}
            status="critical"
            description="Minacce rilevate"
          />
        </div>

        <ServiceStatusCard services={services} />
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;