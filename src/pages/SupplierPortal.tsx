import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Truck, LogOut, Eye, Download, Building2 } from "lucide-react";
import { jsPDF } from "jspdf";
import { useUserRoles } from "@/hooks/useUserRoles";
import { DISCLAIMER, listQuestions, riskBand, sb, type Answer, type Assessment, type Question } from "@/features/supply-chain/api";
import { TechProfileForm } from "@/features/supply-chain/components/TechProfileForm";
import { AssessmentForm } from "@/features/supply-chain/components/AssessmentForm";
import { SupplierRecommendations } from "@/features/supply-chain/components/SupplierRecommendations";
import type { SupplierRec } from "@/features/supply-chain/recommendations";

type Ctx = { supplier_id: string; supplier_name: string; organization_name: string; assessment_due_at: string | null; must_change_password: boolean; preview?: boolean };

function Shell({ children, ctx }: { children: React.ReactNode; ctx?: Ctx | null }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold min-w-0">
            <Truck className="h-5 w-5 shrink-0" />
            <span className="truncate">Portale Fornitori{ctx ? ` · ${ctx.organization_name}` : ""}</span>
          </div>
          {ctx?.preview ? (
            <Button size="sm" variant="outline" onClick={() => window.close()}>Chiudi anteprima</Button>
          ) : ctx && (
            <Button size="sm" variant="ghost" onClick={async () => { await supabase.auth.signOut(); navigate("/supplier-portal/login"); }}>
              <LogOut className="h-4 w-4 mr-1" />Esci
            </Button>
          )}
        </div>
      </header>
      {ctx?.preview && (
        <div className="bg-primary text-primary-foreground text-sm">
          <div className="max-w-4xl mx-auto px-4 py-2 flex items-center gap-2"><Eye className="h-4 w-4" />Anteprima Super Admin: stai vedendo il portale come {ctx.supplier_name}. Sola lettura, nessuna modifica viene salvata.</div>
        </div>
      )}
      {ctx && (
        <div className="border-b bg-muted/40">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-start gap-3 text-sm">
            <Building2 className="h-5 w-5 mt-0.5 text-primary shrink-0" />
            <p><span className="font-semibold">{ctx.organization_name}</span> gestisce questo programma di valutazione della filiera. Le informazioni che fornisci sono condivise solo con {ctx.organization_name} per valutare la sicurezza della sua catena di fornitura.</p>
          </div>
        </div>
      )}
      <main className="max-w-4xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}

function useSession() {
  const [state, setState] = useState<{ loading: boolean; userId: string | null }>({ loading: true, userId: null });
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setState({ loading: false, userId: s?.user?.id ?? null }));
    supabase.auth.getSession().then(({ data }) => setState({ loading: false, userId: data.session?.user?.id ?? null }));
    return () => subscription.unsubscribe();
  }, []);
  return state;
}

function Login() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
    setBusy(false);
    if (error) return toast({ title: "Accesso non riuscito", description: "Credenziali non valide", variant: "destructive" });
    navigate("/supplier-portal/home");
  };
  return (
    <Shell>
      <Card className="max-w-md mx-auto">
        <CardHeader><CardTitle>Accedi</CardTitle><CardDescription>Area riservata ai fornitori invitati</CardDescription></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Password</Label><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
            <Button type="submit" className="w-full" disabled={busy}>{busy ? "Accesso…" : "Accedi"}</Button>
          </form>
        </CardContent>
      </Card>
    </Shell>
  );
}

const PW_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$/;

function Activate({ ctx, onDone }: { ctx: Ctx; onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!PW_RULE.test(pw)) return toast({ title: "Password non valida", description: "Minimo 10 caratteri con maiuscola, minuscola, numero e simbolo", variant: "destructive" });
    if (pw !== pw2) return toast({ title: "Le password non coincidono", variant: "destructive" });
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) { setBusy(false); return toast({ title: "Errore", description: error.message, variant: "destructive" }); }
    const { error: e2 } = await sb.rpc("sc_activate_supplier_account");
    setBusy(false);
    if (e2) return toast({ title: "Errore di attivazione", description: e2.message, variant: "destructive" });
    toast({ title: "Account attivato" });
    onDone();
  };
  return (
    <Shell ctx={ctx}>
      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Attiva il tuo account</CardTitle>
          <CardDescription>{ctx.organization_name} ha richiesto a {ctx.supplier_name} di compilare un breve profilo di sicurezza.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5"><Label>Nuova password</Label><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Conferma password</Label><Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
            <p className="text-xs text-muted-foreground">Minimo 10 caratteri, con una maiuscola, una minuscola, un numero e un simbolo.</p>
            <Button type="submit" className="w-full" disabled={busy}>{busy ? "Attivazione…" : "Attiva account"}</Button>
          </form>
        </CardContent>
      </Card>
    </Shell>
  );
}

