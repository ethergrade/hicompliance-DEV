import React, { useMemo, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Braces, FilterX, ChevronLeft, ChevronRight } from 'lucide-react';
import { AdvancedFilterBuilder } from '../hilog/AdvancedFilterBuilder';
import { AdvancedFilter, createEmptyFilter, evalAdvancedFilter } from '../hilog/filterEngine';

export interface PowerColumn<T> {
  key: keyof T & string;
  label: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

interface Props<T> {
  rows: T[];
  columns: PowerColumn<T>[];
  pageSize?: number;
  rowKey: (row: T) => string;
  emptyText?: string;
}

/** Tabella con filtro per colonna (stile Excel) + costruttore query E/O (stile HiLog). */
export function PowerTable<T extends Record<string, any>>({ rows, columns, pageSize = 10, rowKey, emptyText = 'Nessun risultato' }: Props<T>) {
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const [adv, setAdv] = useState<AdvancedFilter>(createEmptyFilter());
  const [showAdv, setShowAdv] = useState(false);
  const [page, setPage] = useState(0);

  const fields = useMemo(() => [{ value: 'any', label: 'Qualsiasi campo' }, ...columns.map(c => ({ value: c.key, label: c.label }))], [columns]);

  const filtered = useMemo(() => {
    let out = rows.filter(r => columns.every(c => {
      const q = (colFilters[c.key] || '').trim().toLowerCase();
      return !q || String(r[c.key] ?? '').toLowerCase().includes(q);
    }));
    out = evalAdvancedFilter(out, adv);
    return out;
  }, [rows, columns, colFilters, adv]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pages - 1);
  const slice = filtered.slice(cur * pageSize, cur * pageSize + pageSize);
  const activeCount = Object.values(colFilters).filter(v => v.trim()).length + adv.groups.reduce((n, g) => n + g.conditions.filter(c => c.value.trim()).length, 0);

  return (
    <div className="space-y-3 min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant={showAdv ? 'default' : 'outline'} onClick={() => setShowAdv(s => !s)}>
          <Braces className="h-4 w-4 mr-1" /> Query avanzata
        </Button>
        {activeCount > 0 && (
          <Button size="sm" variant="ghost" onClick={() => { setColFilters({}); setAdv(createEmptyFilter()); setPage(0); }}>
            <FilterX className="h-4 w-4 mr-1" /> Azzera filtri ({activeCount})
          </Button>
        )}
        <Badge variant="outline" className="ml-auto">{filtered.length} / {rows.length} righe</Badge>
      </div>
      {showAdv && <AdvancedFilterBuilder fields={fields} filter={adv} onChange={f => { setAdv(f); setPage(0); }} onClose={() => setShowAdv(false)} />}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>{columns.map(c => <TableHead key={c.key} className="whitespace-nowrap">{c.label}</TableHead>)}</TableRow>
            <TableRow>
              {columns.map(c => (
                <TableHead key={c.key} className="py-1">
                  <Input value={colFilters[c.key] || ''} placeholder="Filtra…" className="h-7 text-xs min-w-[80px]"
                    onChange={e => { setColFilters(p => ({ ...p, [c.key]: e.target.value })); setPage(0); }} />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {slice.length === 0 && <TableRow><TableCell colSpan={columns.length} className="text-center text-muted-foreground py-6">{emptyText}</TableCell></TableRow>}
            {slice.map(r => (
              <TableRow key={rowKey(r)}>
                {columns.map(c => <TableCell key={c.key} className={c.className ?? 'text-sm'}>{c.render ? c.render(r) : String(r[c.key] ?? '')}</TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
        <Button size="icon" variant="outline" className="h-7 w-7" disabled={cur === 0} onClick={() => setPage(cur - 1)}><ChevronLeft className="h-4 w-4" /></Button>
        Pagina {cur + 1} di {pages}
        <Button size="icon" variant="outline" className="h-7 w-7" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}
