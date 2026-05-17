import { useApiWithFallback } from './useApiWithFallback';
import { logsApi } from '@/lib/api/logs';

// Re-export all mock data types from the existing mockData module
// The HiLog dashboard is deeply coupled to its mock data structure
// so we use the existing mockData as fallback instead of duplicating it

export interface LogDashboardData {
  overview: {
    totalLogs: number;
    syslogCount: number;
    iisCount: number;
    apacheCount: number;
    sqlCount: number;
    customPathCount: number;
    endpointsCount: number;
    serversCount: number;
    dlpLinuxCount: number;
    dlpWindowsCount: number;
    sharepointDlpEnabled: boolean;
    sharepointDlpCount: number;
    entraIdEnabled: boolean;
  };
  // Additional data arrays are imported from hilog/mockData directly
  // When the API becomes available, these will be populated from the endpoint
  [key: string]: unknown;
}

// Import the full mock data from the existing file
import {
  overviewData,
  usbDrivesData,
  securityEventsData,
  windowsLogsData,
  windowsLogsTableData,
  entraIdLogsData,
  entraIdTableData,
  sharePointLogsData,
  securityEventsTableData,
  startupShutdownData,
  startupShutdownTableData,
  firewallLogsTableData,
  hostsTableData,
  usersADData,
  usersLocalData,
  usersEntraData,
} from '@/components/service-dashboards/hilog/mockData';

const mockLogData: LogDashboardData = {
  overview: overviewData,
  usbDrivesData,
  securityEventsData,
  windowsLogsData,
  windowsLogsTableData,
  entraIdLogsData,
  entraIdTableData,
  sharePointLogsData,
  securityEventsTableData,
  startupShutdownData,
  startupShutdownTableData,
  firewallLogsTableData,
  hostsTableData,
  usersADData,
  usersLocalData,
  usersEntraData,
};

export function useLogDashboard(tenantId?: string) {
  return useApiWithFallback<LogDashboardData>(
    () => logsApi.dashboard(tenantId) as Promise<LogDashboardData>,
    mockLogData,
    [tenantId],
  );
}

// Re-export all mock data for backward compatibility
export {
  overviewData,
  usbDrivesData,
  securityEventsData,
  windowsLogsData,
  windowsLogsTableData,
  entraIdLogsData,
  entraIdTableData,
  sharePointLogsData,
  securityEventsTableData,
  startupShutdownData,
  startupShutdownTableData,
  firewallLogsTableData,
  hostsTableData,
  usersADData,
  usersLocalData,
  usersEntraData,
};
