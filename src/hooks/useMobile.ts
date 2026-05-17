import { useApiWithFallback } from './useApiWithFallback';
import { mobileApi } from '@/lib/api/mobile';

export interface MobileOverviewData {
  totalDevices: number;
  enrolledDevices: number;
  compliantDevices: number;
  nonCompliantDevices: number;
  iOSDevices: number;
  androidDevices: number;
  pendingEnrollment: number;
}

export interface MobileDeviceInventory {
  id: string;
  deviceName: string;
  user: string;
  os: string;
  model: string;
  status: 'Compliant' | 'Non Compliant';
  lastSeen: string;
  battery: number;
  encrypted: boolean;
}

export interface SecurityPolicy {
  name: string;
  status: string;
  devices: number;
  compliance: number;
}

export interface AppInventoryItem {
  name: string;
  category: string;
  installed: number;
  status: 'Approvata' | 'Limitata' | 'Bloccata';
}

export interface SecurityEvent {
  time: string;
  event: string;
  device: string;
  severity: string;
}

export interface MobileDashboardData {
  overview: MobileOverviewData;
  osDistribution: { name: string; value: number; color: string }[];
  complianceData: { category: string; compliant: number; nonCompliant: number }[];
  enrollmentTrend: { month: string; enrolled: number; active: number }[];
  deviceInventory: MobileDeviceInventory[];
  securityPolicies: SecurityPolicy[];
  appInventory: AppInventoryItem[];
  securityEvents: SecurityEvent[];
}

const mockMobileData: MobileDashboardData = {
  overview: {
    totalDevices: 342,
    enrolledDevices: 328,
    compliantDevices: 298,
    nonCompliantDevices: 30,
    iOSDevices: 186,
    androidDevices: 142,
    pendingEnrollment: 14,
  },
  osDistribution: [
    { name: 'iOS 17', value: 124, color: '#3b82f6' },
    { name: 'iOS 16', value: 62, color: '#60a5fa' },
    { name: 'Android 14', value: 78, color: '#22c55e' },
    { name: 'Android 13', value: 48, color: '#4ade80' },
    { name: 'Android 12', value: 16, color: '#86efac' },
  ],
  complianceData: [
    { category: 'Encryption', compliant: 320, nonCompliant: 8 },
    { category: 'Passcode', compliant: 305, nonCompliant: 23 },
    { category: 'OS Aggiornato', compliant: 278, nonCompliant: 50 },
    { category: 'App Approvate', compliant: 312, nonCompliant: 16 },
    { category: 'VPN Attiva', compliant: 245, nonCompliant: 83 },
  ],
  enrollmentTrend: [
    { month: 'Ago', enrolled: 280, active: 265 },
    { month: 'Set', enrolled: 295, active: 282 },
    { month: 'Ott', enrolled: 310, active: 298 },
    { month: 'Nov', enrolled: 320, active: 305 },
    { month: 'Dic', enrolled: 328, active: 312 },
    { month: 'Gen', enrolled: 342, active: 328 },
  ],
  deviceInventory: [
    { id: 'MDM-001', deviceName: 'iPhone 15 Pro - Utente001', user: 'Mario Rossi', os: 'iOS 17.2', model: 'iPhone 15 Pro', status: 'Compliant', lastSeen: '2 min fa', battery: 85, encrypted: true },
    { id: 'MDM-002', deviceName: 'Galaxy S24 - Utente002', user: 'Laura Bianchi', os: 'Android 14', model: 'Samsung Galaxy S24', status: 'Compliant', lastSeen: '5 min fa', battery: 72, encrypted: true },
    { id: 'MDM-003', deviceName: 'iPad Pro - Utente003', user: 'Giuseppe Verdi', os: 'iPadOS 17.2', model: 'iPad Pro 12.9"', status: 'Non Compliant', lastSeen: '1 ora fa', battery: 45, encrypted: true },
    { id: 'MDM-004', deviceName: 'Pixel 8 - Utente004', user: 'Anna Neri', os: 'Android 14', model: 'Google Pixel 8', status: 'Compliant', lastSeen: '10 min fa', battery: 92, encrypted: true },
    { id: 'MDM-005', deviceName: 'iPhone 14 - Utente005', user: 'Marco Blu', os: 'iOS 16.7', model: 'iPhone 14', status: 'Non Compliant', lastSeen: '3 ore fa', battery: 23, encrypted: false },
    { id: 'MDM-006', deviceName: 'Galaxy Tab S9 - Utente006', user: 'Elena Gialli', os: 'Android 13', model: 'Samsung Galaxy Tab S9', status: 'Compliant', lastSeen: '15 min fa', battery: 68, encrypted: true },
  ],
  securityPolicies: [
    { name: 'Passcode Obbligatorio', status: 'active', devices: 328, compliance: 93 },
    { name: 'Crittografia Dispositivo', status: 'active', devices: 328, compliance: 98 },
    { name: 'Blocco Schermo (5 min)', status: 'active', devices: 328, compliance: 95 },
    { name: 'VPN Aziendale', status: 'active', devices: 245, compliance: 75 },
    { name: 'App Store Gestito', status: 'active', devices: 328, compliance: 89 },
    { name: 'Backup Automatico', status: 'active', devices: 312, compliance: 95 },
  ],
  appInventory: [
    { name: 'Microsoft 365', category: 'Produttività', installed: 315, status: 'Approvata' },
    { name: 'Slack', category: 'Comunicazione', installed: 298, status: 'Approvata' },
    { name: 'Salesforce', category: 'CRM', installed: 156, status: 'Approvata' },
    { name: 'Zoom', category: 'Meeting', installed: 287, status: 'Approvata' },
    { name: 'Chrome', category: 'Browser', installed: 142, status: 'Approvata' },
    { name: 'WhatsApp', category: 'Messaggistica', installed: 45, status: 'Limitata' },
  ],
  securityEvents: [
    { time: '10:45', event: 'Tentativo jailbreak rilevato', device: 'iPhone 14 - Utente005', severity: 'Critico' },
    { time: '10:32', event: 'App non autorizzata installata', device: 'Galaxy S24 - Utente002', severity: 'Alto' },
    { time: '10:18', event: 'VPN disconnessa', device: 'iPad Pro - Utente003', severity: 'Medio' },
    { time: '09:55', event: 'Password policy violata', device: 'Pixel 8 - Utente004', severity: 'Alto' },
    { time: '09:42', event: 'Geolocalizzazione disabilitata', device: 'iPhone 15 Pro - Utente001', severity: 'Basso' },
  ],
};

export function useMobileDashboard(tenantId?: string) {
  return useApiWithFallback<MobileDashboardData>(
    () => mobileApi.dashboard(tenantId) as Promise<MobileDashboardData>,
    mockMobileData,
    [tenantId],
  );
}
