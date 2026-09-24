import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ASSESSMENT_LABEL, CRITICALITY_LABEL, DISCLAIMER, PORTAL_LABEL, listQuestions, riskBand, sb,
  type Answer, type Assessment, type Supplier,
} from "../api";
import { TechProfileForm } from "./TechProfileForm";
import { AssessmentForm } from "./AssessmentForm";

const ACTION_LABEL: Record<string, string> = {
  supplier_created: "Fornitore creato", supplier_updated: "Anagrafica modificata", supplier_invited: "Invito inviato",
  account_activated: "Account fornitore attivato", assessment_submitted: "Assessment inviato", assessment_reopened: "Assessment riaperto",
  supplier_suspended: "Accesso sospeso", supplier_reactivated: "Accesso riattivato", supplier_archived: "Fornitore archiviato",
};

export function SupplierDetailSheet({ supplier, open, onOpenChange }: { supplier: Supplier | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const id = supplier?.id;
  const { data, isLoading } = useQuery({
    queryKey: ["sc-detail", id],
    enabled: !!id && open,
    queryFn: async () => {
      const [profile, assessments, questions, gaps, logs] = await Promise.all([
        sb.from("supplier_technology_profiles").select("*").eq("supplier_id", id).maybeSingle(),
        sb.from("supplier_assessments").select("*").eq("supplier_id", id).order("created_at", { ascending: false }),
        listQuestions(),
        sb.rpc("sc_supplier_gaps", { _supplier: id }),
        sb.from("supply_chain_audit_log").select("*").eq("supplier_id", id).order("created_at", { ascending: false }).limit(50),
      ]);
      const latest: Assessment | undefined = assessments.data?.[0];
      let answers: Record<string, Answer> = {};
      if (latest) {
        const { data: a } = await sb.from("supplier_assessment_answers").select("question_id, answer").eq("assessment_id", latest.id);
        answers = Object.fromEntries((a ?? []).map((r: { question_id: string; answer: Answer }) => [r.question_id, r.answer]));
      }
      return { profile: profile.data ?? {}, latest, questions, answers, gaps: gaps.data ?? [], logs: logs.data ?? [] };
    },
  });

  if (!supplier) return null;
  const band = riskBand(data?.latest?.score);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{supplier.supplier_name}</SheetTitle>
          <SheetDescription>{supplier.category ?? "—"} · Criticità {CRITICALITY_LABEL[supplier.criticality]}</SheetDescription>
        </SheetHeader>
        {isLoading || !data ? <Skeleton className="h-64 mt-6" /> : (
          <Tabs defaultValue="overview" className="mt-4">
            <TabsList className="flex flex-wrap h-auto gap-1 p-1">
              <TabsTrigger value="overview" className="text-xs">Panoramica</TabsTrigger>
              <TabsTrigger value="tech" className="text-xs">Consistenze e tecnologie</TabsTrigger>
              <TabsTrigger value="assessment" className="text-xs">Assessment light</TabsTrigger>
              <TabsTrigger value="gaps" className="text-xs">Gap e azioni</TabsTrigger>
              <TabsTrigger value="history" className="text-xs">Cronologia</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Referente", supplier.contact_name], ["Email", supplier.email], ["Telefono", supplier.phone],
                  ["Sito", supplier.website], ["P.IVA / CF", supplier.vat_number], ["Paese", supplier.country],
                  ["Stato portale", PORTAL_LABEL[supplier.status]],
                  ["Stato assessment", data.latest ? ASSESSMENT_LABEL[data.latest.status] : "—"],
                  ["Scadenza", supplier.assessment_due_at ? new Date(supplier.assessment_due_at).toLocaleDateString("it-IT") : "—"],
                ].map(([l, v]) => (
                  <div key={l as string}><p className="text-xs text-muted-foreground">{l}</p><p className="truncate">{v || "—"}</p></div>
                ))}
              </div>
              {supplier.service_description && <p className="text-sm text-muted-foreground">{supplier.service_description}</p>}
              <Card><CardContent className="p-4 flex items-center gap-4">
                <div className="text-3xl font-bold">{data.latest?.score ?? "—"}</div>
                <div><Badge className={band.tone} variant="outline">{band.label}</Badge><p className="text-xs text-muted-foreground mt-1">{DISCLAIMER}</p></div>
              </CardContent></Card>
              {supplier.notes && <div><p className="text-xs text-muted-foreground">Note interne</p><p className="text-sm">{supplier.notes}</p></div>}
            </TabsContent>
            <TabsContent value="tech">
              {Object.keys(data.profile).length === 0 ? <p className="text-sm text-muted-foreground">Il fornitore non ha ancora compilato il profilo.</p>
                : <TechProfileForm value={data.profile} readOnly />}
            </TabsContent>
            <TabsContent value="assessment" className="space-y-3">
              {data.latest ? (
                <>
                  <p className="text-xs text-muted-foreground">Avanzamento {data.latest.progress_percent}% · {ASSESSMENT_LABEL[data.latest.status]}</p>
                  <AssessmentForm questions={data.questions} answers={data.answers} readOnly />
                </>
              ) : <p className="text-sm text-muted-foreground">Nessun assessment avviato.</p>}
            </TabsContent>
            <TabsContent value="gaps" className="space-y-2">
              {data.gaps.length === 0 ? <p className="text-sm text-muted-foreground">Nessun gap rilevato o assessment non ancora inviato.</p> :
                data.gaps.map((g: { rule_code: string; gap_title: string; neutral_action: string; priority: string }) => (
                  <div key={g.rule_code} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{g.gap_title}</p>
                      <Badge variant={g.priority === "high" ? "destructive" : "secondary"}>{g.priority === "high" ? "Alta" : g.priority === "medium" ? "Media" : "Bassa"}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{g.neutral_action}</p>
                  </div>
                ))}
            </TabsContent>
            <TabsContent value="history" className="space-y-2">
              {data.logs.length === 0 ? <p className="text-sm text-muted-foreground">Nessuna attività.</p> :
                data.logs.map((l: { id: string; action: string; created_at: string; actor_kind: string }) => (
                  <div key={l.id} className="flex justify-between text-sm border-b py-2">
                    <span>{ACTION_LABEL[l.action] ?? l.action}</span>
                    <span className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString("it-IT")}</span>
                  </div>
                ))}
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}
