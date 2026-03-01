export type ConsistenzeArea = 'UCC' | 'SECURITY' | 'CONN_FONIA' | 'NETWORKING' | 'IT';

export interface ConsistenzeCliente {
  id?: string;
  organization_id: string;
  nr_sedi: number;
  nr_interni_telefonici: number;
  descrizione_telefoni: string;
  nr_canali_fonia: number;
  note_generali: string;
}

export interface ConsistenzeItem {
  id?: string;
  organization_id: string;
  area: ConsistenzeArea;
  categoria: string;
  tecnologia: string;
  fornitore: string;
  quantita: number;
  scadenza: string | null;
  metriche_json: Record<string, any>;
}

export interface AssetIRP {
  id?: string;
  organization_id: string;
  consistenza_item_id: string | null;
  area: string;
  categoria: string;
  tecnologia: string;
  fornitore: string;
  quantita: number;
  esposizione_score: number;
  criticita_score: number;
  superficie_score: number;
  rischio_intrinseco: number;
  rischio_residuo: number;
}

export interface IRPHistory {
  id?: string;
  organization_id: string;
  irp_score: number;
  area_scores_json: Record<string, number>;
  snapshot_date: string;
}

export const AREA_LABELS: Record<ConsistenzeArea, string> = {
  UCC: 'UCC',
  SECURITY: 'Security',
  CONN_FONIA: 'Connessioni e Fonia',
  NETWORKING: 'Networking',
  IT: 'IT',
};

export const AREA_WEIGHTS: Record<ConsistenzeArea, number> = {
  SECURITY: 0.30,
  IT: 0.25,
  NETWORKING: 0.15,
  CONN_FONIA: 0.15,
  UCC: 0.15,
};

export const AREA_CATEGORIES: Record<ConsistenzeArea, string[]> = {
  UCC: ['Centralino', 'SBC', 'Gateway', 'Licenze'],
  SECURITY: ['Firewall', 'EDR', 'SIEM', 'MDR', 'Email Security', 'Backup'],
  CONN_FONIA: ['FTTC', 'FTTH', 'MPLS', '4G Backup', 'SIP Trunk'],
  NETWORKING: ['Switch centro stella', 'Access Switch', 'Access Point', 'Router'],
  IT: ['Server', 'PC', 'Notebook', 'Stampanti', 'NAS', 'Storage', 'Hypervisor'],
};

// Extra columns per area (stored in metriche_json)
export const AREA_EXTRA_COLUMNS: Record<ConsistenzeArea, { key: string; label: string; type: 'number' | 'text' }[]> = {
  UCC: [
    { key: 'nr_canali', label: 'Nr Canali', type: 'number' },
    { key: 'nr_interni', label: 'Nr Interni', type: 'number' },
  ],
  SECURITY: [
    { key: 'client_utenti', label: 'Client/Utenti', type: 'number' },
    { key: 'server_fisici', label: 'Server Fisici', type: 'number' },
    { key: 'server_virtuali', label: 'Server Virtuali', type: 'number' },
    { key: 'ip_pubblici', label: 'IP Pubblici', type: 'number' },
    { key: 'vpn', label: 'VPN', type: 'number' },
    { key: 'dispositivi_mobili', label: 'Dispositivi Mobili', type: 'number' },
  ],
  CONN_FONIA: [
    { key: 'banda', label: 'Banda', type: 'text' },
  ],
  NETWORKING: [],
  IT: [],
};

export function getRiskLevel(score: number): { label: string; color: string } {
  if (score <= 20) return { label: 'Basso', color: 'text-green-500' };
  if (score <= 40) return { label: 'Medio-Basso', color: 'text-yellow-500' };
  if (score <= 60) return { label: 'Medio', color: 'text-orange-400' };
  if (score <= 80) return { label: 'Alto', color: 'text-orange-600' };
  return { label: 'Critico', color: 'text-red-500' };
}
