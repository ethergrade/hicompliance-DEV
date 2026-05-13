export const moduleVisibility = {
  cyberNews: true,
  documents: false,
  consistenze: false,
  incidentResponse: false,
  complianceEvents: false,
  integrations: false,
  darkRiskAlerts: false,
  threats: false,
  reports: false,
  threatManagement: true,
} as const;

export const isModuleVisible = (modulePath: string): boolean => {
  switch (modulePath) {
    case '/cyber-news':
      return moduleVisibility.cyberNews;
    case '/documents':
      return moduleVisibility.documents;
    case '/consistenze':
      return moduleVisibility.consistenze;
    case '/incident-response':
      return moduleVisibility.incidentResponse;
    case '/compliance-events':
      return moduleVisibility.complianceEvents;
    case '/settings/integrations':
      return moduleVisibility.integrations;
    case '/settings/alerts':
    case '/settings/surface-scan-alerts':
      return moduleVisibility.darkRiskAlerts;
    case '/threats':
      return moduleVisibility.threats;
    case '/reports':
      return moduleVisibility.reports;
    case '/threat-management':
      return moduleVisibility.threatManagement;
    default:
      return true;
  }
};
