import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import ContactPicker from './ContactPicker';
import { DOCUMENT_STATUSES, CONFIDENTIALITY_LEVELS } from './DocumentCodeGenerator';
import { DirectoryContact } from '@/types/irp';
import type { Database } from '@/integrations/supabase/types';

type DocumentCategory = Database['public']['Enums']['document_category'];

const DOCUMENT_CATEGORIES: DocumentCategory[] = [
  'Piano Generale', 'Checklist / OPL / SOP', 'Template', 'Processo',
  'Legal', 'ISO & Audit', 'NIS2', 'Tecnico', 'Varie'
];

export interface DocumentMetadata {
  name: string;
  document_code: string;
  revision: number;
  status: string;
  confidentiality: string;
  category: DocumentCategory;
  description: string;
  tags: string[];
  drafted_by: string[];
  prepared_by: string[];
  reviewed_by: string[];
  approved_by: string[];
}

interface DocumentMetadataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metadata: DocumentMetadata | null;
  onSave: (metadata: DocumentMetadata) => void;
  contacts: DirectoryContact[];
  title?: string;
}

const DocumentMetadataDialog: React.FC<DocumentMetadataDialogProps> = ({
  open, onOpenChange, metadata, onSave, contacts, title = 'Modifica Metadata Documento'
}) => {
  const [form, setForm] = useState<DocumentMetadata>({
    name: '', document_code: '', revision: 1, status: 'Bozza',
    confidentiality: 'Interno', category: 'Varie', description: '',
    tags: [], drafted_by: [], prepared_by: [], reviewed_by: [], approved_by: []
  });
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    if (metadata) setForm(metadata);
  }, [metadata]);

  const update = (partial: Partial<DocumentMetadata>) => setForm(prev => ({ ...prev, ...partial }));

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !form.tags.includes(t)) {
      update({ tags: [...form.tags, t] });
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    update({ tags: form.tags.filter(t => t !== tag) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Gestisci i metadati ISO del documento</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome Documento</Label>
              <Input value={form.name} onChange={e => update({ name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Codice Documento</Label>
              <Input value={form.document_code} onChange={e => update({ document_code: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Revisione</Label>
              <Input type="number" min={1} value={form.revision} onChange={e => update({ revision: parseInt(e.target.value) || 1 })} />
            </div>
            <div className="space-y-2">
              <Label>Stato</Label>
              <Select value={form.status} onValueChange={v => update({ status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOCUMENT_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Classificazione</Label>
              <Select value={form.confidentiality} onValueChange={v => update({ confidentiality: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONFIDENTIALITY_LEVELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={form.category} onValueChange={v => update({ category: v as DocumentCategory })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOCUMENT_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Descrizione / Scopo</Label>
            <Textarea value={form.description} onChange={e => update({ description: e.target.value })} rows={2} />
          </div>

          <div className="space-y-2">
            <Label>Tag</Label>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                placeholder="Aggiungi tag e premi Invio"
                className="flex-1"
              />
              <Button variant="outline" size="sm" onClick={addTag}>+</Button>
            </div>
            {form.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {form.tags.map(tag => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                    <X className="w-3 h-3 ml-1 cursor-pointer" onClick={() => removeTag(tag)} />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <ContactPicker label="Redatto da" selectedIds={form.drafted_by} onChange={ids => update({ drafted_by: ids })} contacts={contacts} />
            <ContactPicker label="Elaborato da" selectedIds={form.prepared_by} onChange={ids => update({ prepared_by: ids })} contacts={contacts} />
            <ContactPicker label="Revisionato da" selectedIds={form.reviewed_by} onChange={ids => update({ reviewed_by: ids })} contacts={contacts} />
            <ContactPicker label="Approvato da" selectedIds={form.approved_by} onChange={ids => update({ approved_by: ids })} contacts={contacts} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={() => { onSave(form); onOpenChange(false); }}>Salva</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DocumentMetadataDialog;
