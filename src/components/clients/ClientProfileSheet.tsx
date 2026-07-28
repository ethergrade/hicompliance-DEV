import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Check,
  CloudOff,
  Building2,
  AlertCircle,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { companyProfileApi, tenantsApi, tenantServicesApi } from "@/lib/api";
import { useCompanyScope } from "@/hooks/useCompanyScope";
import {
  parseMonitoredIpInput,
  parseMonitoredScopeMixedEntries,
} from "@/lib/ipRange";
import type { ParsedMonitoredIpInput } from "@/lib/ipRange";
import type {
  CompanyProfileResource,
  TenantResource,
  UpdateCompanyProfileRequest,
  UpdateTenantRequest,
  TenantServiceResource,
  TenantDashboardExtra,
} from "@/types/api";
import { toast } from "sonner";

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

// ─── Revenue shorthand parser/formatter ───
// Supports: 1.5M → 1500000, 500K → 500000, 2.5B → 2500000000
const REVENUE_SUFFIXES: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 };

const parseRevenue = (v: string): number | null => {
  if (!v.trim()) return null;
  const match = v
    .trim()
    .toLowerCase()
    .match(/^([\d,.]+)\s*([kmb])?$/);
  if (!match) return Number(v) || null;
  const num = parseFloat(match[1].replace(/,/g, ""));
  const suffix = match[2];
  if (isNaN(num)) return null;
  return suffix ? num * (REVENUE_SUFFIXES[suffix] ?? 1) : num;
};

const formatRevenue = (v: number | string | null | undefined): string => {
  if (v == null || v === "") return "";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return String(v);
  if (n >= 1e9) return `${+(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${+(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${+(n / 1e3).toFixed(2)}K`;
  return String(n);
};

