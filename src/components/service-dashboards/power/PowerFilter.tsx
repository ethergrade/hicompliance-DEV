import React, { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Braces, FilterX, SlidersHorizontal } from 'lucide-react';
import { AdvancedFilterBuilder } from '../hilog/AdvancedFilterBuilder';
import { AdvancedFilter, createEmptyFilter, evalAdvancedFilter } from '../hilog/filterEngine';

interface Props<T> {
  rows: T[];
  labels?: Record<string, string>;
  children: (rows: T[]) => React.ReactNode;
}

const humanize = (k: string) => k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').replace(/^./, c => c.toUpperCase());

/** Filtri stile Power Query per tabelle esistenti: filtro per campo + query E/O HiLog. */
export function PowerFilter<T extends Record<string, any>>({ rows, labels = {}, children }: Props<T>) {
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const [adv, setAdv] = useState<AdvancedFilter>(createEmptyFilter());
  const [showCols, setShowCols] = useState(false);
  const [showAdv, setShowAdv] = useState(false);

  const keys = useMemo(() => {
    const set = new Set<string>();
    rows.slice(0, 20).forEach(r => Object.entries(r ?? {}).forEach(([k, v]) => {
      if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) set.add(k);
    }));
    return [...set];
  }, [rows]);

  const fields = useMemo(() => [{ value: 'any', label: 'Qualsiasi campo' }, ...keys.map(k => ({ value: k, label: labels[k] ?? humanize(k) }))], [keys, labels]);

  const filtered = useMemo(() => {
    const out = rows.filter(r => keys.every(k => {
      const q = (colFilters[k] || '').trim().toLowerCase();
      return !q || String(r[k] ?? '').toLowerCase().includes(q);
    }));
    return evalAdvancedFilter(out, adv);
  }, [rows, keys, colFilters, adv]);

  const activeCount = Object.values(colFilters).filter(v => v.trim()).length + adv.groups.reduce((n, g) => n + g.conditions.filter(c => c.value.trim()).length, 0);

  return (
    <div className="space-y-3 min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant={showCols ? 'default' : 'outline'} onClick={() => setShowCols(s => !s)}>
          <SlidersHorizontal className="h-4 w-4 mr-1" /> Filtri colonne
        </Button>
        <Button size="sm" variant={showAdv ? 'default' : 'outline'} onClick={() => setShowAdv(s => !s)}>
          <Braces className="h-4 w-4 mr-1" /> Query avanzata
        </Button>
        {activeCount > 0 && (
          <Button size="sm" variant="ghost" onClick={() => { setColFilters({}); setAdv(createEmptyFilter()); }}>
            <FilterX className="h-4 w-4 mr-1" /> Azzera filtri ({activeCount})
          </Button>
        )}
        <Badge variant="outline" className="ml-auto">{filtered.length} / {rows.length} righe</Badge>
      </div>
      {showCols && (
        <div className="grid gap-2 grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
          {keys.map(k => (
            <Input key={k} value={colFilters[k] || ''} placeholder={labels[k] ?? humanize(k)} className="h-8 text-xs min-w-0"
              onChange={e => setColFilters(p => ({ ...p, [k]: e.target.value }))} />
          ))}
        </div>
      )}
      {showAdv && <AdvancedFilterBuilder fields={fields} filter={adv} onChange={setAdv} onClose={() => setShowAdv(false)} />}
      <div className="overflow-x-auto">{children(filtered)}</div>
    </div>
  );
}
