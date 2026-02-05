import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { SecurityFeedsSection } from '@/components/dashboard/SecurityFeedsSection';
import { Newspaper } from 'lucide-react';

const CyberNews: React.FC = () => {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-primary/10 border border-primary/20">
            <Newspaper className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">CyberNews</h1>
            <p className="text-muted-foreground mt-1">
              Feed in tempo reale su normative NIS2, alert sicurezza, vulnerabilità CVE e previsioni EPSS
            </p>
          </div>
        </div>

        {/* Security Feeds */}
        <SecurityFeedsSection />
      </div>
    </DashboardLayout>
  );
};

export default CyberNews;
