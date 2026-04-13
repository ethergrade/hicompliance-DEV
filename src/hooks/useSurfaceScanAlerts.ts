import { useAlerts, BaseAlert } from './useAlerts';

export interface SurfaceScanAlertTypes {
  vulnerabilita_critiche: boolean;
  vulnerabilita_alte: boolean;
  porte_esposte: boolean;
  certificati_scaduti: boolean;
  servizi_non_sicuri: boolean;
}

export type SurfaceScanAlert = BaseAlert<SurfaceScanAlertTypes>;

export const useSurfaceScanAlerts = () =>
  useAlerts<SurfaceScanAlertTypes>({
    table: 'surface_scan_alerts',
    channelName: 'surface_scan_alerts_changes',
  });
