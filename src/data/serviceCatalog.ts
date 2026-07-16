import type { ServiceCatalogItem } from '@/types/api';

/**
 * Fallback service catalog used when the backend GET /hisolution-services
 * endpoint is unavailable (e.g., migration not yet deployed).
 *
 * Mirrors the services defined in hiconsole/config/tenant_services.php.
 */
export const FALLBACK_SERVICE_CATALOG: ServiceCatalogItem[] = [
  { id: 'hicompliance', code: 'hicompliance', name: 'HiCompliance', description: 'Assessment, Analisi, Remediation, Incident', icon: 'shield' },
  { id: 'surfacescan', code: 'surfacescan', name: 'SurfaceScan360', description: 'Scansione attack surface esterna', icon: 'search' },
  { id: 'darkrisk', code: 'darkrisk', name: 'DarkRisk360', description: 'Monitoraggio Dark Risk', icon: 'shield-alert' },
  { id: 'hipatch', code: 'hipatch', name: 'HiPatch', description: 'Patch Management', icon: 'download' },
  { id: 'hifirewall', code: 'hifirewall', name: 'HiFirewall', description: 'Firewall Management', icon: 'shield-check' },
  { id: 'hiendpoint', code: 'hiendpoint', name: 'HiEndpoint', description: 'Endpoint Protection', icon: 'laptop' },
  { id: 'himail', code: 'himail', name: 'HiMail', description: 'Mail Security', icon: 'mail' },
  { id: 'hidetect', code: 'hidetect', name: 'HiDetect', description: 'Threat Detection', icon: 'eye' },
  { id: 'hilog', code: 'hilog', name: 'HiLog', description: 'Log Management', icon: 'file-text' },
  { id: 'himobile', code: 'himobile', name: 'HiMobile', description: 'Mobile Security', icon: 'smartphone' },
  { id: 'hitrack', code: 'hitrack', name: 'HiTrack', description: 'Servizio gestito HiSolution connesso con Domotz', icon: 'activity' },
];
