import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MODEL_LABEL, TECH_FIELDS, type TechProfile } from "../api";

interface Props {
  value: Partial<TechProfile>;
  onChange?: (key: string, v: unknown) => void;
  readOnly?: boolean;
  only?: "counts" | "tech";
}

const COUNT_KEYS = new Set(TECH_FIELDS.filter((f) => f.kind === "int").map((f) => f.key).concat(["handles_sensitive_data", "accesses_customer_systems"]));

export function TechProfileForm({ value, onChange, readOnly, only }: Props) {
  const fields = TECH_FIELDS.filter((f) => !only || (only === "counts" ? COUNT_KEYS.has(f.key) : !COUNT_KEYS.has(f.key)));
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((f) => {
        const v = value[f.key];
        return (
          <div key={f.key} className={f.key === "supplier_notes" ? "sm:col-span-2 space-y-1.5" : "space-y-1.5"}>
            <Label className="text-xs text-muted-foreground">{f.label}</Label>
            {f.kind === "int" && (
              <Input type="number" min={0} disabled={readOnly} value={v == null ? "" : String(v)}
                onChange={(e) => onChange?.(f.key, e.target.value === "" ? null : Math.max(0, parseInt(e.target.value, 10) || 0))} />
            )}
            {f.kind === "bool" && (
              <div className="flex gap-1">
                {[{ l: "Sì", v: true }, { l: "No", v: false }].map((o) => (
                  <Button key={o.l} type="button" size="sm" disabled={readOnly}
                    variant={v === o.v ? "default" : "outline"} onClick={() => onChange?.(f.key, v === o.v ? null : o.v)}>
                    {o.l}
                  </Button>
                ))}
              </div>
            )}
            {f.kind === "model" && (
              <Select disabled={readOnly} value={(v as string) ?? ""} onValueChange={(x) => onChange?.(f.key, x)}>
                <SelectTrigger><SelectValue placeholder="Seleziona" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(MODEL_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {f.kind === "text" && (f.key === "supplier_notes" ? (
              <Textarea disabled={readOnly} value={(v as string) ?? ""} onChange={(e) => onChange?.(f.key, e.target.value)} />
            ) : (
              <Input disabled={readOnly} value={(v as string) ?? ""} onChange={(e) => onChange?.(f.key, e.target.value)} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
