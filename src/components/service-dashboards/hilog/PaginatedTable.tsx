import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props<T> {
  data: T[];
  pageSize?: number;
  renderTable: (pageData: T[]) => React.ReactNode;
}

export function PaginatedTable<T>({ data, pageSize = 10, renderTable }: Props<T>) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(data.length / pageSize));
  
  // Reset page if data changes and page is out of bounds
  const safePage = Math.min(page, totalPages - 1);
  if (safePage !== page) setPage(safePage);

  const pageData = useMemo(() => {
    return data.slice(safePage * pageSize, (safePage + 1) * pageSize);
  }, [data, safePage, pageSize]);

  return (
    <div>
      {renderTable(pageData)}
      {data.length > pageSize && (
        <div className="flex items-center justify-between mt-3 text-sm text-muted-foreground">
          <span>{data.length} risultati — Pagina {safePage + 1} di {totalPages}</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={safePage === 0} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={safePage >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
