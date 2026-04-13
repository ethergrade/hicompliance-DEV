import { useAlerts, BaseAlert } from './useAlerts';

export interface AlertTypes {
  credenziali_compromesse: boolean;
  dati_carte_credito: boolean;
  database_leak: boolean;
  email_compromesse: boolean;
  dati_sensibili: boolean;
}

export type DarkRiskAlert = BaseAlert<AlertTypes>;

export const useDarkRiskAlerts = () =>
  useAlerts<AlertTypes>({
    table: 'dark_risk_alerts',
    channelName: 'dark_risk_alerts_changes',
  });
