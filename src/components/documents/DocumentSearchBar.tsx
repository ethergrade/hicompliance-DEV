import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Search, X, SlidersHorizontal } from 'lucide-react';
import { DOCUMENT_STATUSES, CONFIDENTIALITY_LEVELS } from './DocumentCodeGenerator';
import type { Database } from '@/integrations/supabase/types';

type DocumentCategory = Database['public']['Enums']['document_category'];

const DOCUMENT_CATEGORIES: DocumentCategory[] = [
  'Piano Generale', 'Checklist / OPL / SOP', 'Template', 'Processo',
  'Legal', 'ISO & Audit', 'NIS2', 'Tecnico', 'Varie'
];

export interface DocumentFilters {
  search: string;
  category: DocumentCategory | 'all';
  status: string;
  confidentiality: string;
}

interface DocumentSearchBarProps {
  filters: DocumentFilters;
  onFiltersChange: (filters: DocumentFilters) => void;
}

const DocumentSearchBar: React.FC<DocumentSearchBarProps> = ({ filters, onFiltersChange }) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const update = (partial: Partial<DocumentFilters>) => {
    onFiltersChange({ ...filters, ...partial });
  };

  const hasActiveFilters = filters.status !== 'all' || filters.confidentiality !== 'all' || filters.category !== 'all';

  const clearFilters = () => {
    onFiltersChange({ search: '', category: 'all', status: 'all', confidentiality: 'all' });
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={e => update({ search: e.target.value })}
            placeholder="Cerca per nome, codice, descrizione, tag..."
            className="pl-9"
          />
        </div>
        <Button
          variant={showAdvanced ? 'default' : 'outline'}
          size="icon"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          <SlidersHorizontal className="w-4 h-4" />
        </Button>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="w-4 h-4 mr-1" />
            Reset
          </Button>
        )}
      </div>

      {showAdvanced && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Select value={filters.category} onValueChange={v => update({ category: v as DocumentCategory | 'all' })}>
            <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le categorie</SelectItem>
              {DOCUMENT_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filters.status} onValueChange={v => update({ status: v })}>
            <SelectTrigger><SelectValue placeholder="Stato" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli stati</SelectItem>
              {DOCUMENT_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filters.confidentiality} onValueChange={v => update({ confidentiality: v })}>
            <SelectTrigger><SelectValue placeholder="Classificazione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le classificazioni</SelectItem>
              {CONFIDENTIALITY_LEVELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
};

export default DocumentSearchBar;
