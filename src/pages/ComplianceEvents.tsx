import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileCheck } from 'lucide-react';
import ComplianceEventsTab from '@/components/remediation/ComplianceEventsTab';

const ComplianceEvents: React.FC = () => {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <FileCheck className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Eventi Compliance</h1>
            <p className="text-muted-foreground">
              Storico e tracciabilità dei playbook di risposta agli incidenti
            </p>
          </div>
        </div>

        {/* Content */}
        <ComplianceEventsTab />
      </div>
    </DashboardLayout>
  );
};

export default ComplianceEvents;
