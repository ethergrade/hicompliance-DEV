import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import type { ConsistenzeItem, ConsistenzeArea } from '@/types/consistenze';
import { AREA_CATEGORIES, AREA_EXTRA_COLUMNS } from '@/types/consistenze';

interface Props {
  area: ConsistenzeArea;
  items: ConsistenzeItem[];
  onAdd: () => void;
  onUpdate: (id: string, updates: Partial<ConsistenzeItem>) => void;
  onDelete: (id: string) => void;
}

export const ConsistenzeAreaTable: React.FC<Props> = ({ area, items, onAdd, onUpdate, onDelete }) => {
  const categories = AREA_CATEGORIES[area];
  const extraCols = AREA_EXTRA_COLUMNS[area];

  const handleMetricChange = (item: ConsistenzeItem, key: string, value: any) => {
    const metriche = { ...(item.metriche_json || {}), [key]: value };
    onUpdate(item.id!, { metriche_json: metriche });
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-medium text-muted-foreground">
          {items.length} element{items.length !== 1 ? 'i' : 'o'}
        </h3>
        <Button size="sm" variant="outline" onClick={onAdd}>
          <Plus className="w-4 h-4 mr-1" /> Aggiungi riga
        </Button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[160px]">Categoria</TableHead>
              <TableHead>Tecnologia</TableHead>
              <TableHead>Fornitore</TableHead>
              <TableHead className="w-[90px]">Quantità</TableHead>
              <TableHead className="w-[130px]">Scadenza</TableHead>
              {extraCols.map(col => (
                <TableHead key={col.key} className="w-[110px]">{col.label}</TableHead>
              ))}
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5 + extraCols.length + 1} className="text-center text-muted-foreground py-8">
                  Nessun elemento. Clicca "Aggiungi riga" per iniziare.
                </TableCell>
              </TableRow>
            )}
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="p-1">
                  <Select
                    value={item.categoria || '__custom__'}
                    onValueChange={(v) => onUpdate(item.id!, { categoria: v === '__custom__' ? '' : v })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Seleziona..." />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                      <SelectItem value="__custom__">Altro...</SelectItem>
                    </SelectContent>
                  </Select>
                  {(item.categoria === '' || !categories.includes(item.categoria)) && item.categoria !== '' ? null : null}
                  {(!categories.includes(item.categoria) || item.categoria === '') && (
                    <Input
                      className="h-7 text-xs mt-1"
                      placeholder="Categoria personalizzata"
                      value={!categories.includes(item.categoria) ? item.categoria : ''}
                      onChange={(e) => onUpdate(item.id!, { categoria: e.target.value })}
                    />
                  )}
                </TableCell>
                <TableCell className="p-1">
                  <Input
                    className="h-8 text-xs"
                    value={item.tecnologia}
                    onChange={(e) => onUpdate(item.id!, { tecnologia: e.target.value })}
                    placeholder="Tecnologia"
                  />
                </TableCell>
                <TableCell className="p-1">
                  <Input
                    className="h-8 text-xs"
                    value={item.fornitore}
                    onChange={(e) => onUpdate(item.id!, { fornitore: e.target.value })}
                    placeholder="Fornitore"
                  />
                </TableCell>
                <TableCell className="p-1">
                  <Input
                    className="h-8 text-xs"
                    type="number"
                    min={0}
                    value={item.quantita}
                    onChange={(e) => onUpdate(item.id!, { quantita: parseInt(e.target.value) || 0 })}
                  />
                </TableCell>
                <TableCell className="p-1">
                  <Input
                    className="h-8 text-xs"
                    type="date"
                    value={item.scadenza || ''}
                    onChange={(e) => onUpdate(item.id!, { scadenza: e.target.value || null })}
                  />
                </TableCell>
                {extraCols.map(col => (
                  <TableCell key={col.key} className="p-1">
                    <Input
                      className="h-8 text-xs"
                      type={col.type}
                      value={(item.metriche_json as any)?.[col.key] ?? ''}
                      onChange={(e) => handleMetricChange(
                        item,
                        col.key,
                        col.type === 'number' ? (parseInt(e.target.value) || 0) : e.target.value
                      )}
                      placeholder={col.label}
                    />
                  </TableCell>
                ))}
                <TableCell className="p-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => onDelete(item.id!)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
