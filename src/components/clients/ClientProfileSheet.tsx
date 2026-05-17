import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Check, CloudOff, Building2 } from 'lucide-react';
import { tenantsApi } from '@/lib/api';
import type { TenantResource, UpdateTenantRequest } from '@/types/api';

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
  legal_address: string;
  operational_address: string;
  pec: string;
  phone: string;
  email: string;
  business_sector: string;
  nis2_classification: string;
  ciso_substitute: string;
}

const INITIAL: ProfileFormData = {
  legal_name: '',
  vat_number: '',
  fiscal_code: '',
  legal_address: '',
  operational_address: '',
  pec: '',
  phone: '',
  email: '',
  business_sector: '',
  nis2_classification: 'nessuna',
  ciso_substitute: '',
};

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const resourceToForm = (data: TenantResource): ProfileFormData => ({
  legal_name: data.legal_name || data.name || '',
  vat_number: data.vat_number || '',
  fiscal_code: data.fiscal_code || '',
  legal_address: data.legal_address || '',
  operational_address: data.operational_address || '',
  pec: data.pec || '',
  phone: data.phone || '',
  email: data.email || '',
  business_sector: data.business_sector || data.industry || '',
  nis2_classification: (data.nis2_classification as string) || 'nessuna',
  ciso_substitute: data.ciso_substitute || '',
});

const formToPayload = (data: ProfileFormData): UpdateTenantRequest => ({
  legal_name: data.legal_name || null,
  vat_number: data.vat_number || null,
  fiscal_code: data.fiscal_code || null,
  legal_address: data.legal_address || null,
  operational_address: data.operational_address || null,
  pec: data.pec || null,
  phone: data.phone || null,
  email: data.email || null,
  business_sector: data.business_sector || null,
  industry: data.business_sector || null,
  nis2_classification: data.nis2_classification as any || null,
  ciso_substitute: data.ciso_substitute || null,
});

const NIS2_OPTIONS = [
  { value: 'soggetto_essenziale', label: 'Soggetto Essenziale' },
  { value: 'soggetto_importante', label: 'Soggetto Importante' },
  { value: 'nessuna', label: 'Nessuna' },
];

const ClientProfileSheet: React.FC<ClientProfileSheetProps> = ({
  organizationId,
  organizationName,
  open,
  onOpenChange,
}) => {
  const [form, setForm] = useState<ProfileFormData>(INITIAL);
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch data when sheet opens
  useEffect(() => {
    if (!open || !organizationId) return;

    let cancelled = false;
    setLoading(true);
    setSaveStatus('idle');
    setForm(INITIAL);

    tenantsApi
      .get(organizationId)
      .then((tenant) => {
        if (!cancelled) {
          setForm(resourceToForm(tenant));
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
          setSaveStatus('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, organizationId]);

  // Auto-save with debounce
  const scheduleSave = useCallback(
    (data: ProfileFormData) => {
      if (!organizationId) return;

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      saveTimerRef.current = setTimeout(async () => {
        setSaveStatus('saving');
        try {
          await tenantsApi.update(organizationId, formToPayload(data));
          setSaveStatus('saved');
          setTimeout(() => setSaveStatus('idle'), 2000);
        } catch {
          setSaveStatus('error');
        }
      }, 800);
    },
    [organizationId],
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const updateField = (field: keyof ProfileFormData, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      scheduleSave(next);
      return next;
    });
  };

  const handleManualSave = async () => {
    if (!organizationId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    setSaveStatus('saving');
    try {
      await tenantsApi.update(organizationId, formToPayload(form));
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
    }
  };

  const renderField = (field: keyof ProfileFormData, label: string, placeholder?: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`profile-${field}`} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={`profile-${field}`}
        value={form[field] ?? ''}
        onChange={(e) => updateField(field, e.target.value)}
        placeholder={placeholder}
        className="h-9"
      />
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col p-0">
        <SheetHeader className="px-6 pt-6 pb-2 border-b">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            <SheetTitle>Anagrafica Cliente</SheetTitle>
          </div>
          <SheetDescription>
            {organizationName || 'Cliente'}
          </SheetDescription>
        </SheetHeader>

        {/* Save status indicator */}
        <div className="px-6 py-2 flex items-center gap-2 text-xs border-b bg-muted/30">
          {saveStatus === 'saving' && (
            <>
              <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
              <span className="text-muted-foreground">Salvataggio in corso...</span>
            </>
          )}
          {saveStatus === 'saved' && (
            <>
              <Check className="w-3 h-3 text-green-500" />
              <span className="text-green-600">Salvato</span>
            </>
          )}
          {saveStatus === 'error' && (
            <>
              <CloudOff className="w-3 h-3 text-destructive" />
              <span className="text-destructive">Errore salvataggio</span>
            </>
          )}
          {saveStatus === 'idle' && (
            <span className="text-muted-foreground">Modifiche salvate automaticamente</span>
          )}
        </div>

        <ScrollArea className="flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="px-6 py-4 space-y-6">
              {/* Dati anagrafici */}
              <div>
                <h4 className="text-sm font-semibold mb-3">Dati Anagrafici</h4>
                <div className="grid grid-cols-1 gap-3">
                  {renderField('legal_name', 'Ragione Sociale *')}
                  <div className="grid grid-cols-2 gap-3">
                    {renderField('vat_number', 'Partita IVA')}
                    {renderField('fiscal_code', 'Codice Fiscale')}
                  </div>
                  {renderField('legal_address', 'Sede Legale')}
                  {renderField('operational_address', 'Sede Operativa')}
                </div>
              </div>

              <Separator />

              {/* Contatti */}
              <div>
                <h4 className="text-sm font-semibold mb-3">Contatti</h4>
                <div className="grid grid-cols-2 gap-3">
                  {renderField('pec', 'PEC')}
                  {renderField('phone', 'Telefono')}
                </div>
                <div className="mt-3">{renderField('email', 'Email')}</div>
              </div>

              <Separator />

              {/* Classificazione */}
              <div>
                <h4 className="text-sm font-semibold mb-3">Classificazione</h4>
                <div className="grid grid-cols-1 gap-3">
                  {renderField('business_sector', 'Settore Merceologico')}

                  <div className="space-y-1.5">
                    <Label htmlFor="profile-nis2" className="text-xs text-muted-foreground">
                      Classificazione NIS2
                    </Label>
                    <Select
                      value={form.nis2_classification || 'nessuna'}
                      onValueChange={(v) => updateField('nis2_classification', v)}
                    >
                      <SelectTrigger id="profile-nis2" className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {NIS2_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {renderField('ciso_substitute', 'CISO Sostituto')}
                </div>
              </div>

              {/* Manual save button */}
              <div className="pt-2 pb-4">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={handleManualSave}
                  disabled={saveStatus === 'saving'}
                >
                  {saveStatus === 'saving' ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    'Salva ora'
                  )}
                </Button>
              </div>
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

export default ClientProfileSheet;
