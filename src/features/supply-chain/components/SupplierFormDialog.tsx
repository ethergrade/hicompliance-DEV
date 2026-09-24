import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { audit, CRITICALITY_LABEL, sb, type Supplier } from "../api";
import { supabase } from "@/integrations/supabase/client";

const EMPTY = {
  supplier_name: "", vat_number: "", category: "", service_description: "", criticality: "medium",
  contact_name: "", email: "", phone: "", website: "", country: "IT", notes: "",
};

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  organizationId: string;
  supplier?: Supplier | null;
  onSaved: () => void;
}

export function SupplierFormDialog({ open, onOpenChange, organizationId, supplier, onSaved }: Props) {
  const [form, setForm] = useState<Record<string, string>>(EMPTY);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    setForm(supplier ? Object.fromEntries(Object.keys(EMPTY).map((k) => [k, (supplier as unknown as Record<string, string>)[k] ?? ""])) : EMPTY);
  }, [open, supplier]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.supplier_name.trim()) return toast({ title: "Ragione sociale obbligatoria", variant: "destructive" });
    if (form.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) return toast({ title: "Email non valida", variant: "destructive" });
    setSaving(true);
    const payload = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim() === "" ? null : v.trim()]));
    payload.supplier_name = form.supplier_name.trim();
    payload.criticality = form.criticality;
    payload.service_type = payload.category;
    let error;
    if (supplier) {
      ({ error } = await sb.from("supplier_directory").update(payload).eq("id", supplier.id));
      if (!error) await audit(organizationId, supplier.id, "supplier_updated");
    } else {
      const { data: u } = await supabase.auth.getUser();
      const res = await sb.from("supplier_directory").insert({ ...payload, organization_id: organizationId, created_by: u.user?.id }).select("id").single();
      error = res.error;
      if (!error) await audit(organizationId, res.data.id, "supplier_created");
    }
    setSaving(false);
    if (error) {
      return toast({ title: "Salvataggio non riuscito", description: error.code === "23505" ? "Esiste già un fornitore con questo nome" : error.message, variant: "destructive" });
    }
    toast({ title: supplier ? "Fornitore aggiornato" : "Fornitore creato" });
    onOpenChange(false);
    onSaved();
  };

  const field = (k: string, label: string, props: Record<string, unknown> = {}) => (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input value={form[k]} onChange={(e) => set(k, e.target.value)} {...props} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{supplier ? "Modifica fornitore" : "Nuovo fornitore"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("supplier_name", "Ragione sociale *")}
          {field("vat_number", "Partita IVA / Codice fiscale")}
          {field("category", "Categoria servizio")}
          <div className="space-y-1.5">
            <Label className="text-xs">Criticità</Label>
            <Select value={form.criticality} onValueChange={(v) => set("criticality", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(CRITICALITY_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label className="text-xs">Descrizione servizio fornito</Label>
            <Textarea value={form.service_description} onChange={(e) => set("service_description", e.target.value)} />
          </div>
          {field("contact_name", "Referente")}
          {field("email", "Email referente", { type: "email" })}
          {field("phone", "Telefono")}
          {field("website", "Sito web")}
          {field("country", "Paese")}
          <div className="sm:col-span-2 space-y-1.5">
            <Label className="text-xs">Note interne (non visibili al fornitore)</Label>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvataggio…" : "Salva"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
