import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import type { BusinessService } from '@/types/bia';

const NONE = '__none';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  contacts: Record<string, any>[];
  initial?: Partial<BusinessService> | null;
  submitLabel?: string;
  onSubmit: (values: Partial<BusinessService>) => Promise<void>;
}

export function ServiceFormDialog({ open, onOpenChange, contacts, initial, submitLabel = 'Crea e compila BIA', onSubmit }: Props) {
  const [v, setV] = useState<Partial<BusinessService>>({});
  const [hours, setHours] = useState('');
  const [peak, setPeak] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setV({ service_type: 'business', ...initial });
    setHours((initial?.operating_schedule as any)?.hours ?? '');
    setPeak(Array.isArray(initial?.peak_periods) ? initial!.peak_periods.join(', ') : ((initial?.peak_periods as any)?.note ?? ''));
    setErr(null);
  }, [open, initial]);

  const submit = async () => {
    if (!v.name?.trim()) { setErr('Il nome del servizio è obbligatorio'); return; }
    setSaving(true);
    try {
      await onSubmit({
        ...v, name: v.name.trim(),
        operating_schedule: { hours, timezone: 'Europe/Rome' },
        peak_periods: peak.split(',').map((s) => s.trim()).filter(Boolean),
      });
      onOpenChange(false);
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  };

  const contactSelect = (key: 'business_owner_contact_id' | 'it_owner_contact_id', label: string) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={(v[key] as string) ?? NONE} onValueChange={(x) => setV({ ...v, [key]: x === NONE ? null : x })}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Non assegnato</SelectItem>
          {contacts.map((c) => <SelectItem key={c.id} value={c.id}>{`${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || c.email}{c.job_title ? ` · ${c.job_title}` : ''}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial?.id ? 'Modifica servizio' : 'Nuovo servizio di business'}</DialogTitle>
          <DialogDescription>Un servizio di business è una capacità erogata a clienti o dipendenti (es. Gestione ordini), non un sistema tecnico.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="svc-name">Nome *</Label>
            <Input id="svc-name" value={v.name ?? ''} maxLength={120} onChange={(e) => setV({ ...v, name: e.target.value })} aria-invalid={!!err && !v.name} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="svc-desc">Descrizione e outcome</Label>
            <Textarea id="svc-desc" value={v.description ?? ''} maxLength={2000} onChange={(e) => setV({ ...v, description: e.target.value })} />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={v.service_type ?? 'business'} onValueChange={(x) => setV({ ...v, service_type: x as BusinessService['service_type'] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="business">Servizio di business</SelectItem>
                  <SelectItem value="internal_support">Supporto interno</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="svc-unit">Unità organizzativa</Label>
              <Input id="svc-unit" value={v.business_unit ?? ''} maxLength={120} onChange={(e) => setV({ ...v, business_unit: e.target.value })} />
            </div>
            {contactSelect('business_owner_contact_id', 'Business owner')}
            {contactSelect('it_owner_contact_id', 'IT owner (facoltativo)')}
            <div className="space-y-1.5">
              <Label htmlFor="svc-hours">Orari di operatività</Label>
              <Input id="svc-hours" placeholder="es. Lun-Ven 8-18" value={hours} maxLength={120} onChange={(e) => setHours(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="svc-peak">Periodi di picco</Label>
              <Input id="svc-peak" placeholder="es. Novembre, Natale" value={peak} maxLength={200} onChange={(e) => setPeak(e.target.value)} />
            </div>
          </div>
          {contacts.length === 0 && <p className="text-xs text-muted-foreground">Nessun contatto in rubrica: aggiungili in Incident Response → Rubrica per assegnare gli owner.</p>}
          {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={submit} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}{submitLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
