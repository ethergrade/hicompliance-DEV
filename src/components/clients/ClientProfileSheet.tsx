import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Check, CloudOff, Building2, AlertCircle, Plus, Trash2, X } from 'lucide-react';
import { tenantsApi, tenantServicesApi } from '@/lib/api';
import { parseMonitoredIpInput, parseMonitoredScopeMixedEntries } from '@/lib/ipRange';
import type { ParsedMonitoredIpInput, MonitoredIpEntryType } from '@/lib/ipRange';
import type { TenantResource, UpdateTenantRequest, TenantServiceResource, TenantDashboardExtra } from '@/types/api';
import { toast } from 'sonner';

interface ClientProfileSheetProps {
  organizationId: string | null;
  organizationName?: string;
  groupId?: string | null;
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
  primary_domain: string;
  primary_subnet: string;
  secondary_domain: string;
  secondary_subnet: string;
  revenue: string;
  employees_count: string;
  industry: string;
  customer_sectors: string[];
  implemented_technologies: string[];
  scopeEntries: ParsedMonitoredIpInput[];
  extra?: TenantDashboardExtra | null;
}

const INITIAL: ProfileFormData = {

  // ─── Revenue shorthand parser/formatter ───
// Supports: 1.5M → 1500000, 500K → 500000, 2.5B → 2500000000
const REVENUE_SUFFIXES: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 };

const parseRevenue = (v: string): number | null => {
  if (!v.trim()) return null;
  const match = v.trim().toLowerCase().match(/^([\d,.]+)\s*([kmb])?$/);
  if (!match) return Number(v) || null;
  const num = parseFloat(match[1].replace(/,/g, ''));
  const suffix = match[2];
  if (isNaN(num)) return null;
  return suffix ? num * (REVENUE_SUFFIXES[suffix] ?? 1) : num;
};

const formatRevenue = (v: number | string | null | undefined): string => {
  if (v == null || v === '') return '';
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (isNaN(n)) return String(v);
  if (n >= 1e9) return `${+(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${+(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${+(n / 1e3).toFixed(2)}K`;
  return String(n);
};

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
  nis2_classification: '',
  ciso_substitute: '',
  primary_domain: '',
  primary_subnet: '',
  secondary_domain: '',
  secondary_subnet: '',
  revenue: '',
  employees_count: '',
  industry: '',
  customer_sectors: [],
  implemented_technologies: [],
  scopeEntries: [],
  extra: null,
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
  primary_domain: data.primary_domain || '',
  primary_subnet: data.primary_subnet || '',
  secondary_domain: data.secondary_domain || '',
  secondary_subnet: data.secondary_subnet || '',
  revenue: formatRevenue(data.revenue),
  employees_count: data.employees_count ?? '',
  industry: data.industry ?? '',
  customer_sectors: data.customer_sectors ?? [],
  implemented_technologies: data.implemented_technologies ?? [],
  extra: data.extra || null,
  scopeEntries: (() => {
    const domains = data.extra?.hicompliance_scope_domains || [];
    const ips = data.extra?.hicompliance_scope_ips || [];
    const domainEntries: ParsedMonitoredIpInput[] = domains.map((d) => ({
      entryType: 'domain' as MonitoredIpEntryType,
      inputValue: d,
      ipStart: '',
      ipEnd: '',
    }));
    const ipEntries: ParsedMonitoredIpInput[] = ips.map((r) => {
      const start = r.start_ip || '';
      const end = r.end_ip || start;
      const sameIp = start === end;
      return {
        entryType: (sameIp ? 'single' : 'range') as MonitoredIpEntryType,
        inputValue: sameIp ? start : `${start}-${end}`,
        ipStart: start,
        ipEnd: end,
      };
    });
    return [...domainEntries, ...ipEntries];
  })(),
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
  // business_sector is not a backend field; map it to industry as fallback
  industry: data.industry || data.business_sector || null,
  nis2_classification: data.nis2_classification as any || null,
  ciso_substitute: data.ciso_substitute || null,
  primary_domain: data.primary_domain || null,
  primary_subnet: data.primary_subnet || null,
  secondary_domain: data.secondary_domain || null,
  secondary_subnet: data.secondary_subnet || null,
  revenue: parseRevenue(data.revenue),
  employees_count: data.employees_count ? parseInt(data.employees_count, 10) || null : null,
  customer_sectors: data.customer_sectors,
  implemented_technologies: data.implemented_technologies,
  extra: {
    ...(data.extra || {}),
    hicompliance_scope_domains: data.scopeEntries
      .filter((e) => e.entryType === 'domain' && e.inputValue.trim())
      .map((e) => e.inputValue.trim()),
    hicompliance_scope_ips: data.scopeEntries
      .filter((e) => e.entryType !== 'domain' && (e.ipStart || e.inputValue).trim())
      .map((e) => {
        const start = e.ipStart || e.inputValue.split('-')[0].trim();
        const end = e.ipEnd || start;
        return { start_ip: start, end_ip: end };
      }),
  } as TenantDashboardExtra,
});

