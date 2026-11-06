import PizZip from 'pizzip';
import { DOCUMENT_STATUSES, CONFIDENTIALITY_LEVELS } from '@/components/documents/DocumentCodeGenerator';

export const DOCX_CATEGORIES = ['Piano Generale', 'Checklist / OPL / SOP', 'Template', 'Processo', 'Legal', 'ISO & Audit', 'NIS2', 'Tecnico', 'Varie'];

export type DocxMetaKey = 'name' | 'document_code' | 'revision' | 'status' | 'confidentiality' | 'category' | 'description' | 'tags' | 'revision_date' | 'drafted_by' | 'reviewed_by' | 'approved_by';
export type DocxMetaSource = 'custom' | 'core' | 'control' | 'text';
export interface DocxMetaValue { value: string; source: DocxMetaSource; raw: string }
export type DocxMetadata = Partial<Record<DocxMetaKey, DocxMetaValue>>;

export const META_LABELS: Record<DocxMetaKey, string> = {
  name: 'Titolo', document_code: 'Codice', revision: 'Revisione', status: 'Stato', confidentiality: 'Classificazione',
  category: 'Categoria', description: 'Descrizione', tags: 'Tag', revision_date: 'Data revisione',
  drafted_by: 'Redatto da', reviewed_by: 'Revisionato da', approved_by: 'Approvato da',
};

/** Label aliases (lower-case) recognised in custom props, content controls and body text. */
const ALIASES: Record<DocxMetaKey, string[]> = {
  name: ['titolo', 'title', 'nome documento', 'documento'],
  document_code: ['codice', 'codice documento', 'code', 'document code', 'doc id', 'id documento'],
  revision: ['revisione', 'rev', 'rev.', 'revision', 'versione', 'version', 'n. revisione'],
  status: ['stato', 'status', 'stato documento'],
  confidentiality: ['classificazione', 'riservatezza', 'confidenzialità', 'confidenzialita', 'classification', 'confidentiality', 'livello di riservatezza'],
  category: ['categoria', 'category', 'tipologia', 'tipo documento'],
  description: ['descrizione', 'scopo', 'description', 'oggetto'],
  tags: ['tag', 'tags', 'parole chiave', 'keywords'],
  revision_date: ['data revisione', 'data emissione', 'data', 'date', 'revision date'],
  drafted_by: ['redatto da', 'autore', 'author', 'prepared by', 'elaborato da'],
  reviewed_by: ['revisionato da', 'verificato da', 'reviewed by', 'checked by'],
  approved_by: ['approvato da', 'approved by'],
};
const KEY_BY_ALIAS = new Map<string, DocxMetaKey>();
(Object.keys(ALIASES) as DocxMetaKey[]).forEach(k => ALIASES[k].forEach(a => KEY_BY_ALIAS.set(a, k)));
/** Custom property names written by the platform. */
export const CUSTOM_PROP: Record<DocxMetaKey, string> = {
  name: 'Titolo', document_code: 'Codice', revision: 'Revisione', status: 'Stato', confidentiality: 'Classificazione',
  category: 'Categoria', description: 'Descrizione', tags: 'Tag', revision_date: 'Data revisione',
  drafted_by: 'Redatto da', reviewed_by: 'Revisionato da', approved_by: 'Approvato da',
};

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
const pick = (list: readonly string[], v: string) => list.find(x => norm(x) === norm(v));

