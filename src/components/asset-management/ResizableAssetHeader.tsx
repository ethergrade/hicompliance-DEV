import React, { useRef } from "react";
import { TableHead } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const ASSET_TABLE_COLUMNS = [
  { key: "name", title: "Nome", width: 240 },
  { key: "internal_code", title: "Internal Code", width: 160 },
  { key: "asset_type", title: "Asset Type", width: 170 },
  { key: "model", title: "Model", width: 180 },
  { key: "serial_number", title: "Serial Number", width: 190 },
  { key: "status", title: "Status", width: 160 },
  { key: "assignee", title: "Assignee", width: 180 },
  { key: "site", title: "Sito", width: 160 },
  { key: "supplier", title: "Supplier", width: 170 },
  { key: "availability", title: "Disponibilità", width: 160, unfiltered: true },
  { key: "expiry", title: "Scadenza", width: 130, unfiltered: true },
  { key: "source", title: "Origine", width: 170, unfiltered: true },
] as const;

export const MIN_ASSET_COLUMN_WIDTH = 100;

interface Props {
  title: string;
  width: number;
  defaultWidth: number;
  filter?: string;
  onFilter?: (value: string) => void;
  onResize: (width: number) => void;
}

export function ResizableAssetHeader({ title, width, defaultWidth, filter, onFilter, onResize }: Props) {
  const drag = useRef<{ x: number; width: number; pointerId: number } | null>(null);
  const finish = (event: React.PointerEvent<HTMLButtonElement>) => {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <TableHead className="relative h-auto p-0 align-top border-r border-border/60 last:border-r-0">
      <div className="min-w-0 px-3 pt-3 pb-2">
        <div className="flex h-6 min-w-0 items-center">
          <span className="block truncate text-xs font-semibold" title={title}>{title}</span>
        </div>
        <div className="mt-2 h-7">
          {onFilter && <Input aria-label={`Filtra ${title}`} placeholder="Filtra…" className="h-7 w-full min-w-0 rounded-sm text-xs" value={filter ?? ""} onChange={(e) => onFilter(e.target.value)} />}
        </div>
      </div>
      <Button
        type="button" variant="ghost"
        role="separator" aria-orientation="vertical" aria-label={`Larghezza colonna ${title}`}
        aria-valuemin={MIN_ASSET_COLUMN_WIDTH} aria-valuemax={600} aria-valuenow={Math.round(width)}
        title={`Ridimensiona ${title} · doppio clic per ripristinare`}
        className="absolute -right-1 top-0 z-10 h-full w-2 touch-none cursor-col-resize select-none rounded-none p-0 hover:bg-primary/30 focus-visible:bg-primary/30"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          drag.current = { x: e.clientX, width, pointerId: e.pointerId };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const start = drag.current;
          if (!start || start.pointerId !== e.pointerId) return;
          onResize(Math.max(MIN_ASSET_COLUMN_WIDTH, Math.min(600, start.width + e.clientX - start.x)));
        }}
        onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={() => { drag.current = null; }}
        onDoubleClick={() => onResize(defaultWidth)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            onResize(Math.max(MIN_ASSET_COLUMN_WIDTH, Math.min(600, width + (e.key === "ArrowRight" ? 16 : -16))));
          } else if (e.key === "Home") { e.preventDefault(); onResize(defaultWidth); }
        }}
      />
    </TableHead>
  );
}