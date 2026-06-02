import React from 'react';
import { useSurfaceGraphStore } from '@/stores/surface-graph-store';
import { ScrollArea } from '@/components/ui/scroll-area';

export const TypeFiltersPanel: React.FC = () => {
  const filters    = useSurfaceGraphStore((s) => s.filters);
  const setFilters = useSurfaceGraphStore((s) => s.setFilters);

  const toggleType = (type: string) => {
    const types = filters.types.map((t) => t.type === type ? { ...t, checked: !t.checked } : t);
    setFilters({ types });
  };

  const allChecked  = filters.types.every((t) => t.checked);
  const toggleAll   = () => setFilters({ types: filters.types.map((t) => ({ ...t, checked: !allChecked })) });

  if (!filters.types.length) return null;

  return (
    <div className="p-3 border-b border-border/50">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tipi</p>
        <button className="text-xs text-muted-foreground hover:text-foreground" onClick={toggleAll}>
          {allChecked ? 'Nascondi tutti' : 'Mostra tutti'}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {filters.types.map((t) => (
          <button
            key={t.type}
            onClick={() => toggleType(t.type)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-opacity ${t.checked ? 'opacity-100' : 'opacity-40'}`}
            style={{ borderColor: t.color, color: t.color }}
          >
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: t.color }} />
            {t.type}
          </button>
        ))}
      </div>
    </div>
  );
};
