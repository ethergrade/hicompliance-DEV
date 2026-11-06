import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Resend } from "npm:resend@2.0.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const fmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("it-IT");

async function send(to: string, doc: any, kind: "set" | "due") {
  const overdue = new Date(doc.review_due_date) < new Date(new Date().toDateString());
  const subject = kind === "set"
    ? `Promemoria impostato: ${doc.name} da revisionare il ${fmt(doc.review_due_date)}`
    : `${overdue ? "[SCADUTO]" : "[IN SCADENZA]"} Revisione documento: ${doc.name}`;
  const html = `<p>Documento: <b>${doc.name}</b>${doc.document_code ? ` (${doc.document_code})` : ""}</p>
<p>Da revisionare o controllare il: <b>${fmt(doc.review_due_date)}</b></p>
<p>Categoria: ${doc.category} · Stato: ${doc.status}</p>
<p><a href="https://hicompliance.it/documents">Apri Gestione Documentale</a></p>`;
  await resend.emails.send({ from: "HiCompliance <noreply@resend.dev>", to: [to], subject, html });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    let sent = 0;

    if (body.documentId) {
      // Verify the caller can see this document through RLS before emailing.
      const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      });
      const { data: doc } = await userClient.from("incident_documents")
        .select("id,name,document_code,category,status,review_due_date,review_notify_email").eq("id", body.documentId).maybeSingle();
      if (!doc?.review_due_date || !doc.review_notify_email) return new Response(JSON.stringify({ sent: 0 }), { headers: { ...cors, "Content-Type": "application/json" } });
      await send(doc.review_notify_email, doc, "set");
      return new Response(JSON.stringify({ sent: 1 }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // Sweep: documents due within 7 days (or overdue) not yet reminded today.
    const limit = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const dayAgo = new Date(Date.now() - 86400000).toISOString();
    const { data: docs, error } = await admin.from("incident_documents")
      .select("id,name,document_code,category,status,review_due_date,review_notify_email,review_notified_at")
      .not("review_due_date", "is", null).not("review_notify_email", "is", null)
      .lte("review_due_date", limit)
      .or(`review_notified_at.is.null,review_notified_at.lt.${dayAgo}`).limit(200);
    if (error) throw error;
    for (const d of docs ?? []) {
      try {
        await send(d.review_notify_email, d, "due");
        await admin.from("incident_documents").update({ review_notified_at: new Date().toISOString() }).eq("id", d.id);
        sent++;
      } catch (e) { console.error("send failed", d.id, e); }
    }
    return new Response(JSON.stringify({ sent }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
