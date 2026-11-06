import React, { useEffect, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { META_LABELS, canTransition, type DocxMetadata, type DocxMetaKey } from '@/lib/docxMetadata';

const SOURCE: Record<string, string> = { custom: 'proprietà file', core: 'proprietà Word', control: 'campo modulo', text: 'testo documento' };
const APPLICABLE: DocxMetaKey[] = ['name', 'document_code', 'revision', 'status', 'confidentiality', 'category', 'description', 'tags'];

interface Props {
  found: DocxMetadata;
  current: Partial<Record<DocxMetaKey, string>>;
  /** Existing document: revision locked, status must follow the workflow. */
  existing?: boolean;
  onChange: (accepted: Partial<Record<DocxMetaKey, string>>) => void;
}

export function lockReason(key: DocxMetaKey, value: string, current: Partial<Record<DocxMetaKey, string>>, existing?: boolean): string | null {
  if (!existing) return null;
  if (key === 'revision' && value !== current.revision) return 'La revisione avanza solo con «Carica nuova revisione»';
  if (key === 'status' && current.status && !canTransition(current.status, value)) return `Da «${current.status}» non si può passare direttamente a «${value}»`;
  return null;
}

const DocxMetaFindings: React.FC<Props> = ({ found, current, existing, onChange }) => {
  const keys = (Object.keys(found) as DocxMetaKey[]);
  const [accepted, setAccepted] = useState<Set<DocxMetaKey>>(new Set());

  useEffect(() => {
    const init = new Set(keys.filter(k => APPLICABLE.includes(k) && !lockReason(k, found[k]!.value, current, existing) && found[k]!.value !== current[k]));
    setAccepted(init);
  }, [found]);

  useEffect(() => {
    const out: Partial<Record<DocxMetaKey, string>> = {};
    accepted.forEach(k => { out[k] = found[k]!.value; });
    onChange(out);
  }, [accepted]);

  if (!keys.length) return <p className="text-sm text-muted-foreground">Nessun metadato trovato nel documento.</p>;
  return (
    <div className="rounded-md border border-border">
      <div className="px-3 py-2 text-sm font-medium border-b border-border">Trovato nel documento</div>
      <div className="divide-y divide-border">
        {keys.map(k => {
          const v = found[k]!;
          const lock = lockReason(k, v.value, current, existing);
          const applicable = APPLICABLE.includes(k);
          const same = current[k] !== undefined && current[k] === v.value;
          return (
            <label key={k} className="flex items-start gap-3 px-3 py-2 text-sm">
              <Checkbox className="mt-0.5" disabled={!applicable || !!lock || same} checked={accepted.has(k)}
                onCheckedChange={(c) => setAccepted(prev => { const n = new Set(prev); c ? n.add(k) : n.delete(k); return n; })} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{META_LABELS[k]}</span>
                  <span className="truncate">{v.value}</span>
                  <Badge variant="outline" className="text-[10px]">{SOURCE[v.source]}</Badge>
                  {same && <Badge variant="secondary" className="text-[10px]">uguale</Badge>}
                </div>
                {current[k] !== undefined && !same && <div className="text-xs text-muted-foreground">In piattaforma: {current[k] || '—'}</div>}
                {lock && <div className="text-xs text-destructive">{lock}</div>}
                {!applicable && <div className="text-xs text-muted-foreground">Solo informativo</div>}
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
};

export default DocxMetaFindings;