/** Map a raw value onto the platform vocabularies; returns null when unrecognised. */
export function normalizeMetaValue(key: DocxMetaKey, raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (key === 'status') {
    const m: Record<string, string> = { draft: 'Bozza', 'in review': 'In Revisione', review: 'In Revisione', 'in revisione': 'In Revisione', revisione: 'In Revisione', approved: 'Approvato', approvato: 'Approvato', approvata: 'Approvato', final: 'Approvato', obsolete: 'Obsoleto', obsoleto: 'Obsoleto', ritirato: 'Obsoleto', bozza: 'Bozza' };
    return pick(DOCUMENT_STATUSES, v) ?? m[norm(v)] ?? null;
  }
  if (key === 'confidentiality') {
    const m: Record<string, string> = { public: 'Pubblico', pubblica: 'Pubblico', internal: 'Interno', interna: 'Interno', 'uso interno': 'Interno', restricted: 'Riservato', riservata: 'Riservato', confidential: 'Confidenziale', 'strettamente riservato': 'Confidenziale' };
    return pick(CONFIDENTIALITY_LEVELS, v) ?? m[norm(v)] ?? null;
  }
  if (key === 'category') return pick(DOCX_CATEGORIES, v) ?? (norm(v) === 'audit' ? 'ISO & Audit' : null);
  if (key === 'revision') { const n = v.match(/\d+/); return n ? String(parseInt(n[0], 10)) : null; }
  return v;
}