const INITIAL: ProfileFormData = {
  legal_name: "",
  vat_number: "",
  fiscal_code: "",
  legal_address: "",
  operational_address: "",
  pec: "",
  phone: "",
  email: "",
  business_sector: "",
  nis2_classification: "",
  ciso_substitute: "",
  primary_domain: "",
  primary_subnet: "",
  secondary_domain: "",
  secondary_subnet: "",
  revenue: "",
  employees_count: "",
  industry: "",
  customer_sectors: [],
  implemented_technologies: [],
  scopeEntries: [],
  extra: null,
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Il form unisce due risorse: i campi tecnici stanno su `tenants`, mentre
 * ragione sociale, codice fiscale, sedi, PEC, email e sostituto CISO vivono su
 * `company_profiles` e arrivano da GET /companies/{id}/profile. Il tenant non
 * li restituisce: leggerli da lì lasciava i campi sempre vuoti.
 */
const resourceToForm = (
  data: TenantResource,
  profile: CompanyProfileResource | null,
): ProfileFormData => ({
  legal_name: profile?.legal_name || data.name || "",
  vat_number: data.vat_number || profile?.vat_number || "",
  fiscal_code: profile?.fiscal_code || "",
  legal_address: profile?.legal_address || "",
  operational_address: profile?.operational_address || "",
  pec: profile?.pec || "",
  phone: data.phone || profile?.phone || "",
  email: profile?.email || "",
  business_sector: data.industry || profile?.business_sector || "",
  nis2_classification: (data.nis2_classification as string) || "nessuna",
  ciso_substitute: profile?.ciso_substitute || "",
  primary_domain: data.primary_domain || "",
  primary_subnet: data.primary_subnet || "",
  secondary_domain: data.secondary_domain || "",
  secondary_subnet: data.secondary_subnet || "",
  revenue: (() => {
    // Se è giá una stringa-label (es. "meno di €1M" o un vecchio shorthand "1.5M"),
    // mostriamo direttamente; altrimenti mappiamo dal numeric value salvato.
    const asNum =
      typeof data.revenue === "number"
        ? data.revenue
        : parseFloat(data.revenue as any);
    if (!isNaN(asNum) && asNum > 0) {
      const m = findRevenueByNumeric(asNum);
      if (m) return m.label;
    }
    return formatRevenue(data.revenue);
  })(),
  employees_count: (() => {
    const asNum =
      typeof data.employees_count === "number"
        ? data.employees_count
        : parseInt(data.employees_count as any, 10);
    if (!isNaN(asNum) && asNum > 0) {
      const m = findEmployeesByNumeric(asNum);
      if (m) return m.label;
    }
    return data.employees_count ?? "";
  })(),
  industry: data.industry ?? "",
  customer_sectors: data.customer_sectors ?? [],
  implemented_technologies: data.implemented_technologies ?? [],
  extra: data.extra || null,
  // Lo scope esteso è ora gestito dall'endpoint dedicato /companies/{id}/scope
  // (hook useCompanyScope), non più da extra.hicompliance_scope_*.
  scopeEntries: [],
});

/**
 * Campi anagrafici estesi: hanno il loro endpoint e la loro tabella.
 *
 * `nis2_classification` non viene inviato qui di proposito — il profilo accetta
 * solo none|essential|important, mentre il form usa il vocabolario italiano che
 * il tenant memorizza già. Duplicarlo su due tabelle con due vocabolari diversi
 * significherebbe avere due verità.
 */
const formToProfilePayload = (data: ProfileFormData): UpdateCompanyProfileRequest => ({
  legal_name: data.legal_name || null,
  fiscal_code: data.fiscal_code || null,
  legal_address: data.legal_address || null,
  operational_address: data.operational_address || null,
  pec: data.pec || null,
  email: data.email || null,
  ciso_substitute: data.ciso_substitute || null,
});

const formToPayload = (data: ProfileFormData): UpdateTenantRequest => ({
  vat_number: data.vat_number || null,
  phone: data.phone || null,
  // business_sector is not a backend field; map it to industry as fallback
  industry: data.industry || data.business_sector || null,
  nis2_classification: (data.nis2_classification as any) || null,
  primary_domain: data.primary_domain || null,
  primary_subnet: data.primary_subnet || null,
  secondary_domain: data.secondary_domain || null,
  secondary_subnet: data.secondary_subnet || null,
  // revenue è un chip-label nel form; al submit inviamo il numericValue associato
  // (oppure null se il chip è stato deselezionato / il valore non è riconoscibile)
  revenue: (() => {
    const m = findRevenueByLabel(data.revenue);
    if (m) return m.numericValue;
    // fallback: se il valore è ancora un numeric (record legacy) o shorthand, parsalo
    const parsed = parseRevenue(data.revenue);
    return parsed;
  })(),
  employees_count: (() => {
    const m = findEmployeesByLabel(data.employees_count);
    if (m) return m.numericValue;
    // fallback per valori legacy o numerici diretti
    const s = (data.employees_count ?? "").toString().trim();
    if (!s) return null;
    const n = parseInt(s, 10);
    return isNaN(n) ? null : n;
  })(),
  customer_sectors: data.customer_sectors,
  implemented_technologies: data.implemented_technologies,
  // extra.hicompliance_scope_* NON viene più scritto qui: lo scope esteso è
  // gestito dall'endpoint dedicato /scope. Il salvataggio anagrafica non deve
  // toccare le entry (altrimenti le cancellerebbe).
  extra: (data.extra || undefined) as TenantDashboardExtra | undefined,
});

const NIS2_OPTIONS = [
  { value: "soggetto_essenziale", label: "Soggetto Essenziale" },
  { value: "soggetto_importante", label: "Soggetto Importante" },
  { value: "nessuna", label: "Nessuna" },
];

// ─── Anagrafica chip-based catalog (matches backend hiconsole anagrafica form) ───
// Fatturato (revenue) — chip con range. Il backend valida `numeric`, quindi al submit
// inviamo il valore numerico rappresentativo del bucket, non la stringa-label.
const REVENUE_OPTIONS: {
  value: string;
  label: string;
  numericValue: number | null;
}[] = [
  { value: "lt_1m", label: "meno di €1M", numericValue: 1000000 },
  { value: "1m_5m", label: "€1M - €5M", numericValue: 3000000 },
  { value: "5m_10m", label: "€5M - €10M", numericValue: 7000000 },
  { value: "gt_10m", label: "più di €10M", numericValue: 10000000 },
];

// Numero dipendenti — chip con range. Backend valida `integer`.
const EMPLOYEES_OPTIONS: {
  value: string;
  label: string;
  numericValue: number | null;
}[] = [
  { value: "1_10", label: "1-10", numericValue: 5 },
  { value: "11_50", label: "11-50", numericValue: 30 },
  { value: "51_100", label: "51-100", numericValue: 75 },
  { value: "gt_100", label: "più di 100", numericValue: 100 },
];

// Settore principale dove opera l'azienda (industry) — chip singolo selezionabile
const INDUSTRY_OPTIONS: { value: string; label: string }[] = [
  { value: "Finance", label: "Finance" },
  {
    value: "Fabbricazione, Manufacturing",
    label: "Fabbricazione, Manufacturing",
  },
  { value: "Servizi di consulenza", label: "Servizi di consulenza" },
  { value: "Energia", label: "Energia" },
  { value: "Trasporti e Logistica", label: "Trasporti e Logistica" },
  { value: "Salute", label: "Salute" },
  { value: "Acqua potabile", label: "Acqua potabile" },
  { value: "Acque reflue", label: "Acque reflue" },
  { value: "Infrastrutture digitali", label: "Infrastrutture digitali" },
  { value: "Gestione dei Servizi TIC", label: "Gestione dei Servizi TIC" },
  { value: "Spazio", label: "Spazio" },
  {
    value: "Servizi postali e di corriere",
    label: "Servizi postali e di corriere",
  },
  { value: "Gestione dei rifiuti", label: "Gestione dei rifiuti" },
  {
    value: "Fab, pr, dis, di sost. chimiche",
    label: "Fab, pr, dis, di sost. chimiche",
  },
  {
    value: "Prod, tras, e dis. di alimenti",
    label: "Prod, tras, e dis. di alimenti",
  },
  {
    value: "Fornitori di servizi digitali",
    label: "Fornitori di servizi digitali",
  },
  { value: "Ricerca", label: "Ricerca" },
  { value: "Altro", label: "Altro" },
];

// Quali tecnologie hai implementato nella tua azienda (implemented_technologies) — multi
const TECHNOLOGY_OPTIONS: { value: string; label: string }[] = [
  { value: "XDR", label: "XDR" },
  {
    value: "Managed Detection Response o SOC",
    label: "Managed Detection Response o SOC",
  },
  {
    value: "Firewall con protezione ZeroDay - Ransomware",
    label: "Firewall con protezione ZeroDay - Ransomware",
  },
  { value: "Mobile Device Management", label: "Mobile Device Management" },
  { value: "Log Management", label: "Log Management" },
  {
    value: "Vulnerability Assessment Continuo",
    label: "Vulnerability Assessment Continuo",
  },
  { value: "Patch Management Continuo", label: "Patch Management Continuo" },
  {
    value: "Network Monitoring (Sicurezza e disponibilità)",
    label: "Network Monitoring (Sicurezza e disponibilità)",
  },
  { value: "MFA", label: "MFA" },
];

// Helpers to map between display label ↔ backend value (the code/keyword).
// The form stores the LABEL (visible chip text) so it matches the backend anagrafica UX.
const findRevenueByLabel = (label: string) =>
  REVENUE_OPTIONS.find((o) => o.label === label);
const findRevenueByNumeric = (n: number | string | null | undefined) => {
  if (n == null) return undefined;
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(num)) return undefined;
  return REVENUE_OPTIONS.find((o) => o.numericValue === num);
};
const findEmployeesByLabel = (label: string) =>
  EMPLOYEES_OPTIONS.find((o) => o.label === label);