const NIS2_OPTIONS = [
  { value: 'soggetto_essenziale', label: 'Soggetto Essenziale' },
  { value: 'soggetto_importante', label: 'Soggetto Importante' },
  { value: 'nessuna', label: 'Nessuna' },
];

const ClientProfileSheet: React.FC<ClientProfileSheetProps> = ({
  organizationId,
  organizationName,
  groupId,
  open,
  onOpenChange,
}) => {
  const [form, setForm] = useState<ProfileFormData>(INITIAL);
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [tenantServices, setTenantServices] = useState<TenantServiceResource[]>([]);
  const [newScopeInput, setNewScopeInput] = useState('');
  const [scopeSaving, setScopeSaving] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const validate = (data: ProfileFormData): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!data.vat_number.trim()) errs.vat_number = 'P.IVA obbligatoria';
    if (!data.nis2_classification) errs.nis2_classification = 'Classificazione NIS2 obbligatoria';
    return errs;
  };

  // Fetch data when sheet opens
  useEffect(() => {
    if (!open || !organizationId) return;

    let cancelled = false;
    setLoading(true);
    setSaveStatus('idle');
    setForm(INITIAL);

    Promise.all([
      tenantsApi.get(organizationId).catch(() => null),
      groupId ? tenantServicesApi.listByOrganization(organizationId, groupId).catch(() => [] as TenantServiceResource[]) : Promise.resolve([] as TenantServiceResource[]),
    ]).then(([tenant, services]) => {
      if (!cancelled) {
        if (tenant) setForm(resourceToForm(tenant));
        else setSaveStatus('error');
        setTenantServices(services);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [open, organizationId, groupId]);

  // Auto-save with debounce
  const scheduleSave = useCallback(
    (data: ProfileFormData) => {
      if (!organizationId) return;

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      saveTimerRef.current = setTimeout(async () => {
        const errs = validate(data);
        setFieldErrors(errs);
        if (Object.keys(errs).length > 0) {
          setSaveStatus('error');
          return;
        }
        setSaveStatus('saving');
        try {
          await tenantsApi.update(organizationId, formToPayload(data));
          setFieldErrors({});
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

  const updateListField = (field: 'customer_sectors' | 'implemented_technologies', values: string[]) => {
    setForm((prev) => {
      const next = { ...prev, [field]: values };
      scheduleSave(next);
      return next;
    });
  };

  const handleAddScopeEntries = () => {
    const raw = newScopeInput.trim();
    if (!raw) {
      toast.error('Inserisci almeno un dominio/IP/range/CIDR');
      return;
    }
    const tokens = parseMonitoredScopeMixedEntries(raw);
    if (tokens.length === 0) return;
    const parsed: ParsedMonitoredIpInput[] = [];
    const failed: string[] = [];
    for (const t of tokens) {
      try {
        parsed.push(parseMonitoredIpInput(t));
      } catch (err) {
        failed.push(t);
      }
    }
    if (parsed.length === 0) {
      toast.error('Nessuna entry valida');
      return;
    }
    setForm((prev) => {
      const next = { ...prev, scopeEntries: [...prev.scopeEntries, ...parsed] };
      scheduleSave(next);
      return next;
    });
    setNewScopeInput('');
    if (failed.length > 0) {
      toast.warning(`Aggiunti ${parsed.length}, ignorati ${failed.length} non validi`);
    } else {
      toast.success(`${parsed.length} ${parsed.length === 1 ? 'regola aggiunta' : 'regole aggiunte'}`);
    }
  };

  const handleRemoveScopeEntry = (index: number) => {
    setForm((prev) => {
      const next = { ...prev, scopeEntries: prev.scopeEntries.filter((_, i) => i !== index) };
      scheduleSave(next);
      return next;
    });
  };

  const handleManualSave = async () => {
    if (!organizationId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    const errs = validate(form);
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) {
      setSaveStatus('error');
      return;
    }

    setSaveStatus('saving');
    try {
      await tenantsApi.update(organizationId, formToPayload(form));
      setFieldErrors({});
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
    }
  };

  const renderField = (
    field: keyof ProfileFormData,
    label: string,
    placeholder?: string,
    required?: boolean,
  ) => {
    const error = fieldErrors[field];
    return (
      <div className="space-y-1.5">
        <Label htmlFor={`profile-${field}`} className="text-xs text-muted-foreground">
          {label}{required && <span className="text-destructive ml-0.5">*</span>}
        </Label>
        <Input
          id={`profile-${field}`}
          value={form[field] ?? ''}
          onChange={(e) => updateField(field, e.target.value)}
          placeholder={placeholder}
          className={`h-9 ${error ? 'border-destructive focus-visible:ring-destructive' : ''}`}
        />
        {error && (
          <p className="text-xs text-destructive flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />{error}
          </p>
        )}
      </div>
    );
  };

  const hicomplianceService = tenantServices.find(
    (s) => s.service_type === 'hicompliance' && (s.status === 'active' || !s.status)
  );
  const showNetworkFields = !!hicomplianceService;
  const isExtendedLicense = hicomplianceService?.settings?.license === 'extended';

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
              <span className="text-destructive">
                {Object.keys(fieldErrors).length > 0
                  ? 'Compila i campi obbligatori'
                  : 'Errore salvataggio'}
              </span>
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
                    {renderField('vat_number', 'Partita IVA', 'IT12345678901', true)}
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
                      Classificazione NIS2<span className="text-destructive ml-0.5">*</span>
                    </Label>
                    <Select
                      value={form.nis2_classification || ''}
                      onValueChange={(v) => updateField('nis2_classification', v)}
                    >
                      <SelectTrigger
                        id="profile-nis2"
                        className={`h-9 ${fieldErrors.nis2_classification ? 'border-destructive' : ''}`}
                      >
                        <SelectValue placeholder="Seleziona classificazione…" />
                      </SelectTrigger>
                      <SelectContent>
                        {NIS2_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fieldErrors.nis2_classification && (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />{fieldErrors.nis2_classification}
                      </p>
                    )}
                  </div>

                  {renderField('ciso_substitute', 'CISO Sostituto')}
                </div>
              </div>

              <Separator />

              {/* Settore, dimensione e tecnologie */}
              <div>
                <h4 className="text-sm font-semibold mb-3">Settore, Dimensione e Tecnologie</h4>
                <div className="grid grid-cols-1 gap-3">
                  {renderField('industry', 'Settore (Industry)')}
                  <div className="grid grid-cols-2 gap-3">
                    {renderField('revenue', 'Fatturato', 'es. 1.5M')}
                    {renderField('employees_count', 'N. Dipendenti', 'es. 50')}
                  </div>
                  <StringListField
                    label="Settori Clientela (customer_sectors)"
                    values={form.customer_sectors}
                    onChange={(v) => updateListField('customer_sectors', v)}
                    placeholder="es. Finance"
                  />
                  <StringListField
                    label="Tecnologie Implementate (implemented_technologies)"
                    values={form.implemented_technologies}
                    onChange={(v) => updateListField('implemented_technologies', v)}
                    placeholder="es. Microsoft 365"
                  />
                </div>
              </div>

              {showNetworkFields && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-sm font-semibold mb-3">Rete</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {renderField('primary_domain', 'Dominio Primario')}
                      {renderField('primary_subnet', 'Subnet Primaria')}
                      {renderField('secondary_domain', 'Dominio Secondario')}
                      {renderField('secondary_subnet', 'Subnet Secondaria')}
                    </div>

                    {isExtendedLicense && (
                      <div className="mt-4 space-y-3">
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Domini aggiuntivi
                        </Label>
                        <div className="flex flex-col md:flex-row gap-2">
                          <Input
                            placeholder="Es. panapesca.it, 203.0.113.10, 203.0.113.10-203.0.113.20, 203.0.113.0/24"
                            value={newScopeInput}
                            onChange={(e) => setNewScopeInput(e.target.value)}
                            disabled={scopeSaving}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddScopeEntries();
                              }
                            }}
                          />
                          <Button
                            onClick={handleAddScopeEntries}
                            disabled={scopeSaving || !newScopeInput.trim()}
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            Aggiungi
                          </Button>
                        </div>
                        <div className="rounded-lg border border-border">
                          <div className="px-3 py-2 border-b border-border bg-muted/30 text-xs text-muted-foreground">
                            Regole attive: {form.scopeEntries.length}
                          </div>
                          {form.scopeEntries.length === 0 ? (
                            <div className="p-4 text-sm text-muted-foreground">
                              Nessuna regola configurata.
                            </div>
                          ) : (
                            <div className="divide-y divide-border">
                              {form.scopeEntries.map((entry, idx) => (
                                <div key={`${entry.entryType}-${entry.inputValue}-${idx}`} className="flex items-center justify-between px-3 py-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <Badge variant="outline" className="uppercase shrink-0">
                                      {entry.entryType}
                                    </Badge>
                                    <span className="text-sm font-medium truncate">{entry.inputValue}</span>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive shrink-0"
                                    onClick={() => handleRemoveScopeEntry(idx)}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

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

// ─── StringListField: chip input per liste di stringhe (customer_sectors, implemented_technologies) ───
interface StringListFieldProps {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}
const StringListField: React.FC<StringListFieldProps> = ({ label, values, onChange, placeholder }) => {
  const [draft, setDraft] = React.useState('');
  const add = () => {
    const v = draft.trim();
    if (!v || values.includes(v)) return;
    onChange([...values, v]);
    setDraft('');
  };
  const remove = (idx: number) => {
    onChange(values.filter((_, i) => i !== idx));
  };
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="h-9"
        />
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {values.map((v, idx) => (
            <Badge key={`${v}-${idx}`} variant="secondary" className="gap-1 pr-1">
              {v}
              <button
                type="button"
                onClick={() => remove(idx)}
                className="ml-0.5 hover:text-destructive"
                aria-label={`Rimuovi ${v}`}
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
};
