export type DocumentCategory = 'Piano Generale' | 'Checklist / OPL / SOP' | 'Template' | 'Processo' | 'Legal' | 'Audit' | 'ISO & Audit' | 'NIS2' | 'Tecnico' | 'Varie';

const CATEGORY_PREFIX_MAP: Record<DocumentCategory, string> = {
  'Piano Generale': 'PG',
  'Checklist / OPL / SOP': 'SOP',
  'Template': 'TPL',
  'Processo': 'PRC',
  'Legal': 'LEG',
  'Audit': 'AUD',
  'ISO & Audit': 'ISO',
  'NIS2': 'NIS',
  'Tecnico': 'TEC',
  'Varie': 'VAR',
};

export const getCategoryPrefix = (category: DocumentCategory): string => {
  return CATEGORY_PREFIX_MAP[category] || 'VAR';
};

export const generateDocumentCode = (
  category: DocumentCategory,
  sequenceNumber: number
): string => {
  const prefix = getCategoryPrefix(category);
  const paddedNum = String(sequenceNumber).padStart(3, '0');
  return `${prefix}-${paddedNum}`;
};

export const formatDocumentCodeWithRevision = (
  code: string,
  revision: number
): string => {
  return `${code}_Rev${String(revision).padStart(2, '0')}`;
};

export const DOCUMENT_STATUSES = ['Bozza', 'In Revisione', 'Approvato', 'Obsoleto'] as const;
export type DocumentStatus = typeof DOCUMENT_STATUSES[number];

export const CONFIDENTIALITY_LEVELS = ['Pubblico', 'Interno', 'Riservato', 'Confidenziale'] as const;
export type ConfidentialityLevel = typeof CONFIDENTIALITY_LEVELS[number];

export const STATUS_COLORS: Record<string, string> = {
  'Bozza': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  'In Revisione': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'Approvato': 'bg-green-500/20 text-green-400 border-green-500/30',
  'Obsoleto': 'bg-red-500/20 text-red-400 border-red-500/30',
};

export const CONFIDENTIALITY_COLORS: Record<string, string> = {
  'Pubblico': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'Interno': 'bg-sky-500/20 text-sky-400 border-sky-500/30',
  'Riservato': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  'Confidenziale': 'bg-red-500/20 text-red-400 border-red-500/30',
};