const STEPS = ["Azienda", "Consistenze", "Tecnologie e gestione IT", "Assessment light", "Riepilogo e invio"];

function Wizard({ ctx, initialStep }: { ctx: Ctx; initialStep: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [step, setStep] = useState(initialStep);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [profile, setProfile] = useState<Record<string, unknown>>({});
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const pending = useRef<Record<string, unknown>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["portal", ctx.supplier_id],
    queryFn: async () => {
      let aid: string | null = null;
      if (ctx.preview) {
        const { data: last } = await sb.from("supplier_assessments").select("id").eq("supplier_id", ctx.supplier_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
        aid = last?.id ?? null;
      } else {
        const { data: id, error } = await sb.rpc("sc_start_assessment");
        if (error) throw error;
        aid = id;
      }
      if (!aid) {
        const [p, qs] = await Promise.all([
          sb.from("supplier_technology_profiles").select("*").eq("supplier_id", ctx.supplier_id).maybeSingle(),
          listQuestions(),
        ]);
        return { assessment: { id: "", status: "not_started", score: null } as unknown as Assessment, profile: p.data ?? {}, questions: qs as Question[], answers: {} as Record<string, Answer> };
      }
      const [a, p, qs, ans] = await Promise.all([
        sb.from("supplier_assessments").select("*").eq("id", aid).single(),
        sb.from("supplier_technology_profiles").select("*").eq("supplier_id", ctx.supplier_id).maybeSingle(),
        listQuestions(),
        sb.from("supplier_assessment_answers").select("question_id, answer").eq("assessment_id", aid),
      ]);
      return { assessment: a.data as Assessment, profile: p.data ?? {}, questions: qs as Question[], answers: Object.fromEntries((ans.data ?? []).map((r: { question_id: string; answer: Answer }) => [r.question_id, r.answer])) };
    },
  });

  useEffect(() => { if (data) { setProfile(data.profile); setAnswers(data.answers); } }, [data]);
  const submitted = data?.assessment?.status === "submitted" || data?.assessment?.status === "expired";
  const readOnly = submitted || !!ctx.preview;
  const { data: myRecs = [] } = useQuery({
    queryKey: ["portal-recs", ctx.supplier_id, data?.assessment?.status],
    enabled: !!data,
    queryFn: async () => {
      const { data: r, error } = ctx.preview
        ? await sb.rpc("sc_supplier_gaps", { _supplier: ctx.supplier_id })
        : await sb.rpc("sc_my_recommendations");
      if (error) throw error;
      return (r ?? []) as SupplierRec[];
    },
  });

  const flushProfile = useCallback(async () => {
    const patch = pending.current; pending.current = {};
    if (ctx.preview) return;
    if (!Object.keys(patch).length) return;
    setSaveState("saving");
    const { error } = await sb.from("supplier_technology_profiles").upsert({ supplier_id: ctx.supplier_id, ...patch }, { onConflict: "supplier_id" });
    setSaveState(error ? "error" : "saved");
  }, [ctx.supplier_id]);

  const onProfile = (k: string, v: unknown) => {
    setProfile((p) => ({ ...p, [k]: v }));
    pending.current[k] = v;
    clearTimeout(timer.current);
    timer.current = setTimeout(flushProfile, 800);
    if (k === "mobile_devices_count" && v === 0 && data) {
      const q = data.questions.find((x) => x.code === "SC12");
      if (q) onAnswer(q.id, "na");
    }
  };

  const onAnswer = async (qid: string, a: Answer) => {
    if (!data || ctx.preview) return;
    setAnswers((s) => ({ ...s, [qid]: a }));
    setSaveState("saving");
    const { data: u } = await supabase.auth.getUser();
    const { error } = await sb.from("supplier_assessment_answers").upsert({ assessment_id: data.assessment.id, question_id: qid, answer: a, answered_by: u.user?.id }, { onConflict: "assessment_id,question_id" });
    if (!error) await sb.rpc("sc_update_progress", { _a: data.assessment.id });
    setSaveState(error ? "error" : "saved");
  };

  const submit = async () => {
    if (!data || ctx.preview) return;
    await flushProfile();
    const { data: res, error } = await sb.rpc("sc_submit_assessment", { _a: data.assessment.id });
    if (error) {
      const m = /missing_answers:(\d+)/.exec(error.message);
      return toast({ title: "Invio non riuscito", description: m ? `Mancano ${m[1]} risposte` : error.message, variant: "destructive" });
    }
    toast({ title: "Assessment inviato", description: `Punteggio ${res?.score}` });
    qc.invalidateQueries({ queryKey: ["portal", ctx.supplier_id] });
    navigate("/supplier-portal/home");
  };

  if (isLoading || !data) return <Shell ctx={ctx}><p className="text-sm text-muted-foreground">Caricamento…</p></Shell>;
  const answered = data.questions.filter((q) => answers[q.id]).length;
  const band = riskBand(data.assessment.score);

  return (
    <Shell ctx={ctx}>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold">{ctx.supplier_name}</h1>
          <p className="text-sm text-muted-foreground">Richiesto da {ctx.organization_name}{ctx.assessment_due_at ? ` · scadenza ${new Date(ctx.assessment_due_at).toLocaleDateString("it-IT")}` : ""}</p>
        </div>
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={() => downloadReport(ctx, data.assessment.score, answered, data.questions.length, myRecs)}>
            <Download className="h-4 w-4 mr-1" />Scarica report PDF
          </Button>
        </div>
        {submitted && (
          <Card><CardContent className="p-4 flex items-center gap-4">
            <div className="text-3xl font-bold">{data.assessment.score}</div>
            <div><Badge variant="outline" className={band.tone}>{band.label}</Badge><p className="text-xs text-muted-foreground mt-1">Assessment inviato: i dati sono in sola lettura finché {ctx.organization_name} non lo riapre. {DISCLAIMER}</p></div>
          </CardContent></Card>
        )}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Completamento assessment {Math.round((answered / Math.max(1, data.questions.length)) * 100)}%</span>
            <span>{saveState === "saving" ? "Salvataggio…" : saveState === "saved" ? "Salvato" : saveState === "error" ? "Errore di salvataggio" : ""}</span>
          </div>
          <Progress value={(answered / Math.max(1, data.questions.length)) * 100} className="h-2" />
        </div>
        <div className="flex flex-wrap gap-1">
          {STEPS.map((s, i) => <Button key={s} size="sm" variant={i === step ? "default" : "outline"} onClick={() => setStep(i)}>{i + 1}. {s}</Button>)}
        </div>
        <Card><CardContent className="p-5">
          {step === 0 && (
            <div className="space-y-2 text-sm">
              <p><span className="text-muted-foreground">Fornitore:</span> {ctx.supplier_name}</p>
              <p><span className="text-muted-foreground">Cliente richiedente:</span> {ctx.organization_name}</p>
              <p className="text-muted-foreground">Compila consistenze, tecnologie e le 20 domande dell'assessment. Ogni modifica viene salvata automaticamente.</p>
            </div>
          )}
          {step === 1 && <TechProfileForm value={profile} onChange={onProfile} readOnly={readOnly} only="counts" />}
          {step === 2 && <TechProfileForm value={profile} onChange={onProfile} readOnly={readOnly} only="tech" />}
          {step === 3 && <AssessmentForm questions={data.questions} answers={answers} onAnswer={onAnswer} readOnly={readOnly} />}
          {step === 4 && (
            <div className="space-y-4">
              <p className="text-sm">Risposte date: {answered} di {data.questions.length}.</p>
              {answered < data.questions.length && <p className="text-sm text-destructive">Rispondi a tutte le domande prima di inviare. "Non applicabile" vale come risposta.</p>}
              <p className="text-xs text-muted-foreground">{DISCLAIMER}</p>
              {!readOnly && <Button onClick={submit} disabled={answered < data.questions.length}>Invia assessment</Button>}
            </div>
          )}
        </CardContent></Card>
        <div className="flex justify-between">
          <Button variant="outline" disabled={step === 0} onClick={() => setStep(step - 1)}>Indietro</Button>
          <Button disabled={step === STEPS.length - 1} onClick={() => setStep(step + 1)}>Avanti</Button>
        </div>
      </div>
    </Shell>
  );
}

