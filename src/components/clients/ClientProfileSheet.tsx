import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Loader2, Check, CloudOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { BUSINESS_SECTORS, NIS2_LABELS, type NIS2Classification } from '@/types/organization';

interface ClientProfileSheetProps {
  organizationId: string | null;
  organizationName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ProfileFormData {
  legal_name: string;
  vat_number: string;
  fiscal_code: string;
  pec: string;
  phone: string;
  email: string;
  business_sector: string;
  nis2_classification: NIS2Classification | '';
}

const INITIAL: ProfileFormData = {
  legal_name: '', vat_number: '', fiscal_code: '', pec: '',
  phone: '', email: '', business_sector: '', nis2_classification: '',
};

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const ClientProfileSheet: React.FC<ClientProfileSheetProps> = ({
  organizationId, organizationName, open, onOpenChange,
}) => {
  const [form, setForm] = useState<ProfileFormData>(INITIAL);
  const [loading, setLoading] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const saveTimeout = useRef<NodeJS.Timeout | null>(null);
  const formRef = useRef(form);
  const profileIdRef = useRef(profileId);
  formRef.current = form;
  profileIdRef.current = profileId;

  useEffect(() => {
    if (open && organizationId) fetchProfile();
    if (!open) { setForm(INITIAL); setProfileId(null); setSaveStatus('idle'); }
    return () => { if (saveTimeout.current) clearTimeout(saveTimeout.current); };
  }, [open, organizationId]);

  const fetchProfile = async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('organization_profiles')
        .select('*')
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setProfileId(data.id);
        setForm({
          legal_name: data.legal_name || '', vat_number: data.vat_number || '',
          fiscal_code: data.fiscal_code || '', pec: data.pec || '',
          phone: data.phone || '', email: data.email || '',
          business_sector: data.business_sector || '',
          nis2_classification: (data.nis2_classification as NIS2Classification) || '',
        });
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const saveProfile = useCallback(async () => {
    if (!organizationId) return;
    setSaveStatus('saving');
    try {
      const f = formRef.current;
      const payload = {
        organization_id: organizationId,
        legal_name: f.legal_name || null, vat_number: f.vat_number || null,
        fiscal_code: f.fiscal_code || null, pec: f.pec || null,
        phone: f.phone || null, email: f.email || null,
        business_sector: f.business_sector || null,
        nis2_classification: f.nis2_classification || null,
      };
      let error;
      if (profileIdRef.current) {
        ({ error } = await supabase.from('organization_profiles').update(payload).eq('id', profileIdRef.current));
      } else {
        const res = await supabase.from('organization_profiles').insert(payload).select('id').single();
        error = res.error;
        if (res.data) setProfileId(res.data.id);
      }
      if (error) throw error;
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
    }
  }, [organizationId]);

  const updateField = (field: keyof ProfileFormData, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setSaveStatus('idle');
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => saveProfile(), 1500);
  };

  const statusBadge = () => {
    switch (saveStatus) {
      case 'saving': return <Badge variant="outline" className="text-xs gap-1"><Loader2 className="w-3 h-3 animate-spin" />Salvando...</Badge>;
      case 'saved': return <Badge variant="outline" className="text-xs gap-1 border-green-500/30 text-green-500"><Check className="w-3 h-3" />Salvato</Badge>;
      case 'error': return <Badge variant="outline" className="text-xs gap-1 border-destructive/30 text-destructive"><CloudOff className="w-3 h-3" />Errore</Badge>;
      default: return null;
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <SheetTitle>Anagrafica{organizationName ? ` — ${organizationName}` : ''}</SheetTitle>
            {statusBadge()}
          </div>
          <SheetDescription>Le modifiche vengono salvate automaticamente</SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScrollArea className="h-[calc(100vh-10rem)] pr-4 mt-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Ragione Sociale</Label>
                <Input value={form.legal_name} onChange={e => updateField('legal_name', e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Partita IVA</Label>
                  <Input value={form.vat_number} onChange={e => updateField('vat_number', e.target.value)} placeholder="11 cifre" />
                </div>
                <div className="space-y-2">
                  <Label>Codice Fiscale</Label>
                  <Input value={form.fiscal_code} onChange={e => updateField('fiscal_code', e.target.value)} />
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>PEC</Label>
                <Input type="email" value={form.pec} onChange={e => updateField('pec', e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Telefono</Label>
                  <Input value={form.phone} onChange={e => updateField('phone', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={form.email} onChange={e => updateField('email', e.target.value)} />
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Settore di attività</Label>
                <Select value={form.business_sector} onValueChange={v => updateField('business_sector', v)}>
                  <SelectTrigger><SelectValue placeholder="Seleziona settore" /></SelectTrigger>
                  <SelectContent>
                    {BUSINESS_SECTORS.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label>Classificazione NIS2</Label>
                <RadioGroup value={form.nis2_classification} onValueChange={v => updateField('nis2_classification', v)}>
                  {(Object.keys(NIS2_LABELS) as NIS2Classification[]).map(key => (
                    <div key={key} className="flex items-center space-x-2">
                      <RadioGroupItem value={key} id={`nis2-${key}`} />
                      <Label htmlFor={`nis2-${key}`} className="font-normal cursor-pointer">{NIS2_LABELS[key]}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            </div>
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default ClientProfileSheet;