const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const encode = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const textOf = (xml: string) => decode([...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map(m => m[1]).join(''));
const LINE_RE = /^\s*([A-Za-zÀ-ÿ.\s]{2,30}?)\s*[:–\-]\s*(.+?)\s*$/;

function setRaw(out: DocxMetadata, key: DocxMetaKey, raw: string, source: DocxMetaSource) {
  if (out[key]) return; // first (highest-priority) source wins
  const value = normalizeMetaValue(key, raw);
  if (value) out[key] = { value, source, raw: raw.trim() };
}

const bodyParts = (zip: PizZip) => Object.keys(zip.files).filter(f => /^word\/(document|header\d*|footer\d*)\.xml$/.test(f));

export function readDocxMetadataFromZip(zip: PizZip): DocxMetadata {
  const out: DocxMetadata = {};
  const custom = zip.file('docProps/custom.xml')?.asText();
  if (custom) for (const m of custom.matchAll(/<property[^>]*name="([^"]+)"[^>]*>\s*<vt:\w+>([^<]*)<\/vt:\w+>/g)) {
    const k = KEY_BY_ALIAS.get(norm(decode(m[1])));
    if (k) setRaw(out, k, decode(m[2]), 'custom');
  }
  const core = zip.file('docProps/core.xml')?.asText();
  if (core) {
    const g = (tag: string) => { const m = core.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`)); return m ? decode(m[1]) : ''; };
    setRaw(out, 'name', g('dc:title'), 'core');
    setRaw(out, 'description', g('dc:description') || g('dc:subject'), 'core');
    if (g('cp:keywords')) setRaw(out, 'tags', g('cp:keywords'), 'core');
    if (g('cp:category')) setRaw(out, 'category', g('cp:category'), 'core');
    if (g('cp:contentStatus')) setRaw(out, 'status', g('cp:contentStatus'), 'core');
  }
  for (const part of bodyParts(zip)) {
    const xml = zip.file(part)!.asText();
    for (const m of xml.matchAll(/<w:sdt>([\s\S]*?)<\/w:sdt>/g)) {
      const label = m[1].match(/<w:(?:alias|tag) w:val="([^"]+)"/)?.[1];
      const k = label && KEY_BY_ALIAS.get(norm(decode(label)));
      const content = m[1].match(/<w:sdtContent>([\s\S]*)<\/w:sdtContent>/)?.[1];
      if (k && content) setRaw(out, k, textOf(content), 'control');
    }
    for (const m of xml.matchAll(/<w:fldSimple[^>]*w:instr="\s*DOCPROPERTY\s+&quot;?([^"&]+?)&quot;?\s[^"]*"[^>]*>([\s\S]*?)<\/w:fldSimple>/g)) {
      const k = KEY_BY_ALIAS.get(norm(m[1])); if (k) setRaw(out, k, textOf(m[2]), 'control');
    }
    for (const row of xml.matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)) {
      const cells = [...row[0].matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map(c => textOf(c[1]).trim());
      for (let i = 0; i < cells.length - 1; i++) {
        const k = KEY_BY_ALIAS.get(norm(cells[i].replace(/[:\s]+$/, '')));
        if (k && cells[i + 1]) setRaw(out, k, cells[i + 1], 'text');
      }
    }
    for (const p of xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)) {
      const m = textOf(p[0]).match(LINE_RE);
      const k = m && KEY_BY_ALIAS.get(norm(m[1]));
      if (k) setRaw(out, k, m![2], 'text');
    }
  }
  return out;
}

export async function readDocxMetadata(blob: Blob): Promise<DocxMetadata> {
  return readDocxMetadataFromZip(new PizZip(await blob.arrayBuffer()));
}

export const isDocx = (name?: string | null, type?: string | null) =>
  /\.docx$/i.test(name || '') || type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Replace a paragraph's visible text with `text`, keeping the first run's formatting. */
function replaceParagraphText(pXml: string, text: string): string {
  let first = true;
  return pXml.replace(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>/g, () => {
    if (!first) return '<w:t></w:t>';
    first = false;
    return `<w:t xml:space="preserve">${encode(text)}</w:t>`;
  });
}

function ensureCustomPart(zip: PizZip) {
  if (zip.file('docProps/custom.xml')) return;
  zip.file('docProps/custom.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"></Properties>');
  const ct = zip.file('[Content_Types].xml')!.asText();
  if (!ct.includes('/docProps/custom.xml'))
    zip.file('[Content_Types].xml', ct.replace('</Types>', '<Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/></Types>'));
  const rels = zip.file('_rels/.rels')!.asText();
  if (!rels.includes('docProps/custom.xml'))
    zip.file('_rels/.rels', rels.replace('</Relationships>', '<Relationship Id="rIdHiCustom" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties" Target="docProps/custom.xml"/></Relationships>'));
}

export function writeDocxMetadataToZip(zip: PizZip, meta: Partial<Record<DocxMetaKey, string>>) {
  const entries = (Object.entries(meta) as [DocxMetaKey, string][]).filter(([, v]) => v !== undefined && v !== null);
  if (!entries.length) return zip;
  // 1. custom properties
  ensureCustomPart(zip);
  let custom = zip.file('docProps/custom.xml')!.asText().replace(/<Properties([^>]*)\/>/, '<Properties$1></Properties>');
  for (const [k, v] of entries) {
    const name = CUSTOM_PROP[k];
    const re = new RegExp(`(<property[^>]*name="${name}"[^>]*>\\s*<vt:\\w+>)[^<]*(</vt:\\w+>)`);
    if (re.test(custom)) custom = custom.replace(re, `$1${encode(v)}$2`);
    else {
      const pids = [...custom.matchAll(/pid="(\d+)"/g)].map(m => +m[1]);
      const pid = Math.max(1, ...pids) + 1;
      custom = custom.replace('</Properties>', `<property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="${pid}" name="${name}"><vt:lpwstr>${encode(v)}</vt:lpwstr></property></Properties>`);
    }
  }
  zip.file('docProps/custom.xml', custom);
  // 2. core properties
  const coreF = zip.file('docProps/core.xml');
  if (coreF) {
    let core = coreF.asText();
    const setCore = (tag: string, v?: string) => {
      if (v === undefined) return;
      const re = new RegExp(`(<${tag}[^>]*>)[^<]*(</${tag}>)`);
      core = re.test(core) ? core.replace(re, `$1${encode(v)}$2`) : core.replace(/<\/cp:coreProperties>/, `<${tag}>${encode(v)}</${tag}></cp:coreProperties>`);
    };
    setCore('dc:title', meta.name); setCore('dc:description', meta.description); setCore('cp:keywords', meta.tags);
    setCore('cp:category', meta.category); setCore('cp:contentStatus', meta.status);
    zip.file('docProps/core.xml', core);
  }
  // 3. visible values: content controls, DOCPROPERTY simple fields, table rows, "Label: value" lines
  for (const part of bodyParts(zip)) {
    let xml = zip.file(part)!.asText();
    xml = xml.replace(/<w:sdt>([\s\S]*?)<\/w:sdt>/g, (all, inner) => {
      const label = inner.match(/<w:(?:alias|tag) w:val="([^"]+)"/)?.[1];
      const k = label && KEY_BY_ALIAS.get(norm(decode(label)));
      if (!k || meta[k as DocxMetaKey] === undefined) return all;
      return all.replace(/<w:sdtContent>([\s\S]*)<\/w:sdtContent>/, (_c: string, c: string) =>
        `<w:sdtContent>${c.replace(/<w:p[ >][\s\S]*?<\/w:p>|<w:r[ >][\s\S]*?<\/w:r>/, (blk: string) => replaceParagraphText(blk, meta[k as DocxMetaKey]!))}</w:sdtContent>`);
    });
    xml = xml.replace(/(<w:fldSimple[^>]*w:instr="\s*DOCPROPERTY\s+&quot;?([^"&]+?)&quot;?\s[^"]*"[^>]*>)([\s\S]*?)(<\/w:fldSimple>)/g, (all, open, prop, body, close) => {
      const k = KEY_BY_ALIAS.get(norm(prop));
      return k && meta[k] !== undefined ? open + replaceParagraphText(body, meta[k]!) + close : all;
    });
    xml = xml.replace(/<w:tr[ >][\s\S]*?<\/w:tr>/g, (row) => {
      const cells = [...row.matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map(c => c[0]);
      let out = row;
      for (let i = 0; i < cells.length - 1; i++) {
        const k = KEY_BY_ALIAS.get(norm(textOf(cells[i]).replace(/[:\s]+$/, '')));
        if (k && meta[k] !== undefined && textOf(cells[i + 1]).trim()) {
          const next = cells[i + 1].replace(/<w:p[ >][\s\S]*?<\/w:p>/, (p) => replaceParagraphText(p, meta[k]!));
          out = out.replace(cells[i + 1], next);
        }
      }
      return out;
    });
    xml = xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, (p) => {
      if (p.includes('<w:tc>')) return p;
      const m = textOf(p).match(LINE_RE);
      const k = m && KEY_BY_ALIAS.get(norm(m[1]));
      if (!k || meta[k] === undefined) return p;
      const sep = textOf(p).match(/\s*[:–\-]\s*/)![0];
      return replaceParagraphText(p, `${m![1].trim()}${sep}${meta[k]}`);
    });
    zip.file(part, xml);
  }
  return zip;
}

export async function writeDocxMetadata(blob: Blob, meta: Partial<Record<DocxMetaKey, string>>): Promise<Blob> {
  const zip = writeDocxMetadataToZip(new PizZip(await blob.arrayBuffer()), meta);
  return zip.generate({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }) as Blob;
}

/** Platform document → metadata strings written into the file. */
export function platformMeta(doc: { name?: string; document_code?: string | null; revision?: number; status?: string; confidentiality?: string; category?: string; description?: string | null; tags?: string[] | null }): Partial<Record<DocxMetaKey, string>> {
  return {
    name: doc.name, document_code: doc.document_code ?? '', revision: String(doc.revision ?? 1), status: doc.status,
    confidentiality: doc.confidentiality, category: doc.category, description: doc.description ?? '', tags: (doc.tags ?? []).join(', '),
  };
}

/** Fields whose file value differs from the platform (only for keys present in the file). */
export function diffWithPlatform(file: DocxMetadata, doc: Parameters<typeof platformMeta>[0]): DocxMetaKey[] {
  const p = platformMeta(doc);
  return (Object.keys(file) as DocxMetaKey[]).filter(k => k in p && norm(p[k] ?? '') !== norm(file[k]!.value));
}

/** Status transitions permitted by the platform workflow (mirrors documentsApi.setStatus). */
export const STATUS_TRANSITIONS: Record<string, string[]> = {
  'Bozza': ['In Revisione'], 'In Revisione': ['Approvato', 'Bozza'], 'Approvato': ['Obsoleto'], 'Obsoleto': [],
};
export const canTransition = (from: string, to: string) => from === to || (STATUS_TRANSITIONS[from] ?? DOCUMENT_STATUSES as unknown as string[]).includes(to);