function downloadReport(ctx: Ctx, score: number | null, answered: number, total: number, recs: SupplierRec[]) {
  const doc = new jsPDF();
  let y = 18;
  const line = (t: string, size = 10, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size);
    for (const l of doc.splitTextToSize(t, 180) as string[]) { if (y > 280) { doc.addPage(); y = 18; } doc.text(l, 15, y); y += size * 0.5 + 1; }
  };
  line(`Programma di valutazione filiera di ${ctx.organization_name}`, 9);
  line(`Report fornitore: ${ctx.supplier_name}`, 16, true); y += 2;
  line(`Data: ${new Date().toLocaleDateString("it-IT")}`);
  line(`Punteggio: ${score ?? "non disponibile"}   ·   Risposte: ${answered}/${total}`); y += 4;
  line("Raccomandazioni", 13, true);
  if (!recs.length) line("Nessuna raccomandazione disponibile.");
  const pr: Record<string, string> = { high: "Alta", medium: "Media", low: "Bassa" };
  recs.forEach((r, i) => {
    y += 2; line(`${i + 1}. ${r.gap_title} [Priorità ${pr[r.priority] ?? r.priority}]`, 11, true);
    line(`Azione: ${r.neutral_action}`);
    if (r.rationale) line(`Motivo: ${r.rationale}`, 9);
  });
  y += 4; line(DISCLAIMER, 8);
  doc.save(`report-fornitore-${ctx.supplier_name.replace(/\W+/g, "-").toLowerCase()}.pdf`);
}

