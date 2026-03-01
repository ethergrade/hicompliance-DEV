import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ConsistenzeAreaTable } from './ConsistenzeAreaTable';
import type { ConsistenzeCliente, ConsistenzeItem, ConsistenzeArea } from '@/types/consistenze';
import { AREA_LABELS } from '@/types/consistenze';

interface Props {
  area: ConsistenzeArea;
  cliente: ConsistenzeCliente | null;
  items: ConsistenzeItem[];
  onUpdateCliente: (field: string, value: any) => void;
  onAddItem: () => void;
  onUpdateItem: (id: string, updates: Partial<ConsistenzeItem>) => void;
  onDeleteItem: (id: string) => void;
}

// Which general fields each area shows
const AREA_GENERAL_FIELDS: Record<ConsistenzeArea, string[]> = {
  UCC: ['nr_sedi', 'nr_canali_fonia', 'nr_interni_telefonici', 'descrizione_telefoni'],
  SECURITY: ['nr_sedi'],
  CONN_FONIA: ['nr_sedi', 'nr_interni_telefonici', 'descrizione_telefoni'],
  NETWORKING: ['nr_sedi'],
  IT: ['nr_sedi'],
};

const FIELD_LABELS: Record<string, string> = {
  nr_sedi: 'Nr. Sedi',
  nr_canali_fonia: 'Nr. Canali Fonia',
  nr_interni_telefonici: 'Nr. Interni Telefonici',
  descrizione_telefoni: 'Descrizione Telefoni',
};

export const ConsistenzeAreaTab: React.FC<Props> = ({
  area, cliente, items, onUpdateCliente, onAddItem, onUpdateItem, onDeleteItem,
}) => {
  const fields = AREA_GENERAL_FIELDS[area];

  return (
    <div className="space-y-6">
      {/* General fields */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Dati Generali - {AREA_LABELS[area]}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {fields.map(field => (
              <div key={field}>
                <Label className="text-xs">{FIELD_LABELS[field]}</Label>
                {field === 'descrizione_telefoni' ? (
                  <Textarea
                    className="text-sm mt-1"
                    rows={2}
                    value={(cliente as any)?.[field] || ''}
                    onChange={(e) => onUpdateCliente(field, e.target.value)}
                    placeholder={FIELD_LABELS[field]}
                  />
                ) : (
                  <Input
                    className="mt-1"
                    type="number"
                    min={0}
                    value={(cliente as any)?.[field] ?? 0}
                    onChange={(e) => onUpdateCliente(field, parseInt(e.target.value) || 0)}
                  />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Dynamic table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Inventario {AREA_LABELS[area]}</CardTitle>
        </CardHeader>
        <CardContent>
          <ConsistenzeAreaTable
            area={area}
            items={items}
            onAdd={onAddItem}
            onUpdate={onUpdateItem}
            onDelete={onDeleteItem}
          />
        </CardContent>
      </Card>
    </div>
  );
};
