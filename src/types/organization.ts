export type NIS2Classification = 'soggetto_essenziale' | 'soggetto_importante' | 'nessuna';

export interface OrganizationProfile {
  id: string;
  organization_id: string;
  legal_name: string | null;
  vat_number: string | null;
  fiscal_code: string | null;
  legal_address: string | null;
  operational_address: string | null;
  pec: string | null;
  phone: string | null;
  email: string | null;
  business_sector: string | null;
  nis2_classification: NIS2Classification | null;
  ciso_substitute: string | null;
  created_at: string;
  updated_at: string;
}

export const NIS2_LABELS: Record<NIS2Classification, string> = {
  soggetto_essenziale: 'Soggetto Essenziale',
  soggetto_importante: 'Soggetto Importante',
  nessuna: 'Nessuna delle due'
};

export const NIS2_DESCRIPTIONS: Record<NIS2Classification, string> = {
  soggetto_essenziale: 'Operatori di servizi essenziali (energia, trasporti, sanità, banche, infrastrutture digitali, acqua potabile, acque reflue, spazio, pubblica amministrazione)',
  soggetto_importante: 'Fornitori di servizi digitali, produttori, gestori rifiuti, settore alimentare, servizi postali, fabbricazione dispositivi medici, chimica, ricerca',
  nessuna: "L'azienda non rientra nelle categorie NIS2"
};

export const BUSINESS_SECTORS = [
  'Energia',
  'Trasporti',
  'Settore bancario',
  'Infrastrutture dei mercati finanziari',
  'Settore sanitario',
  'Acqua potabile',
  'Acque reflue',
  'Infrastrutture digitali',
  'Gestione servizi TIC (B2B)',
  'Pubblica amministrazione',
  'Spazio',
  'Servizi postali e di corriere',
  'Gestione rifiuti',
  'Fabbricazione, produzione e distribuzione di sostanze chimiche',
  'Produzione, trasformazione e distribuzione di alimenti',
  'Fabbricazione',
  'Fornitori di servizi digitali',
  'Ricerca',
  'Altro'
] as const;