function PreviewPortal({ supplierId, initialStep }: { supplierId: string; initialStep: number }) {
  const { isSuperAdmin, loading } = useUserRoles();
  const { data: ctx, isLoading } = useQuery({
    queryKey: ["portal-preview", supplierId],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data: s, error } = await sb.from("supplier_directory").select("id, supplier_name, organization_id, assessment_due_at").eq("id", supplierId).single();
      if (error) throw error;
      const { data: o } = await supabase.from("organizations").select("name").eq("id", s.organization_id).maybeSingle();
      return { supplier_id: s.id, supplier_name: s.supplier_name, organization_name: o?.name ?? "Azienda committente", assessment_due_at: s.assessment_due_at ?? null, must_change_password: false, preview: true } as Ctx;
    },
  });
  if (loading || (isSuperAdmin && isLoading)) return <Shell><p className="text-sm text-muted-foreground">Caricamento…</p></Shell>;
  if (!isSuperAdmin || !ctx) return <Shell><p className="text-sm text-muted-foreground">Anteprima disponibile solo per Super Admin.</p></Shell>;
  return <Wizard ctx={ctx} initialStep={initialStep} />;
}

export default function SupplierPortal() {
  const location = useLocation();
  const path = location.pathname.replace(/\/$/, "");
  const previewId = new URLSearchParams(location.search).get("preview");
  if (previewId) return <PreviewPortal supplierId={previewId} initialStep={0} />;
  return <SupplierPortalSession />;
}

function SupplierPortalSession() {
  const location = useLocation();
  const path = location.pathname.replace(/\/$/, "");
  const { loading, userId } = useSession();
  const { data: ctx, isLoading, refetch } = useQuery({
    queryKey: ["portal-ctx", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await sb.rpc("sc_portal_context");
      if (error) throw error;
      return (data ?? null) as Ctx | null;
    },
  });

  if (path.endsWith("/login") && !userId && !loading) return <Login />;
  if (loading || (userId && isLoading)) return <Shell><p className="text-sm text-muted-foreground">Caricamento…</p></Shell>;
  if (!userId) {
    // Link di invito: la sessione arriva dall'URL, attendi
    if (location.hash.includes("access_token")) return <Shell><p className="text-sm text-muted-foreground">Verifica invito…</p></Shell>;
    return <Navigate to="/supplier-portal/login" replace />;
  }
  if (!ctx) {
    return (
      <Shell>
        <Card className="max-w-md mx-auto"><CardContent className="p-6 space-y-3 text-center">
          <p className="font-medium">Accesso non consentito</p>
          <p className="text-sm text-muted-foreground">Questo account non è abilitato al portale fornitori, oppure l'accesso è stato sospeso.</p>
          <Button variant="outline" onClick={async () => { await supabase.auth.signOut(); }}>Esci</Button>
        </CardContent></Card>
      </Shell>
    );
  }
  if (ctx.must_change_password) return <Activate ctx={ctx} onDone={() => refetch()} />;
  if (path.endsWith("/activate") || path.endsWith("/login") || path === "/supplier-portal") return <Navigate to="/supplier-portal/home" replace />;
  const stepByPath: Record<string, number> = { home: 0, profile: 1, assessment: 3, review: 4 };
  const last = path.split("/").pop() ?? "home";
  return <Wizard ctx={ctx} initialStep={stepByPath[last] ?? 0} />;
}
