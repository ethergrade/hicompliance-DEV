import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { sb, audit, CRITICALITY_LABEL } from '@/features/supply-chain/api';
import { readSupplierFile, downloadSupplierTemplate, type ParsedSupplierRow } from '@/lib/supplierExcelImport';

interface Props { open: boolean; onOpenChange: (o: boolean) => void; organizationId: string; existingNames: string[]; onImported: () => void }

const SupplierExcelImportDialog: React.FC<Props> = ({ open, onOpenChange, organizationId, existingNames, onImported }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<ParsedSupplierRow[]>([]);
  const [saving, setSaving] = useState(false);
  const valid = rows.filter(r => !r.error && !r.duplicate);

  const onFile = async (f?: File) => {
    if (!f) return;
    try { setRows(await readSupplierFile(f, existingNames)); }
    catch { toast({ title: 'File non leggibile', description: 'Usa un file Excel (.xlsx) o CSV.', variant: 'destructive' }); }
  };

  const doImport = async () => {
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await sb.from('supplier_directory')
      .insert(valid.map(r => ({ ...r.data, organization_id: organizationId, created_by: u.user?.id }))).select('id');
    setSaving(false);
    if (error) return toast({ title: 'Importazione non riuscita', description: error.code === '23505' ? 'Uno o più fornitori esistono già' : error.message, variant: 'destructive' });
    await audit(organizationId, null, 'suppliers_imported_excel', 'customer', { count: data?.length ?? 0 });
    toast({ title: 'Fornitori importati', description: `${data?.length ?? 0} fornitori aggiunti` });
    setRows([]); onOpenChange(false); onImported();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setRows([]); onOpenChange(o); }}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importa fornitori da Excel</DialogTitle>
          <DialogDescription>Scarica il modello, compilalo e caricalo. I fornitori già presenti vengono saltati.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={downloadSupplierTemplate}><Download className="h-4 w-4 mr-1" />Scarica modello</Button>
          <Input type="file" accept=".xlsx,.xls,.csv" className="max-w-xs" onChange={e => onFile(e.target.files?.[0])} />
        </div>
        {rows.length > 0 && (
          <>
            <div className="flex gap-2 text-sm">
              <Badge>{valid.length} da importare</Badge>
              <Badge variant="secondary">{rows.filter(r => r.duplicate).length} già presenti</Badge>
              <Badge variant="destructive">{rows.filter(r => r.error).length} con errori</Badge>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Riga</TableHead><TableHead>Fornitore</TableHead><TableHead>Servizio</TableHead><TableHead>Criticità</TableHead><TableHead>Email</TableHead><TableHead>Esito</TableHead></TableRow></TableHeader>
                <TableBody>
                  {rows.map(r => (
                    <TableRow key={r.row}>
                      <TableCell>{r.row}</TableCell>
                      <TableCell className="font-medium">{r.data.supplier_name || '—'}</TableCell>
                      <TableCell className="text-sm">{r.data.service_type ?? r.data.category ?? '—'}</TableCell>
                      <TableCell>{CRITICALITY_LABEL[r.data.criticality]}</TableCell>
                      <TableCell className="text-sm">{r.data.email ?? '—'}</TableCell>
                      <TableCell className="text-sm">{r.error ? <span className="text-destructive">{r.error}</span> : r.duplicate ? 'Già presente' : 'OK'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button disabled={!valid.length || saving} onClick={doImport}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Importa {valid.length || ''} fornitori</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SupplierExcelImportDialog;