const findEmployeesByNumeric = (n: number | string | null | undefined) => {
  if (n == null) return undefined;
  const num = typeof n === "string" ? parseInt(n, 10) : n;
  if (isNaN(num)) return undefined;
  return EMPLOYEES_OPTIONS.find((o) => o.numericValue === num);
};

// ─── ChipSelect component (single or multi) ───
interface ChipSelectProps {
  label: string;
  options: { value: string; label: string }[];
  value: string | string[];
  onChange: (v: string | string[]) => void;
  multi?: boolean;
  error?: string;
}

const ChipSelect: React.FC<ChipSelectProps> = ({
  label,
  options,
  value,
  onChange,
  multi,
  error,
}) => {
  const selected = multi
    ? Array.isArray(value)
      ? value
      : []
    : typeof value === "string"
      ? [value]
      : [];

  const toggle = (optLabel: string) => {
    if (multi) {
      const next = selected.includes(optLabel)
        ? selected.filter((v) => v !== optLabel)
        : [...selected, optLabel];
      onChange(next);
    } else {
      // single: click again to deselect
      onChange(selected.includes(optLabel) ? "" : optLabel);
    }
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          // Match by label (not by code/value) so the form state matches
          // the human-readable text on the chip and the backend mappers work.
          const isSelected = selected.includes(opt.label);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.label)}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                isSelected
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {error && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          {error}
        </p>
      )}
    </div>
  );
};

