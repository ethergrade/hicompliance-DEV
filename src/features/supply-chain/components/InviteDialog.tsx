import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Copy } from "lucide-react";
import type { Supplier } from "../api";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  supplier: Supplier | null;
  onDone: () => void;
}

export function InviteDialog({ open, onOpenChange, supplier, onDone }: Props) {
  const [email, setEmail] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState<"email" | "link" | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setEmail(supplier?.email ?? "");
      setDue(supplier?.assessment_due_at?.slice(0, 10) ?? new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10));
      setLink(null);
    }
  }, [open, supplier]);

  const send = async (mode: "email" | "link") => {
    if (!supplier) return;
    setBusy(mode);
    const { data, error } = await supabase.functions.invoke("supply-chain-invite", {
      body: { supplier_id: supplier.id, email, mode, due_at: due ? new Date(due).toISOString() : null, redirect_origin: window.location.origin },
    });
    setBusy(null);
    let msg = data?.error as string | undefined;
    if (error) {
      try { msg = (await (error as { context?: Response }).context?.json())?.error ?? msg; } catch { /* ignore */ }
    }
    if (error || data?.error) return toast({ title: "Invito non riuscito", description: msg ?? "Riprova", variant: "destructive" });
    onDone();
    if (mode === "link" && data?.link) {
      setLink(data.link);
    } else {
      toast({ title: "Invito inviato", description: `Email inviata a ${email}` });
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invita fornitore</DialogTitle>
          <DialogDescription>{supplier?.supplier_name}</DialogDescription>
        </DialogHeader>
        {link ? (
          <div className="space-y-2">
            <p className="text-sm">Copia il link ora: non verrà mostrato di nuovo.</p>
            <div className="flex gap-2">
              <Input readOnly value={link} className="text-xs" />
              <Button size="icon" variant="outline" onClick={() => { navigator.clipboard.writeText(link); toast({ title: "Link copiato" }); }}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Email destinatario</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Scadenza assessment</Label>
              <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
          </div>
        )}
        <DialogFooter>
          {link ? (
            <Button onClick={() => onOpenChange(false)}>Chiudi</Button>
          ) : (
            <>
              <Button variant="outline" disabled={!!busy || !email} onClick={() => send("link")}>{busy === "link" ? "Generazione…" : "Genera link"}</Button>
              <Button disabled={!!busy || !email} onClick={() => send("email")}>{busy === "email" ? "Invio…" : "Invia email"}</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