const ClientProfileSheet: React.FC<ClientProfileSheetProps> = ({
  organizationId,
  organizationName,
  groupId,
  open,
  onOpenChange,
}) => {
  const [form, setForm] = useState<ProfileFormData>(INITIAL);
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [tenantServices, setTenantServices] = useState<TenantServiceResource[]>(
    [],
  );
  const [newScopeInput, setNewScopeInput] = useState("");
  // Scope esteso dichiarato via endpoint dedicato /companies/{id}/scope (SSOT).
  const {
    entries: scopeEntries,
    addEntry: addScopeEntry,
    removeEntry: removeScopeEntry,
    saving: scopeSaving,
  } = useCompanyScope(organizationId, groupId);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const validate = (data: ProfileFormData): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!data.vat_number.trim()) errs.vat_number = "P.IVA obbligatoria";
    if (!data.nis2_classification)
      errs.nis2_classification = "Classificazione NIS2 obbligatoria";
    return errs;
  };

  // Fetch data when sheet opens
  useEffect(() => {
    if (!open || !organizationId) return;

    let cancelled = false;
    setLoading(true);
    setSaveStatus("idle");
    setForm(INITIAL);

    Promise.all([
      tenantsApi.get(organizationId, groupId ?? undefined).catch(() => null),
      groupId
        ? tenantServicesApi
            .listByOrganization(organizationId, groupId)
            .catch(() => [] as TenantServiceResource[])
        : Promise.resolve([] as TenantServiceResource[]),
      // Il profilo può non esistere ancora: in quel caso l'endpoint risponde
      // con data null e i campi anagrafici restano vuoti, non è un errore.
      companyProfileApi.get(organizationId, groupId).catch(() => null),
    ]).then(([tenant, services, profile]) => {
      if (!cancelled) {
        if (tenant) setForm(resourceToForm(tenant, profile));
        else setSaveStatus("error");
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
          setSaveStatus("error");
          return;
        }
        setSaveStatus("saving");
        try {
          // Due risorse distinte, quindi due chiamate. In parallelo: sono
          // indipendenti e un fallimento dell'una non invalida l'altra.
          await Promise.all([
            tenantsApi.update(organizationId, formToPayload(data), groupId || ""),
            companyProfileApi.update(
              organizationId,
              formToProfilePayload(data),
              groupId || "",
            ),
          ]);
          setFieldErrors({});
          setSaveStatus("saved");
          setTimeout(() => setSaveStatus("idle"), 2000);
        } catch (err: any) {
          // Log dettagliato per diagnostica (vedi errore salvataggio anagrafica)
          // eslint-disable-next-line no-console
          console.error("[ClientProfileSheet] save failed", {
            status: err?.response?.status,
            data: err?.response?.data,
            message: err?.message,
            payload: formToPayload(data),
          });
          setSaveStatus("error");
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
    // Trello #59: drop the per-field error as soon as the user types a
    // non-empty value, so the red "Compila i campi obbligatori" banner
    // does not keep showing after the field has been fixed.
    if (field === "vat_number" && value.trim()) {
      setFieldErrors((prev) => {
        if (!prev.vat_number) return prev;
        const { vat_number: _omit, ...rest } = prev;
        return rest;
      });
    }
  };

  const updateListField = (
    field: "customer_sectors" | "implemented_technologies",
    values: string[],
  ) => {
    setForm((prev) => {
      const next = { ...prev, [field]: values };
      scheduleSave(next);
      return next;
    });
  };

  // Used by ChipSelect — single string field (industry, revenue, employees_count)
  const updateChipField = (field: keyof ProfileFormData, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      scheduleSave(next);
      return next;
    });
    // Trello #59: also clear NIS2 error as soon as the chip is picked
    if (field === "nis2_classification" && value) {
      setFieldErrors((prev) => {
        if (!prev.nis2_classification) return prev;
        const { nis2_classification: _omit, ...rest } = prev;
        return rest;
      });
    }
  };

  const handleAddScopeEntries = async () => {
    const raw = newScopeInput.trim();
    if (!raw) {
      toast.error("Inserisci almeno un dominio/IP/range/CIDR");
      return;
    }
    const tokens = parseMonitoredScopeMixedEntries(raw);
    if (tokens.length === 0) return;

    // Validazione lato client, poi persistenza via endpoint dedicato /scope.
    const valid: string[] = [];
    const failed: string[] = [];
    for (const t of tokens) {
      try {
        parseMonitoredIpInput(t);
        valid.push(t);
      } catch {
        failed.push(t);
      }
    }
    if (valid.length === 0) {
      toast.error("Nessuna entry valida");
      return;
    }

    try {
      for (const value of valid) {
        await addScopeEntry(value);
      }
      setNewScopeInput("");
      if (failed.length > 0) {
        toast.warning(
          `Aggiunti ${valid.length}, ignorati ${failed.length} non validi`,
        );
      } else {
        toast.success(
          `${valid.length} ${valid.length === 1 ? "regola aggiunta" : "regole aggiunte"}`,
        );
      }
    } catch {
      toast.error("Impossibile salvare lo scope");
    }
  };

  const handleRemoveScopeEntry = async (entryId: string) => {
    try {
      await removeScopeEntry(entryId);
    } catch {
      toast.error("Impossibile rimuovere la regola");
    }
  };

  const handleManualSave = async () => {
    if (!organizationId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    const errs = validate(form);
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) {
      setSaveStatus("error");
      return;
    }

    setSaveStatus("saving");
    try {
      await Promise.all([
        tenantsApi.update(organizationId, formToPayload(form), groupId || ""),
        companyProfileApi.update(
          organizationId,
          formToProfilePayload(form),
          groupId || "",
        ),
      ]);
      setFieldErrors({});
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error("[ClientProfileSheet] manual save failed", {
        status: err?.response?.status,
        data: err?.response?.data,
        message: err?.message,
        payload: formToPayload(form),
      });
      setSaveStatus("error");
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
        <Label
          htmlFor={`profile-${field}`}
          className="text-xs text-muted-foreground"
        >
          {label}
          {required && <span className="text-destructive ml-0.5">*</span>}
        </Label>
        <Input
          id={`profile-${field}`}
          value={form[field] ?? ""}
          onChange={(e) => updateField(field, e.target.value)}
          placeholder={placeholder}
          className={`h-9 ${error ? "border-destructive focus-visible:ring-destructive" : ""}`}
        />
        {error && (
          <p className="text-xs text-destructive flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            {error}
          </p>
        )}
      </div>
    );
  };

  const hicomplianceService = tenantServices.find(
    (s) =>
      s.service_type === "hicompliance" && (s.status === "active" || !s.status),
  );
  const surfacescanService = tenantServices.find(
    (s) => s.service_type === "surfacescan" && (s.status === "active" || !s.status),
  );
  const darkriskService = tenantServices.find(
    (s) => s.service_type === "darkrisk" && (s.status === "active" || !s.status),
  );
  // I campi di rete (domini/IP primari + scope esteso) sono lo scope condiviso
  // di HiCompliance, SurfaceScan360 e DarkRisk360: vanno mostrati se è attivo
  // uno qualsiasi dei tre, non solo HiCompliance.
  const showNetworkFields = !!(
    hicomplianceService ||
    surfacescanService ||
    darkriskService
  );
  const isExtendedLicense =
    hicomplianceService?.settings?.license === "extended" ||
    !!(surfacescanService?.settings as any)?.extended_range ||
    (darkriskService?.settings as any)?.tier === "extended";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col p-0">
        <SheetHeader className="px-6 pt-6 pb-2 border-b">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            <SheetTitle>Anagrafica Cliente</SheetTitle>
          </div>
          <SheetDescription>{organizationName || "Cliente"}</SheetDescription>
        </SheetHeader>

        {/* Save status indicator */}
        <div className="px-6 py-2 flex items-center gap-2 text-xs border-b bg-muted/30">
          {saveStatus === "saving" && (
            <>
              <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
              <span className="text-muted-foreground">
                Salvataggio in corso...
              </span>
            </>
          )}
          {saveStatus === "saved" && (
            <>
              <Check className="w-3 h-3 text-green-500" />
              <span className="text-green-600">Salvato</span>
            </>
          )}
          {saveStatus === "error" && (
            <>
              <CloudOff className="w-3 h-3 text-destructive" />
              <span className="text-destructive">
                {Object.keys(fieldErrors).length > 0
                  ? "Compila i campi obbligatori"
                  : "Errore salvataggio"}
              </span>
            </>
          )}
          {saveStatus === "idle" && (
            <span className="text-muted-foreground">
              Modifiche salvate automaticamente
            </span>
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
                  {renderField("legal_name", "Ragione Sociale *")}
                  <div className="grid grid-cols-2 gap-3">
                    {renderField(
                      "vat_number",
                      "Partita IVA",
                      "IT12345678901",
                      true,
                    )}
                    {renderField("fiscal_code", "Codice Fiscale")}
                  </div>
                  {renderField("legal_address", "Sede Legale")}
                  {renderField("operational_address", "Sede Operativa")}
                </div>
              </div>

              <Separator />

              {/* Contatti */}
              <div>
                <h4 className="text-sm font-semibold mb-3">Contatti</h4>
                <div className="grid grid-cols-2 gap-3">
                  {renderField("pec", "PEC")}
                  {renderField("phone", "Telefono")}
                </div>
                <div className="mt-3">{renderField("email", "Email")}</div>
              </div>

              <Separator />

              {/* Classificazione */}
              <div>
                <h4 className="text-sm font-semibold mb-3">Classificazione</h4>
                <div className="grid grid-cols-1 gap-3">
                  {/* Trello #69: Settore Merceologico rimosso — usa il ChipSelect "Settore principale dove opera l'azienda" (industry) con options=INDUSTRY_OPTIONS, niente testo libero */}

                  <div className="space-y-1.5">
                    <Label
                      htmlFor="profile-nis2"
                      className="text-xs text-muted-foreground"
                    >
                      Classificazione NIS2
                      <span className="text-destructive ml-0.5">*</span>
                    </Label>
                    <Select
                      value={form.nis2_classification || ""}
                      onValueChange={(v) =>
                        updateField("nis2_classification", v)
                      }
                    >
                      <SelectTrigger
                        id="profile-nis2"
                        className={`h-9 ${fieldErrors.nis2_classification ? "border-destructive" : ""}`}
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
                        <AlertCircle className="w-3 h-3" />
                        {fieldErrors.nis2_classification}
                      </p>
                    )}
                  </div>

                  {renderField("ciso_substitute", "CISO Sostituto")}
                </div>
              </div>

              <Separator />

              {/* Settore, dimensione e tecnologie */}
              <div>
                <h4 className="text-sm font-semibold mb-3">
                  Settore, Dimensione e Tecnologie
                </h4>
                <div className="grid grid-cols-1 gap-4">
                  <ChipSelect
                    label="Settore principale dove opera l'azienda"
                    options={INDUSTRY_OPTIONS}
                    value={form.industry}
                    onChange={(v) =>
                      updateChipField(
                        "industry",
                        typeof v === "string" ? v : (v[0] ?? ""),
                      )
                    }
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <ChipSelect
                      label="Fatturato"
                      options={REVENUE_OPTIONS}
                      value={form.revenue}
                      onChange={(v) =>
                        updateChipField(
                          "revenue",
                          typeof v === "string" ? v : (v[0] ?? ""),
                        )
                      }
                    />
                    <ChipSelect
                      label="Numero dipendenti in azienda"
                      options={EMPLOYEES_OPTIONS}
                      value={form.employees_count}
                      onChange={(v) =>
                        updateChipField(
                          "employees_count",
                          typeof v === "string" ? v : (v[0] ?? ""),
                        )
                      }
                    />
                  </div>
                  <ChipSelect
                    label="Settori dove operano i clienti"
                    options={INDUSTRY_OPTIONS}
                    value={form.customer_sectors}
                    onChange={(v) =>
                      updateListField(
                        "customer_sectors",
                        Array.isArray(v) ? v : v ? [v] : [],
                      )
                    }
                    multi
                  />
                  <ChipSelect
                    label="Quali tecnologie hai implementato nella tua azienda"
                    options={TECHNOLOGY_OPTIONS}
                    value={form.implemented_technologies}
                    onChange={(v) =>
                      updateListField(
                        "implemented_technologies",
                        Array.isArray(v) ? v : v ? [v] : [],
                      )
                    }
                    multi
                  />
                </div>
              </div>

              {showNetworkFields && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-sm font-semibold mb-3">Rete</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {renderField("primary_domain", "Dominio Primario")}
                      {renderField("primary_subnet", "IP Primario")}
                      {renderField("secondary_domain", "Dominio Secondario")}
                      {renderField("secondary_subnet", "IP Secondario")}
                    </div>

                    {isExtendedLicense && (
                      <div className="mt-4 space-y-3">
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Domini aggiuntivi
                        </Label>
                        <div className="flex flex-col md:flex-row gap-2">
                          <Input
                            placeholder="Es. dominio.it, 203.0.113.10, 203.0.113.10-203.0.113.20, 203.0.113.0/24"
                            value={newScopeInput}
                            onChange={(e) => setNewScopeInput(e.target.value)}
                            disabled={scopeSaving}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
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
                            Regole attive: {scopeEntries.length}
                          </div>
                          {scopeEntries.length === 0 ? (
                            <div className="p-4 text-sm text-muted-foreground">
                              Nessuna regola configurata.
                            </div>
                          ) : (
                            <div className="divide-y divide-border">
                              {scopeEntries.map((entry) => (
                                <div
                                  key={entry.id}
                                  className="flex items-center justify-between px-3 py-2"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <Badge
                                      variant="outline"
                                      className="uppercase shrink-0"
                                    >
                                      {entry.kind}
                                    </Badge>
                                    <span className="text-sm font-medium truncate">
                                      {entry.input_value}
                                    </span>
                                    {entry.origin !== "anagrafica" && (
                                      <Badge
                                        variant="secondary"
                                        className="shrink-0 text-[10px]"
                                      >
                                        {entry.origin}
                                      </Badge>
                                    )}
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive shrink-0"
                                    disabled={scopeSaving}
                                    onClick={() => handleRemoveScopeEntry(entry.id)}
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
                  disabled={saveStatus === "saving"}
                >
                  {saveStatus === "saving" ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    "Salva ora"
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
const StringListField: React.FC<StringListFieldProps> = ({
  label,
  values,
  onChange,
  placeholder,
}) => {
  const [draft, setDraft] = React.useState("");
  const add = () => {
    const v = draft.trim();
    if (!v || values.includes(v)) return;
    onChange([...values, v]);
    setDraft("");
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
            if (e.key === "Enter" || e.key === ",") {
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
            <Badge
              key={`${v}-${idx}`}
              variant="secondary"
              className="gap-1 pr-1"
            >
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
